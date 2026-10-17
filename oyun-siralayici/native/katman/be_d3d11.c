/* D3D11 arka ucu: oyunun hemen bağlamında, Present'ten önce çizer.
 * Oyunun durumunu eksiksiz kaydeder ve geri yükler — aksi hâlde oyunun kendi
 * çizimi bozulur. Shader'lar çalışma anında derlenir (d3dcompiler_47.dll
 * Windows ile gelir); uygulama derlenmiş shader DAĞITMAZ. */
#include "katman.h"
#include <d3dcompiler.h>
#include <stdlib.h>
#include <string.h>

#define MAX_VIEWPORTS 8

typedef HRESULT(WINAPI *D3DCompile_t)(LPCVOID, SIZE_T, LPCSTR, const D3D_SHADER_MACRO *, ID3DInclude *, LPCSTR,
                                      LPCSTR, UINT, UINT, ID3DBlob **, ID3DBlob **);

extern const char kat_hlsl_vs[];
extern const char kat_hlsl_ps[];

typedef struct {
  kbackend be;
  ID3D11Device *dev;
  ID3D11DeviceContext *ctx;
  ID3D11VertexShader *vs;
  ID3D11PixelShader *ps;
  ID3D11InputLayout *layout;
  ID3D11Buffer *vb;
  ID3D11Buffer *cb;
  ID3D11BlendState *blend;
  ID3D11RasterizerState *raster;
  ID3D11DepthStencilState *depth;
  ID3D11SamplerState *sampler;
  ID3D11Texture2D *atlasTex;
  ID3D11ShaderResourceView *atlasSrv;
  uint32_t atlasGen;
  uint32_t vbSize;
  bool ok;

  /* kaydedilen oyun durumu */
  ID3D11RenderTargetView *savedRtv;
  ID3D11DepthStencilView *savedDsv;
  ID3D11BlendState *savedBlend;
  float savedBlendFactor[4];
  UINT savedSampleMask;
  ID3D11DepthStencilState *savedDepth;
  UINT savedStencilRef;
  ID3D11RasterizerState *savedRaster;
  D3D11_VIEWPORT savedVp[MAX_VIEWPORTS];
  UINT savedVpCount;
  D3D11_RECT savedScissor[MAX_VIEWPORTS];
  UINT savedScissorCount;
  D3D11_PRIMITIVE_TOPOLOGY savedTopo;
  ID3D11InputLayout *savedLayout;
  ID3D11Buffer *savedVb[4];
  UINT savedStride[4];
  UINT savedOffset[4];
  ID3D11Buffer *savedIb;
  DXGI_FORMAT savedIbFormat;
  UINT savedIbOffset;
  ID3D11VertexShader *savedVs;
  ID3D11PixelShader *savedPs;
  ID3D11GeometryShader *savedGs;
  ID3D11HullShader *savedHs;
  ID3D11DomainShader *savedDs;
  ID3D11Buffer *savedVsCb;
  ID3D11Buffer *savedPsCb;
  ID3D11ShaderResourceView *savedVsSrv;
  ID3D11ShaderResourceView *savedPsSrv;
  ID3D11SamplerState *savedPsSampler;
  bool stateSaved;
} be11;

static void release_all(be11 *b) {
#define REL(x)                                                                                                           \
  do {                                                                                                                   \
    if (b->x) {                                                                                                          \
      ID3D11DeviceChild_Release((ID3D11DeviceChild *)b->x);                                                              \
      b->x = NULL;                                                                                                       \
    }                                                                                                                    \
  } while (0)
  /* DeviceChild olmayanlar ayrı bırakılır */
  if (b->atlasSrv) { ID3D11ShaderResourceView_Release(b->atlasSrv); b->atlasSrv = NULL; }
  if (b->atlasTex) { ID3D11Texture2D_Release(b->atlasTex); b->atlasTex = NULL; }
  if (b->blend) { ID3D11BlendState_Release(b->blend); b->blend = NULL; }
  if (b->raster) { ID3D11RasterizerState_Release(b->raster); b->raster = NULL; }
  if (b->depth) { ID3D11DepthStencilState_Release(b->depth); b->depth = NULL; }
  if (b->sampler) { ID3D11SamplerState_Release(b->sampler); b->sampler = NULL; }
  if (b->layout) { ID3D11InputLayout_Release(b->layout); b->layout = NULL; }
  if (b->vs) { ID3D11VertexShader_Release(b->vs); b->vs = NULL; }
  if (b->ps) { ID3D11PixelShader_Release(b->ps); b->ps = NULL; }
  if (b->vb) { ID3D11Buffer_Release(b->vb); b->vb = NULL; }
  if (b->cb) { ID3D11Buffer_Release(b->cb); b->cb = NULL; }
#undef REL
}

static D3DCompile_t load_compiler(void) {
  static D3DCompile_t fn = NULL;
  static bool tried = false;
  if (tried) return fn;
  tried = true;
  const wchar_t *names[] = {L"d3dcompiler_47.dll", L"d3dcompiler_46.dll", L"d3dcompiler_43.dll"};
  for (size_t i = 0; i < 3; i++) {
    HMODULE m = LoadLibraryW(names[i]);
    if (!m) continue;
    fn = (D3DCompile_t)GetProcAddress(m, "D3DCompile");
    if (fn) {
      KAT_LOG("shader derleyici: %ls", names[i]);
      return fn;
    }
  }
  KAT_LOG("d3dcompiler bulunamadı");
  return NULL;
}

static bool compile(be11 *b, const char *src, const char *entry, const char *target, ID3DBlob **out) {
  D3DCompile_t fn = load_compiler();
  if (!fn) return false;
  ID3DBlob *err = NULL;
  HRESULT hr = fn(src, strlen(src), "katman", NULL, NULL, entry, target, D3DCOMPILE_OPTIMIZATION_LEVEL1, 0, out, &err);
  if (FAILED(hr)) {
    if (err) {
      KAT_LOG("shader derlenemedi (%s): %s", target, (const char *)ID3D10Blob_GetBufferPointer(err));
      ID3D10Blob_Release(err);
    } else
      KAT_LOG("shader derlenemedi (%s) hr=0x%08lx", target, (unsigned long)hr);
    return false;
  }
  if (err) ID3D10Blob_Release(err);
  return true;
}

static bool create_atlas(be11 *b, const kfont *f) {
  if (!f || !f->pixels) return false;
  if (b->atlasSrv) { ID3D11ShaderResourceView_Release(b->atlasSrv); b->atlasSrv = NULL; }
  if (b->atlasTex) { ID3D11Texture2D_Release(b->atlasTex); b->atlasTex = NULL; }
  D3D11_TEXTURE2D_DESC td;
  memset(&td, 0, sizeof td);
  td.Width = (UINT)f->atlasW;
  td.Height = (UINT)f->atlasH;
  td.MipLevels = 1;
  td.ArraySize = 1;
  td.Format = DXGI_FORMAT_R8_UNORM;
  td.SampleDesc.Count = 1;
  td.Usage = D3D11_USAGE_DEFAULT;
  td.BindFlags = D3D11_BIND_SHADER_RESOURCE;
  D3D11_SUBRESOURCE_DATA init;
  memset(&init, 0, sizeof init);
  init.pSysMem = f->pixels;
  init.SysMemPitch = (UINT)f->atlasW;
  HRESULT hr = ID3D11Device_CreateTexture2D(b->dev, &td, &init, &b->atlasTex);
  if (FAILED(hr)) {
    KAT_LOG("atlas dokusu oluşturulamadı hr=0x%08lx", (unsigned long)hr);
    return false;
  }
  D3D11_SHADER_RESOURCE_VIEW_DESC sv;
  memset(&sv, 0, sizeof sv);
  sv.Format = td.Format;
  sv.ViewDimension = D3D11_SRV_DIMENSION_TEXTURE2D;
  sv.Texture2D.MipLevels = 1;
  hr = ID3D11Device_CreateShaderResourceView(b->dev, (ID3D11Resource *)b->atlasTex, &sv, &b->atlasSrv);
  if (FAILED(hr)) {
    KAT_LOG("atlas SRV oluşturulamadı hr=0x%08lx", (unsigned long)hr);
    return false;
  }
  b->atlasGen = f->gen;
  return true;
}

static bool upload_atlas_dirty(be11 *b, const kfont *f) {
  /* ilk karede atlas henüz yok: gen uyuşmazlığı üzerinden oluşturulur */
  if (!b->atlasTex || !b->atlasSrv || f->gen != b->atlasGen) return create_atlas(b, f);
  if (!f->dirtyValid || !f->pixels) return true;
  int x = (int)f->dirty.x, y = (int)f->dirty.y;
  int w = (int)f->dirty.w, h = (int)f->dirty.h;
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > f->atlasW) w = f->atlasW - x;
  if (y + h > f->atlasH) h = f->atlasH - y;
  if (w > 0 && h > 0) {
    D3D11_BOX box = {(UINT)x, (UINT)y, 0, (UINT)(x + w), (UINT)(y + h), 1};
    ID3D11DeviceContext_UpdateSubresource(b->ctx, (ID3D11Resource *)b->atlasTex, 0, &box,
                                          f->pixels + (size_t)y * (size_t)f->atlasW + (size_t)x, (UINT)f->atlasW, 0);
  }
  font_reset_dirty((kfont *)f);
  return true;
}

static bool ensure_vb(be11 *b, uint32_t bytes) {
  if (b->vb && b->vbSize >= bytes) return true;
  if (b->vb) { ID3D11Buffer_Release(b->vb); b->vb = NULL; b->vbSize = 0; }
  uint32_t size = bytes < (1 << 16) ? (1 << 16) : bytes;
  size = (size + 4095) & ~4095u;
  D3D11_BUFFER_DESC bd;
  memset(&bd, 0, sizeof bd);
  bd.ByteWidth = size;
  bd.Usage = D3D11_USAGE_DYNAMIC;
  bd.BindFlags = D3D11_BIND_VERTEX_BUFFER;
  bd.CPUAccessFlags = D3D11_CPU_ACCESS_WRITE;
  HRESULT hr = ID3D11Device_CreateBuffer(b->dev, &bd, NULL, &b->vb);
  if (FAILED(hr)) {
    KAT_LOG("tepe tamponu oluşturulamadı hr=0x%08lx", (unsigned long)hr);
    return false;
  }
  b->vbSize = size;
  return true;
}

static bool be11_begin(kbackend *self, void *target, int vpW, int vpH) {
  be11 *b = (be11 *)self;
  if (!b->ok || !target) return false;
  ID3D11DeviceContext *c = b->ctx;
  /* --- oyunun durumunu kaydet --- */
  UINT one = 1;
  ID3D11DeviceContext_OMGetRenderTargets(c, 1, &b->savedRtv, &b->savedDsv);
  ID3D11DeviceContext_OMGetBlendState(c, &b->savedBlend, b->savedBlendFactor, &b->savedSampleMask);
  ID3D11DeviceContext_OMGetDepthStencilState(c, &b->savedDepth, &b->savedStencilRef);
  ID3D11DeviceContext_RSGetState(c, &b->savedRaster);
  b->savedVpCount = MAX_VIEWPORTS;
  ID3D11DeviceContext_RSGetViewports(c, &b->savedVpCount, b->savedVp);
  b->savedScissorCount = MAX_VIEWPORTS;
  ID3D11DeviceContext_RSGetScissorRects(c, &b->savedScissorCount, b->savedScissor);
  ID3D11DeviceContext_IAGetPrimitiveTopology(c, &b->savedTopo);
  ID3D11DeviceContext_IAGetInputLayout(c, &b->savedLayout);
  UINT strides[4] = {0}, offsets[4] = {0};
  ID3D11Buffer *vbs[4] = {NULL};
  ID3D11DeviceContext_IAGetVertexBuffers(c, 0, 4, vbs, strides, offsets);
  for (int i = 0; i < 4; i++) {
    b->savedVb[i] = vbs[i];
    b->savedStride[i] = strides[i];
    b->savedOffset[i] = offsets[i];
  }
  ID3D11DeviceContext_IAGetIndexBuffer(c, &b->savedIb, &b->savedIbFormat, &b->savedIbOffset);
  ID3D11DeviceContext_VSGetShader(c, &b->savedVs, NULL, NULL);
  ID3D11DeviceContext_PSGetShader(c, &b->savedPs, NULL, NULL);
  ID3D11DeviceContext_GSGetShader(c, &b->savedGs, NULL, NULL);
  ID3D11DeviceContext_HSGetShader(c, &b->savedHs, NULL, NULL);
  ID3D11DeviceContext_DSGetShader(c, &b->savedDs, NULL, NULL);
  ID3D11DeviceContext_VSGetConstantBuffers(c, 0, one, &b->savedVsCb);
  ID3D11DeviceContext_PSGetConstantBuffers(c, 0, one, &b->savedPsCb);
  ID3D11DeviceContext_VSGetShaderResources(c, 0, one, &b->savedVsSrv);
  ID3D11DeviceContext_PSGetShaderResources(c, 0, one, &b->savedPsSrv);
  ID3D11DeviceContext_PSGetSamplers(c, 0, one, &b->savedPsSampler);
  b->stateSaved = true;

  /* --- kendi durumumuz --- */
  ID3D11DeviceContext_OMSetRenderTargets(c, 1, (ID3D11RenderTargetView **)&target, NULL);
  D3D11_VIEWPORT vp;
  memset(&vp, 0, sizeof vp);
  vp.Width = (float)vpW;
  vp.Height = (float)vpH;
  vp.MinDepth = 0.0f;
  vp.MaxDepth = 1.0f;
  ID3D11DeviceContext_RSSetViewports(c, 1, &vp);
  ID3D11DeviceContext_RSSetScissorRects(c, 0, NULL);
  ID3D11DeviceContext_RSSetState(c, b->raster);
  ID3D11DeviceContext_OMSetBlendState(c, b->blend, NULL, 0xFFFFFFFF);
  ID3D11DeviceContext_OMSetDepthStencilState(c, b->depth, 0);
  ID3D11DeviceContext_IASetPrimitiveTopology(c, D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
  ID3D11DeviceContext_IASetInputLayout(c, b->layout);
  ID3D11DeviceContext_IASetIndexBuffer(c, NULL, DXGI_FORMAT_UNKNOWN, 0);
  ID3D11DeviceContext_VSSetShader(c, b->vs, NULL, 0);
  ID3D11DeviceContext_PSSetShader(c, b->ps, NULL, 0);
  ID3D11DeviceContext_GSSetShader(c, NULL, NULL, 0);
  ID3D11DeviceContext_HSSetShader(c, NULL, NULL, 0);
  ID3D11DeviceContext_DSSetShader(c, NULL, NULL, 0);
  ID3D11DeviceContext_VSSetConstantBuffers(c, 0, 1, &b->cb);
  ID3D11DeviceContext_PSSetSamplers(c, 0, 1, &b->sampler);
  return true;
}

static bool be11_draw(kbackend *self, const kdraw *d, const kfont *f) {
  be11 *b = (be11 *)self;
  if (!b->ok || !d || !d->count) return false;
  if (!upload_atlas_dirty(b, f)) return false;
  uint32_t bytes = d->count * (uint32_t)sizeof(kvert);
  if (!ensure_vb(b, bytes)) return false;
  D3D11_MAPPED_SUBRESOURCE map;
  HRESULT hr = ID3D11DeviceContext_Map(b->ctx, (ID3D11Resource *)b->vb, 0, D3D11_MAP_WRITE_DISCARD, 0, &map);
  if (FAILED(hr)) {
    KAT_LOG("tepe tamponu kilitlenemedi hr=0x%08lx", (unsigned long)hr);
    return false;
  }
  memcpy(map.pData, d->verts, bytes);
  ID3D11DeviceContext_Unmap(b->ctx, (ID3D11Resource *)b->vb, 0);

  float constants[4];
  D3D11_VIEWPORT vp;
  UINT n = 1;
  ID3D11DeviceContext_RSGetViewports(b->ctx, &n, &vp);
  constants[0] = vp.Width;
  constants[1] = vp.Height;
  constants[2] = vp.Width > 0 ? 1.0f / vp.Width : 0.0f;
  constants[3] = vp.Height > 0 ? 1.0f / vp.Height : 0.0f;
  ID3D11DeviceContext_UpdateSubresource(b->ctx, (ID3D11Resource *)b->cb, 0, NULL, constants, 16, 0);

  UINT stride = (UINT)sizeof(kvert), offset = 0;
  ID3D11DeviceContext_IASetVertexBuffers(b->ctx, 0, 1, &b->vb, &stride, &offset);
  ID3D11DeviceContext_PSSetShaderResources(b->ctx, 0, 1, &b->atlasSrv);
  ID3D11DeviceContext_Draw(b->ctx, d->count, 0);
  return true;
}

static void be11_end(kbackend *self) {
  be11 *b = (be11 *)self;
  if (!b->stateSaved) return;
  ID3D11DeviceContext *c = b->ctx;
  ID3D11DeviceContext_OMSetRenderTargets(c, b->savedRtv ? 1 : 0, &b->savedRtv, b->savedDsv);
  ID3D11DeviceContext_OMSetBlendState(c, b->savedBlend, b->savedBlendFactor, b->savedSampleMask);
  ID3D11DeviceContext_OMSetDepthStencilState(c, b->savedDepth, b->savedStencilRef);
  ID3D11DeviceContext_RSSetState(c, b->savedRaster);
  if (b->savedVpCount && b->savedVpCount <= MAX_VIEWPORTS) ID3D11DeviceContext_RSSetViewports(c, b->savedVpCount, b->savedVp);
  if (b->savedScissorCount && b->savedScissorCount <= MAX_VIEWPORTS)
    ID3D11DeviceContext_RSSetScissorRects(c, b->savedScissorCount, b->savedScissor);
  ID3D11DeviceContext_IASetPrimitiveTopology(c, b->savedTopo);
  ID3D11DeviceContext_IASetInputLayout(c, b->savedLayout);
  ID3D11DeviceContext_IASetVertexBuffers(c, 0, 4, b->savedVb, b->savedStride, b->savedOffset);
  ID3D11DeviceContext_IASetIndexBuffer(c, b->savedIb, b->savedIbFormat, b->savedIbOffset);
  ID3D11DeviceContext_VSSetShader(c, b->savedVs, NULL, 0);
  ID3D11DeviceContext_PSSetShader(c, b->savedPs, NULL, 0);
  ID3D11DeviceContext_GSSetShader(c, b->savedGs, NULL, 0);
  ID3D11DeviceContext_HSSetShader(c, b->savedHs, NULL, 0);
  ID3D11DeviceContext_DSSetShader(c, b->savedDs, NULL, 0);
  ID3D11DeviceContext_VSSetConstantBuffers(c, 0, 1, &b->savedVsCb);
  ID3D11DeviceContext_PSSetConstantBuffers(c, 0, 1, &b->savedPsCb);
  ID3D11DeviceContext_VSSetShaderResources(c, 0, 1, &b->savedVsSrv);
  ID3D11DeviceContext_PSSetShaderResources(c, 0, 1, &b->savedPsSrv);
  ID3D11DeviceContext_PSSetSamplers(c, 0, 1, &b->savedPsSampler);
#define REL(x)                                                                                                           \
  do {                                                                                                                   \
    if (b->x) {                                                                                                          \
      ID3D11DeviceChild_Release((ID3D11DeviceChild *)b->x);                                                              \
      b->x = NULL;                                                                                                       \
    }                                                                                                                    \
  } while (0)
  if (b->savedRtv) { ID3D11RenderTargetView_Release(b->savedRtv); b->savedRtv = NULL; }
  if (b->savedDsv) { ID3D11DepthStencilView_Release(b->savedDsv); b->savedDsv = NULL; }
  if (b->savedBlend) { ID3D11BlendState_Release(b->savedBlend); b->savedBlend = NULL; }
  if (b->savedDepth) { ID3D11DepthStencilState_Release(b->savedDepth); b->savedDepth = NULL; }
  if (b->savedRaster) { ID3D11RasterizerState_Release(b->savedRaster); b->savedRaster = NULL; }
  if (b->savedLayout) { ID3D11InputLayout_Release(b->savedLayout); b->savedLayout = NULL; }
  for (int i = 0; i < 4; i++)
    if (b->savedVb[i]) { ID3D11Buffer_Release(b->savedVb[i]); b->savedVb[i] = NULL; }
  if (b->savedIb) { ID3D11Buffer_Release(b->savedIb); b->savedIb = NULL; }
  REL(savedVs);
  REL(savedPs);
  REL(savedGs);
  REL(savedHs);
  REL(savedDs);
  REL(savedVsCb);
  REL(savedPsCb);
  if (b->savedVsSrv) { ID3D11ShaderResourceView_Release(b->savedVsSrv); b->savedVsSrv = NULL; }
  if (b->savedPsSrv) { ID3D11ShaderResourceView_Release(b->savedPsSrv); b->savedPsSrv = NULL; }
  if (b->savedPsSampler) { ID3D11SamplerState_Release(b->savedPsSampler); b->savedPsSampler = NULL; }
#undef REL
  b->stateSaved = false;
}

static void be11_destroy(kbackend *self) {
  be11 *b = (be11 *)self;
  if (!b) return;
  be11_end(self);
  release_all(b);
  if (b->ctx) { ID3D11DeviceContext_Release(b->ctx); b->ctx = NULL; }
  if (b->dev) { ID3D11Device_Release(b->dev); b->dev = NULL; }
  free(b);
}

kbackend *be_d3d11_create(ID3D11Device *dev, ID3D11DeviceContext *ctx) {
  if (!dev || !ctx) return NULL;
  be11 *b = (be11 *)calloc(1, sizeof(be11));
  if (!b) return NULL;
  b->be.name = "d3d11";
  b->be.api = 2;
  b->be.begin = be11_begin;
  b->be.draw = be11_draw;
  b->be.end = be11_end;
  b->be.destroy = be11_destroy;
  b->dev = dev;
  ID3D11Device_AddRef(dev);
  b->ctx = ctx;
  ID3D11DeviceContext_AddRef(ctx);

  ID3DBlob *vsb = NULL, *psb = NULL;
  if (!compile(b, kat_hlsl_vs, "main", "vs_4_0", &vsb)) {
    if (!compile(b, kat_hlsl_vs, "main", "vs_5_0", &vsb)) goto fail;
  }
  if (!compile(b, kat_hlsl_ps, "main", "ps_4_0", &psb)) {
    if (!compile(b, kat_hlsl_ps, "main", "ps_5_0", &psb)) {
      ID3D10Blob_Release(vsb);
      goto fail;
    }
  }
  HRESULT hr = ID3D11Device_CreateVertexShader(dev, ID3D10Blob_GetBufferPointer(vsb), ID3D10Blob_GetBufferSize(vsb), NULL, &b->vs);
  if (FAILED(hr)) { ID3D10Blob_Release(vsb); ID3D10Blob_Release(psb); goto fail; }
  hr = ID3D11Device_CreatePixelShader(dev, ID3D10Blob_GetBufferPointer(psb), ID3D10Blob_GetBufferSize(psb), NULL, &b->ps);
  if (SUCCEEDED(hr)) {
    D3D11_INPUT_ELEMENT_DESC ie[3] = {
        {"POSITION", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 0, D3D11_INPUT_PER_VERTEX_DATA, 0},
        {"TEXCOORD", 0, DXGI_FORMAT_R32G32_FLOAT, 0, 8, D3D11_INPUT_PER_VERTEX_DATA, 0},
        {"COLOR", 0, DXGI_FORMAT_R8G8B8A8_UNORM, 0, 16, D3D11_INPUT_PER_VERTEX_DATA, 0},
    };
    hr = ID3D11Device_CreateInputLayout(dev, ie, 3, ID3D10Blob_GetBufferPointer(vsb), ID3D10Blob_GetBufferSize(vsb), &b->layout);
  }
  ID3D10Blob_Release(vsb);
  ID3D10Blob_Release(psb);
  if (FAILED(hr) || !b->layout) goto fail;

  D3D11_BUFFER_DESC bd;
  memset(&bd, 0, sizeof bd);
  bd.ByteWidth = 16;
  bd.Usage = D3D11_USAGE_DEFAULT;
  bd.BindFlags = D3D11_BIND_CONSTANT_BUFFER;
  if (FAILED(ID3D11Device_CreateBuffer(dev, &bd, NULL, &b->cb))) goto fail;

  D3D11_BLEND_DESC bl;
  memset(&bl, 0, sizeof bl);
  bl.AlphaToCoverageEnable = FALSE;
  bl.IndependentBlendEnable = FALSE;
  bl.RenderTarget[0].BlendEnable = TRUE;
  bl.RenderTarget[0].SrcBlend = D3D11_BLEND_SRC_ALPHA;
  bl.RenderTarget[0].DestBlend = D3D11_BLEND_INV_SRC_ALPHA;
  bl.RenderTarget[0].BlendOp = D3D11_BLEND_OP_ADD;
  bl.RenderTarget[0].SrcBlendAlpha = D3D11_BLEND_ONE;
  bl.RenderTarget[0].DestBlendAlpha = D3D11_BLEND_INV_SRC_ALPHA;
  bl.RenderTarget[0].BlendOpAlpha = D3D11_BLEND_OP_ADD;
  bl.RenderTarget[0].RenderTargetWriteMask = D3D11_COLOR_WRITE_ENABLE_ALL;
  if (FAILED(ID3D11Device_CreateBlendState(dev, &bl, &b->blend))) goto fail;

  D3D11_RASTERIZER_DESC rs;
  memset(&rs, 0, sizeof rs);
  rs.FillMode = D3D11_FILL_SOLID;
  rs.CullMode = D3D11_CULL_NONE;
  rs.FrontCounterClockwise = FALSE;
  rs.DepthClipEnable = FALSE;
  rs.ScissorEnable = FALSE;
  rs.MultisampleEnable = FALSE;
  rs.AntialiasedLineEnable = FALSE;
  if (FAILED(ID3D11Device_CreateRasterizerState(dev, &rs, &b->raster))) goto fail;

  D3D11_DEPTH_STENCIL_DESC ds;
  memset(&ds, 0, sizeof ds);
  ds.DepthEnable = FALSE;
  ds.DepthWriteMask = D3D11_DEPTH_WRITE_MASK_ZERO;
  ds.DepthFunc = D3D11_COMPARISON_ALWAYS;
  ds.StencilEnable = FALSE;
  if (FAILED(ID3D11Device_CreateDepthStencilState(dev, &ds, &b->depth))) goto fail;

  D3D11_SAMPLER_DESC sp;
  memset(&sp, 0, sizeof sp);
  sp.Filter = D3D11_FILTER_MIN_MAG_LINEAR_MIP_POINT;
  sp.AddressU = sp.AddressV = sp.AddressW = D3D11_TEXTURE_ADDRESS_CLAMP;
  sp.MaxLOD = D3D11_FLOAT32_MAX;
  if (FAILED(ID3D11Device_CreateSamplerState(dev, &sp, &b->sampler))) goto fail;

  b->ok = true;
  KAT_LOG("D3D11 arka ucu hazır");
  return &b->be;
fail:
  KAT_LOG("D3D11 arka ucu kurulamadı");
  release_all(b);
  if (b->ctx) ID3D11DeviceContext_Release(b->ctx);
  if (b->dev) ID3D11Device_Release(b->dev);
  free(b);
  return NULL;
}
