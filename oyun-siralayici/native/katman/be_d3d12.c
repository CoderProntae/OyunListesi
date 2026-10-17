/* D3D12 arka ucu (Little Nightmares III gibi UE oyunları bu yolu kullanır).
 *
 * D3D12'de kalıcı durum yoktur: çizim komutları bir komut listesine kaydedilir
 * ve OYUNUN KENDİ KUYRUĞUNDA, Present'ten hemen önce yürütülür. Kuyruk,
 * ID3D12CommandQueue::ExecuteCommandLists kancasıyla yakalanır — kendi
 * kuyruğumuzda göndermek sıralama garantisi vermez (çizim atlanır), bu yüzden
 * oyunun kuyruğu kullanılır.
 *
 * Oyunun kaynaklarına dokunmuyoruz: kendi ayırıcı/liste/yığın/çit nesnelerimiz
 * var; oyunun arka tamponuna yalnız o kare için RTV oluşturuluyor ve durum
 * geçişleri (PRESENT ↔ RENDER_TARGET) geri alınıyor. */
#include "katman.h"
#include <d3dcompiler.h>
#include <stdlib.h>
#include <string.h>

#define UPLOAD_SIZE (6u << 20)
#define RING_FRAMES 3

extern const char kat_hlsl_vs[];
extern const char kat_hlsl_ps[];

typedef struct {
  kbackend be;
  ID3D12Device *dev;
  ID3D12CommandQueue *queue;
  ID3D12CommandAllocator *alloc;
  ID3D12GraphicsCommandList *list;
  ID3D12RootSignature *rootsig;
  ID3D12PipelineState *pso;
  DXGI_FORMAT rtvFormat;
  ID3DBlob *vsb, *psb;
  ID3D12DescriptorHeap *rtvHeap;
  ID3D12DescriptorHeap *srvHeap;
  D3D12_CPU_DESCRIPTOR_HANDLE rtvHandle;
  D3D12_CPU_DESCRIPTOR_HANDLE srvCpu;
  D3D12_GPU_DESCRIPTOR_HANDLE srvGpu;
  ID3D12Resource *atlas;
  ID3D12Resource *atlasUpload;
  uint8_t *atlasMap;
  D3D12_PLACED_SUBRESOURCE_FOOTPRINT atlasLayout;
  UINT64 atlasBytes;
  uint32_t atlasGen;
  ID3D12Resource *vb[RING_FRAMES];
  uint8_t *vbMap[RING_FRAMES];
  uint32_t ring;
  ID3D12Fence *fence;
  UINT64 fenceValue;
  ID3D12Resource *lastTarget;
  bool open;
  bool ok;
  int vpW, vpH;
} be12;

static HRESULT compile_blob(const char *src, const char *target, ID3DBlob **out) {
  static HRESULT(WINAPI * fn)
  (LPCVOID, SIZE_T, LPCSTR, const D3D_SHADER_MACRO *, ID3DInclude *, LPCSTR, LPCSTR, UINT, UINT, ID3DBlob **, ID3DBlob **) = NULL;
  if (!fn) {
    const wchar_t *names[] = {L"d3dcompiler_47.dll", L"d3dcompiler_46.dll", L"d3dcompiler_43.dll"};
    for (int i = 0; i < 3 && !fn; i++) {
      HMODULE m = LoadLibraryW(names[i]);
      if (m) fn = (void *)GetProcAddress(m, "D3DCompile");
    }
  }
  if (!fn) {
    KAT_LOG("d3dcompiler bulunamadi");
    return E_FAIL;
  }
  ID3DBlob *err = NULL;
  HRESULT hr = fn(src, strlen(src), "katman", NULL, NULL, "main", target, D3DCOMPILE_OPTIMIZATION_LEVEL1, 0, out, &err);
  if (FAILED(hr)) {
    if (err) {
      KAT_LOG("D3D12 shader derlenemedi (%s): %s", target, (const char *)ID3D10Blob_GetBufferPointer(err));
      ID3D10Blob_Release(err);
    }
  } else if (err)
    ID3D10Blob_Release(err);
  return hr;
}

static void wait_ring(be12 *b) {
  if (!b->fence) return;
  UINT64 target = b->fenceValue > RING_FRAMES ? b->fenceValue - RING_FRAMES : 0;
  if (target && ID3D12Fence_GetCompletedValue(b->fence) < target) {
    HANDLE ev = CreateEventW(NULL, FALSE, FALSE, NULL);
    if (ev) {
      ID3D12Fence_SetEventOnCompletion(b->fence, target, ev);
      WaitForSingleObject(ev, 50); /* oyunu asla uzun süre bekletme */
      CloseHandle(ev);
    }
  }
}

/* Arka tampon biçimi oyuna göre değişir (8 bit, 10 bit, HDR float). PSO bu
   biçimle uyuşmazsa çizim sessizce boşa gideceği için biçim ilk karede okunur
   ve PSO gerekirse yeniden kurulur. */
static bool ensure_pso(be12 *b, DXGI_FORMAT fmt) {
  if (b->pso && b->rtvFormat == fmt) return true;
  if (!b->vsb || !b->psb || !b->rootsig) return false;
  D3D12_GRAPHICS_PIPELINE_STATE_DESC pd;
  memset(&pd, 0, sizeof pd);
  pd.pRootSignature = b->rootsig;
  pd.VS.pShaderBytecode = ID3D10Blob_GetBufferPointer(b->vsb);
  pd.VS.BytecodeLength = ID3D10Blob_GetBufferSize(b->vsb);
  pd.PS.pShaderBytecode = ID3D10Blob_GetBufferPointer(b->psb);
  pd.PS.BytecodeLength = ID3D10Blob_GetBufferSize(b->psb);
  pd.BlendState.RenderTarget[0].BlendEnable = TRUE;
  pd.BlendState.RenderTarget[0].SrcBlend = D3D12_BLEND_SRC_ALPHA;
  pd.BlendState.RenderTarget[0].DestBlend = D3D12_BLEND_INV_SRC_ALPHA;
  pd.BlendState.RenderTarget[0].BlendOp = D3D12_BLEND_OP_ADD;
  pd.BlendState.RenderTarget[0].SrcBlendAlpha = D3D12_BLEND_ONE;
  pd.BlendState.RenderTarget[0].DestBlendAlpha = D3D12_BLEND_INV_SRC_ALPHA;
  pd.BlendState.RenderTarget[0].BlendOpAlpha = D3D12_BLEND_OP_ADD;
  pd.BlendState.RenderTarget[0].RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL;
  pd.SampleMask = UINT_MAX;
  pd.RasterizerState.FillMode = D3D12_FILL_MODE_SOLID;
  pd.RasterizerState.CullMode = D3D12_CULL_MODE_NONE;
  pd.RasterizerState.DepthClipEnable = FALSE;
  pd.InputLayout.NumElements = 3;
  static const D3D12_INPUT_ELEMENT_DESC ie[3] = {
      {"POSITION", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 0, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0},
      {"TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 8, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0},
      {"COLOR", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 0, 16, D3D12_INPUT_CLASSIFICATION_PER_VERTEX_DATA, 0}};
  pd.InputLayout.pInputElementDescs = ie;
  pd.PrimitiveTopologyType = D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE;
  pd.NumRenderTargets = 1;
  pd.RTVFormats[0] = fmt ? fmt : DXGI_FORMAT_R8G8B8A8_UNORM;
  pd.SampleDesc.Count = 1;
  ID3D12PipelineState *pso = NULL;
  HRESULT hr = ID3D12Device_CreateGraphicsPipelineState(b->dev, &pd, &IID_ID3D12PipelineState, (void **)&pso);
  if (FAILED(hr) || !pso) {
    KAT_LOG("D3D12 PSO olusturulamadi (bicim=%d) hr=0x%08lx", (int)fmt, (unsigned long)hr);
    return false;
  }
  if (b->pso) ID3D12PipelineState_Release(b->pso);
  b->pso = pso;
  b->rtvFormat = fmt;
  KAT_LOG("D3D12 PSO hazir (bicim=%d)", (int)fmt);
  return true;
}

static bool create_atlas12(be12 *b, const kfont *f) {
  if (!b->open) return false;
  if (b->atlas) {
    ID3D12Resource_Release(b->atlas);
    b->atlas = NULL;
  }
  if (b->atlasUpload) {
    ID3D12Resource_Release(b->atlasUpload);
    b->atlasUpload = NULL;
  }
  D3D12_HEAP_PROPERTIES hp;
  memset(&hp, 0, sizeof hp);
  hp.Type = D3D12_HEAP_TYPE_DEFAULT;
  D3D12_RESOURCE_DESC rd;
  memset(&rd, 0, sizeof rd);
  rd.Dimension = D3D12_RESOURCE_DIMENSION_TEXTURE2D;
  rd.Width = (UINT64)f->atlasW;
  rd.Height = (UINT)f->atlasH;
  rd.DepthOrArraySize = 1;
  rd.MipLevels = 1;
  rd.Format = DXGI_FORMAT_R8_UNORM;
  rd.SampleDesc.Count = 1;
  HRESULT hr = ID3D12Device_CreateCommittedResource(b->dev, &hp, D3D12_HEAP_FLAG_NONE, &rd, D3D12_RESOURCE_STATE_COPY_DEST,
                                                    NULL, &IID_ID3D12Resource, (void **)&b->atlas);
  if (FAILED(hr)) {
    KAT_LOG("D3D12 atlas dokusu olusturulamadi hr=0x%08lx", (unsigned long)hr);
    return false;
  }
  /* Yükleme kaynağı: satır düzenli TAM PON (doku değil) — standart kalıp. */
  ID3D12Device_GetCopyableFootprints(b->dev, &rd, 0, 1, 0, &b->atlasLayout, NULL, NULL, &b->atlasBytes);
  D3D12_HEAP_PROPERTIES up = hp;
  up.Type = D3D12_HEAP_TYPE_UPLOAD;
  D3D12_RESOURCE_DESC bd;
  memset(&bd, 0, sizeof bd);
  bd.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
  bd.Width = b->atlasBytes;
  bd.Height = 1;
  bd.DepthOrArraySize = 1;
  bd.MipLevels = 1;
  bd.Format = DXGI_FORMAT_UNKNOWN;
  bd.SampleDesc.Count = 1;
  bd.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  hr = ID3D12Device_CreateCommittedResource(b->dev, &up, D3D12_HEAP_FLAG_NONE, &bd, D3D12_RESOURCE_STATE_GENERIC_READ,
                                            NULL, &IID_ID3D12Resource, (void **)&b->atlasUpload);
  if (FAILED(hr)) {
    KAT_LOG("D3D12 atlas tamponu olusturulamadi hr=0x%08lx", (unsigned long)hr);
    return false;
  }
  void *p = NULL;
  D3D12_RANGE none = {0, 0};
  if (FAILED(ID3D12Resource_Map(b->atlasUpload, 0, &none, &p)) || !p) return false;
  b->atlasMap = (uint8_t *)p;
  UINT rp = b->atlasLayout.Footprint.RowPitch;
  for (int y = 0; y < f->atlasH; y++)
    memcpy(b->atlasMap + (size_t)y * rp, f->pixels + (size_t)y * f->atlasW, (size_t)f->atlasW);
  ID3D12Resource_Unmap(b->atlasUpload, 0, NULL);
  b->atlasMap = NULL;
  D3D12_TEXTURE_COPY_LOCATION src, dst;
  memset(&src, 0, sizeof src);
  memset(&dst, 0, sizeof dst);
  src.pResource = b->atlasUpload;
  src.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
  src.PlacedFootprint = b->atlasLayout;
  dst.pResource = b->atlas;
  dst.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
  ID3D12GraphicsCommandList_CopyTextureRegion(b->list, &dst, 0, 0, 0, &src, NULL);
  D3D12_RESOURCE_BARRIER bar;
  memset(&bar, 0, sizeof bar);
  bar.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
  bar.Transition.pResource = b->atlas;
  bar.Transition.StateBefore = D3D12_RESOURCE_STATE_COPY_DEST;
  bar.Transition.StateAfter = D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
  bar.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
  ID3D12GraphicsCommandList_ResourceBarrier(b->list, 1, &bar);
  D3D12_SHADER_RESOURCE_VIEW_DESC sv;
  memset(&sv, 0, sizeof sv);
  sv.Format = DXGI_FORMAT_R8_UNORM;
  sv.ViewDimension = D3D12_SRV_DIMENSION_TEXTURE2D;
  sv.Shader4ComponentMapping = D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING;
  sv.Texture2D.MipLevels = 1;
  ID3D12Device_CreateShaderResourceView(b->dev, b->atlas, &sv, b->srvCpu);
  b->atlasGen = f->gen;
  return true;
}

static bool upload_dirty12(be12 *b, const kfont *f) {
  if (!b->atlas || !b->atlasUpload) return create_atlas12(b, f);
  if (f->gen != b->atlasGen) return create_atlas12(b, f);
  if (!f->dirtyValid || !f->pixels) return true;
  int x = (int)f->dirty.x, y = (int)f->dirty.y, w = (int)f->dirty.w, h = (int)f->dirty.h;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > f->atlasW) w = f->atlasW - x;
  if (y + h > f->atlasH) h = f->atlasH - y;
  if (w <= 0 || h <= 0) {
    font_reset_dirty((kfont *)f);
    return true;
  }
  UINT rp = b->atlasLayout.Footprint.RowPitch;
  void *p = NULL;
  D3D12_RANGE none = {0, 0};
  if (FAILED(ID3D12Resource_Map(b->atlasUpload, 0, &none, &p)) || !p) return false;
  uint8_t *dst8 = (uint8_t *)p;
  for (int row = 0; row < h; row++)
    memcpy(dst8 + (size_t)(y + row) * rp + x, f->pixels + (size_t)(y + row) * f->atlasW + x, (size_t)w);
  D3D12_RANGE wrote = {0, (SIZE_T)b->atlasBytes};
  ID3D12Resource_Unmap(b->atlasUpload, 0, &wrote);
  D3D12_BOX box = {(UINT)x, (UINT)y, 0, (UINT)(x + w), (UINT)(y + h), 1};
  D3D12_TEXTURE_COPY_LOCATION src, dst;
  memset(&src, 0, sizeof src);
  memset(&dst, 0, sizeof dst);
  src.pResource = b->atlasUpload;
  src.Type = D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT;
  src.PlacedFootprint = b->atlasLayout;
  dst.pResource = b->atlas;
  dst.Type = D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX;
  D3D12_RESOURCE_BARRIER bar;
  memset(&bar, 0, sizeof bar);
  bar.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
  bar.Transition.pResource = b->atlas;
  bar.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
  bar.Transition.StateBefore = D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
  bar.Transition.StateAfter = D3D12_RESOURCE_STATE_COPY_DEST;
  ID3D12GraphicsCommandList_ResourceBarrier(b->list, 1, &bar);
  ID3D12GraphicsCommandList_CopyTextureRegion(b->list, &dst, (UINT)x, (UINT)y, 0, &src, &box);
  bar.Transition.StateBefore = D3D12_RESOURCE_STATE_COPY_DEST;
  bar.Transition.StateAfter = D3D12_RESOURCE_STATE_PIXEL_SHADER_RESOURCE;
  ID3D12GraphicsCommandList_ResourceBarrier(b->list, 1, &bar);
  font_reset_dirty((kfont *)f);
  return true;
}

static bool be12_begin(kbackend *self, void *target, int vpW, int vpH) {
  be12 *b = (be12 *)self;
  ID3D12Resource *bb = (ID3D12Resource *)target;
  if (!b->ok || !bb) return false;
  D3D12_RESOURCE_DESC bbd = ID3D12Resource_GetDesc(bb);
  if (!ensure_pso(b, bbd.Format)) return false;
  wait_ring(b);
  if (FAILED(ID3D12CommandAllocator_Reset(b->alloc))) return false;
  if (FAILED(ID3D12GraphicsCommandList_Reset(b->list, b->alloc, b->pso))) return false;
  b->open = true;
  b->vpW = vpW;
  b->vpH = vpH;
  b->lastTarget = bb;
  D3D12_RESOURCE_BARRIER bar;
  memset(&bar, 0, sizeof bar);
  bar.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
  bar.Transition.pResource = bb;
  bar.Transition.StateBefore = D3D12_RESOURCE_STATE_PRESENT;
  bar.Transition.StateAfter = D3D12_RESOURCE_STATE_RENDER_TARGET;
  bar.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
  ID3D12GraphicsCommandList_ResourceBarrier(b->list, 1, &bar);
  ID3D12Device_CreateRenderTargetView(b->dev, bb, NULL, b->rtvHandle);
  ID3D12GraphicsCommandList_OMSetRenderTargets(b->list, 1, &b->rtvHandle, FALSE, NULL);
  D3D12_VIEWPORT vp = {0, 0, (float)vpW, (float)vpH, 0.0f, 1.0f};
  D3D12_RECT sc = {0, 0, vpW, vpH};
  ID3D12GraphicsCommandList_RSSetViewports(b->list, 1, &vp);
  ID3D12GraphicsCommandList_RSSetScissorRects(b->list, 1, &sc);
  ID3D12DescriptorHeap *heaps[1] = {b->srvHeap};
  ID3D12GraphicsCommandList_SetDescriptorHeaps(b->list, 1, heaps);
  ID3D12GraphicsCommandList_SetGraphicsRootSignature(b->list, b->rootsig);
  ID3D12GraphicsCommandList_SetPipelineState(b->list, b->pso);
  ID3D12GraphicsCommandList_IASetPrimitiveTopology(b->list, D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
  return true;
}

static bool be12_draw(kbackend *self, const kdraw *d, const kfont *f) {
  be12 *b = (be12 *)self;
  if (!b->ok || !b->open || !d || !d->count) return false;
  uint32_t bytes = d->count * (uint32_t)sizeof(kvert);
  if (bytes > UPLOAD_SIZE) return false;
  if (!upload_dirty12(b, f)) return false;
  uint32_t ring = b->ring % RING_FRAMES;
  if (!b->vbMap[ring]) return false;
  memcpy(b->vbMap[ring], d->verts, bytes);
  D3D12_VERTEX_BUFFER_VIEW view;
  view.BufferLocation = ID3D12Resource_GetGPUVirtualAddress(b->vb[ring]);
  view.SizeInBytes = bytes;
  view.StrideInBytes = (UINT)sizeof(kvert);
  ID3D12GraphicsCommandList_IASetVertexBuffers(b->list, 0, 1, &view);
  float constants[4] = {(float)b->vpW, (float)b->vpH, b->vpW > 0 ? 1.0f / (float)b->vpW : 0.0f,
                        b->vpH > 0 ? 1.0f / (float)b->vpH : 0.0f};
  ID3D12GraphicsCommandList_SetGraphicsRoot32BitConstants(b->list, 0, 4, constants, 0);
  ID3D12GraphicsCommandList_SetGraphicsRootDescriptorTable(b->list, 1, b->srvGpu);
  ID3D12GraphicsCommandList_DrawInstanced(b->list, d->count, 1, 0, 0);
  b->ring++;
  return true;
}

static void be12_end(kbackend *self) {
  be12 *b = (be12 *)self;
  if (!b->ok || !b->open) return;
  b->open = false;
  if (b->lastTarget) {
    D3D12_RESOURCE_BARRIER bar;
    memset(&bar, 0, sizeof bar);
    bar.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    bar.Transition.pResource = b->lastTarget;
    bar.Transition.StateBefore = D3D12_RESOURCE_STATE_RENDER_TARGET;
    bar.Transition.StateAfter = D3D12_RESOURCE_STATE_PRESENT;
    bar.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    ID3D12GraphicsCommandList_ResourceBarrier(b->list, 1, &bar);
    b->lastTarget = NULL;
  }
  if (SUCCEEDED(ID3D12GraphicsCommandList_Close(b->list))) {
    ID3D12CommandList *lists[1] = {(ID3D12CommandList *)b->list};
    ID3D12CommandQueue_ExecuteCommandLists(b->queue, 1, lists);
    b->fenceValue++;
    ID3D12CommandQueue_Signal(b->queue, b->fence, b->fenceValue);
  }
}

static void be12_destroy(kbackend *self) {
  be12 *b = (be12 *)self;
  if (!b) return;
  if (b->atlas) ID3D12Resource_Release(b->atlas);
  if (b->atlasUpload) ID3D12Resource_Release(b->atlasUpload);
  for (int i = 0; i < RING_FRAMES; i++)
    if (b->vb[i]) ID3D12Resource_Release(b->vb[i]);
  if (b->fence) ID3D12Fence_Release(b->fence);
  if (b->list) ID3D12GraphicsCommandList_Release(b->list);
  if (b->alloc) ID3D12CommandAllocator_Release(b->alloc);
  if (b->pso) ID3D12PipelineState_Release(b->pso);
  if (b->rootsig) ID3D12RootSignature_Release(b->rootsig);
  if (b->vsb) ID3D10Blob_Release(b->vsb);
  if (b->psb) ID3D10Blob_Release(b->psb);
  if (b->rtvHeap) ID3D12DescriptorHeap_Release(b->rtvHeap);
  if (b->srvHeap) ID3D12DescriptorHeap_Release(b->srvHeap);
  if (b->queue) ID3D12CommandQueue_Release(b->queue);
  if (b->dev) ID3D12Device_Release(b->dev);
  free(b);
}

kbackend *be_d3d12_create(ID3D12Device *dev, ID3D12CommandQueue *queue) {
  if (!dev || !queue) return NULL;
  be12 *b = (be12 *)calloc(1, sizeof(be12));
  if (!b) return NULL;
  b->be.name = "d3d12";
  b->be.api = 3;
  b->be.begin = be12_begin;
  b->be.draw = be12_draw;
  b->be.end = be12_end;
  b->be.destroy = be12_destroy;
  b->dev = dev;
  ID3D12Device_AddRef(dev);
  b->queue = queue;
  ID3D12CommandQueue_AddRef(queue);

  if (FAILED(compile_blob(kat_hlsl_vs, "vs_5_0", &b->vsb)) || FAILED(compile_blob(kat_hlsl_ps, "ps_5_0", &b->psb)))
    goto fail;

  D3D12_STATIC_SAMPLER_DESC sampler;
  memset(&sampler, 0, sizeof sampler);
  sampler.Filter = D3D12_FILTER_MIN_MAG_LINEAR_MIP_POINT;
  sampler.AddressU = sampler.AddressV = sampler.AddressW = D3D12_TEXTURE_ADDRESS_MODE_CLAMP;
  sampler.MaxAnisotropy = 1;
  sampler.ComparisonFunc = D3D12_COMPARISON_FUNC_NEVER;
  sampler.BorderColor = D3D12_STATIC_BORDER_COLOR_TRANSPARENT_BLACK;
  sampler.MaxLOD = D3D12_FLOAT32_MAX;
  sampler.ShaderRegister = 0;
  sampler.ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
  D3D12_DESCRIPTOR_RANGE range;
  memset(&range, 0, sizeof range);
  range.RangeType = D3D12_DESCRIPTOR_RANGE_TYPE_SRV;
  range.NumDescriptors = 1;
  range.OffsetInDescriptorsFromTableStart = 0;
  D3D12_ROOT_PARAMETER params[2];
  memset(params, 0, sizeof params);
  params[0].ParameterType = D3D12_ROOT_PARAMETER_TYPE_32BIT_CONSTANTS;
  params[0].Constants.Num32BitValues = 4;
  params[0].ShaderVisibility = D3D12_SHADER_VISIBILITY_VERTEX;
  params[1].ParameterType = D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE;
  params[1].DescriptorTable.NumDescriptorRanges = 1;
  params[1].DescriptorTable.pDescriptorRanges = &range;
  params[1].ShaderVisibility = D3D12_SHADER_VISIBILITY_PIXEL;
  D3D12_ROOT_SIGNATURE_DESC rsd;
  memset(&rsd, 0, sizeof rsd);
  rsd.NumParameters = 2;
  rsd.pParameters = params;
  rsd.NumStaticSamplers = 1;
  rsd.pStaticSamplers = &sampler;
  rsd.Flags = D3D12_ROOT_SIGNATURE_FLAG_ALLOW_INPUT_ASSEMBLER_INPUT_LAYOUT;
  typedef HRESULT(WINAPI * SerializeRS_t)(const D3D12_ROOT_SIGNATURE_DESC *, D3D_ROOT_SIGNATURE_VERSION, ID3DBlob **,
                                          ID3DBlob **);
  SerializeRS_t pSer = NULL;
  HMODULE d12 = GetModuleHandleW(L"d3d12.dll");
  if (d12) pSer = (SerializeRS_t)GetProcAddress(d12, "D3D12SerializeRootSignature");
  if (!pSer) {
    KAT_LOG("D3D12SerializeRootSignature bulunamadi");
    goto fail;
  }
  ID3DBlob *sig = NULL, *sigErr = NULL;
  HRESULT hr = pSer(&rsd, D3D_ROOT_SIGNATURE_VERSION_1, &sig, &sigErr);
  if (sigErr) ID3D10Blob_Release(sigErr);
  if (FAILED(hr) || !sig) {
    KAT_LOG("kok imza serilestirilemedi hr=0x%08lx", (unsigned long)hr);
    goto fail;
  }
  hr = ID3D12Device_CreateRootSignature(dev, 0, ID3D10Blob_GetBufferPointer(sig), ID3D10Blob_GetBufferSize(sig),
                                        &IID_ID3D12RootSignature, (void **)&b->rootsig);
  ID3D10Blob_Release(sig);
  if (FAILED(hr)) {
    KAT_LOG("kok imza olusturulamadi hr=0x%08lx", (unsigned long)hr);
    goto fail;
  }

  D3D12_DESCRIPTOR_HEAP_DESC rtvDesc;
  memset(&rtvDesc, 0, sizeof rtvDesc);
  rtvDesc.Type = D3D12_DESCRIPTOR_HEAP_TYPE_RTV;
  rtvDesc.NumDescriptors = 2;
  if (FAILED(ID3D12Device_CreateDescriptorHeap(dev, &rtvDesc, &IID_ID3D12DescriptorHeap, (void **)&b->rtvHeap)))
    goto fail;
  b->rtvHandle = ID3D12DescriptorHeap_GetCPUDescriptorHandleForHeapStart(b->rtvHeap);

  D3D12_DESCRIPTOR_HEAP_DESC srvDesc = rtvDesc;
  srvDesc.Type = D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV;
  srvDesc.NumDescriptors = 4;
  srvDesc.Flags = D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE;
  if (FAILED(ID3D12Device_CreateDescriptorHeap(dev, &srvDesc, &IID_ID3D12DescriptorHeap, (void **)&b->srvHeap)))
    goto fail;
  b->srvCpu = ID3D12DescriptorHeap_GetCPUDescriptorHandleForHeapStart(b->srvHeap);
  b->srvGpu = ID3D12DescriptorHeap_GetGPUDescriptorHandleForHeapStart(b->srvHeap);

  if (!ensure_pso(b, DXGI_FORMAT_R8G8B8A8_UNORM)) goto fail;

  if (FAILED(ID3D12Device_CreateCommandAllocator(dev, D3D12_COMMAND_LIST_TYPE_DIRECT, &IID_ID3D12CommandAllocator,
                                                 (void **)&b->alloc)))
    goto fail;
  if (FAILED(ID3D12Device_CreateCommandList(dev, 0, D3D12_COMMAND_LIST_TYPE_DIRECT, b->alloc, b->pso,
                                            &IID_ID3D12GraphicsCommandList, (void **)&b->list)))
    goto fail;
  ID3D12GraphicsCommandList_Close(b->list);
  if (FAILED(ID3D12Device_CreateFence(dev, 0, D3D12_FENCE_FLAG_NONE, &IID_ID3D12Fence, (void **)&b->fence))) goto fail;

  D3D12_HEAP_PROPERTIES up;
  memset(&up, 0, sizeof up);
  up.Type = D3D12_HEAP_TYPE_UPLOAD;
  D3D12_RESOURCE_DESC vbd;
  memset(&vbd, 0, sizeof vbd);
  vbd.Dimension = D3D12_RESOURCE_DIMENSION_BUFFER;
  vbd.Width = UPLOAD_SIZE;
  vbd.Height = 1;
  vbd.DepthOrArraySize = 1;
  vbd.MipLevels = 1;
  vbd.Format = DXGI_FORMAT_UNKNOWN;
  vbd.SampleDesc.Count = 1;
  vbd.Layout = D3D12_TEXTURE_LAYOUT_ROW_MAJOR;
  for (int i = 0; i < RING_FRAMES; i++) {
    if (FAILED(ID3D12Device_CreateCommittedResource(dev, &up, D3D12_HEAP_FLAG_NONE, &vbd,
                                                    D3D12_RESOURCE_STATE_GENERIC_READ, NULL, &IID_ID3D12Resource,
                                                    (void **)&b->vb[i])))
      goto fail;
    D3D12_RANGE none = {0, 0};
    if (FAILED(ID3D12Resource_Map(b->vb[i], 0, &none, (void **)&b->vbMap[i]))) goto fail;
  }
  b->ok = true;
  KAT_LOG("D3D12 arka ucu hazir");
  return &b->be;
fail:
  KAT_LOG("D3D12 arka ucu kurulamadi");
  b->ok = false;
  be12_destroy(&b->be);
  return NULL;
}
