/* Test: sahte oyun (D3D11). Cihaz + swapchain, DLL yüklenmeden ÖNCE kurulur;
 * böylece GEÇ enjeksiyon (kukla cihaz) yolu doğrulanır. */
#include <initguid.h>
#define COBJMACROS
#include <windows.h>
#include <d3d11.h>
#include <stdio.h>

static LRESULT CALLBACK wp(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (m == WM_DESTROY) { PostQuitMessage(0); return 0; }
  return DefWindowProcW(h, m, w, l);
}

int main(int argc, char **argv) {
  static wchar_t stopFile[MAX_PATH];
  if (argc > 1) MultiByteToWideChar(CP_UTF8, 0, argv[1], -1, stopFile, MAX_PATH);
  else stopFile[0] = 0;
  printf("PID=%lu\n", GetCurrentProcessId());
  fflush(stdout);
  WNDCLASSW wc = {0};
  wc.lpfnWndProc = wp;
  wc.hInstance = GetModuleHandleW(NULL);
  wc.lpszClassName = L"SahteOyun";
  RegisterClassW(&wc);
  HWND hwnd = CreateWindowW(wc.lpszClassName, L"Sahte Oyun", WS_POPUP | WS_VISIBLE, 0, 0, 1280, 720, NULL, NULL,
                            wc.hInstance, NULL);
  printf("WINDOW=1\n");
  fflush(stdout);
  /* D3D11 statik bağlı (wined3d süreç başında yüklenir); cihaz + swapchain
     birlikte kurulur → GEÇ enjeksiyon (kukla cihaz) senaryosu. */
  DXGI_SWAP_CHAIN_DESC sd = {0};
  sd.BufferCount = 1;
  sd.BufferDesc.Width = 1280;
  sd.BufferDesc.Height = 720;
  sd.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
  sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
  sd.OutputWindow = hwnd;
  sd.SampleDesc.Count = 1;
  sd.Windowed = TRUE;
  sd.SwapEffect = DXGI_SWAP_EFFECT_DISCARD;
  ID3D11Device *dev = NULL;
  ID3D11DeviceContext *ctx = NULL;
  IDXGISwapChain *sc = NULL;
  HRESULT hr = D3D11CreateDeviceAndSwapChain(NULL, D3D_DRIVER_TYPE_HARDWARE, NULL, 0, NULL, 0, D3D11_SDK_VERSION, &sd,
                                             &sc, &dev, NULL, &ctx);
  printf("DEVICE=0x%08lx\n", (unsigned long)hr);
  fflush(stdout);
  if (FAILED(hr)) return 1;
  ID3D11Texture2D *bb = NULL;
  IDXGISwapChain_GetBuffer(sc, 0, &IID_ID3D11Texture2D, (void **)&bb);
  ID3D11RenderTargetView *rtv = NULL;
  ID3D11Device_CreateRenderTargetView(dev, (ID3D11Resource *)bb, NULL, &rtv);
  D3D11_TEXTURE2D_DESC stageDesc = {0};
  stageDesc.Width = 1280;
  stageDesc.Height = 720;
  stageDesc.MipLevels = 1;
  stageDesc.ArraySize = 1;
  stageDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
  stageDesc.SampleDesc.Count = 1;
  stageDesc.Usage = D3D11_USAGE_STAGING;
  stageDesc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
  ID3D11Texture2D *stage = NULL;
  ID3D11Device_CreateTexture2D(dev, &stageDesc, NULL, &stage);
  printf("READY=1\n");
  fflush(stdout);
  int drewAfter = 0, maxDiff = 0;
  for (int frame = 0; frame < 300; frame++) {
    if (frame % 10 == 0 && stopFile[0] && GetFileAttributesW(stopFile) != INVALID_FILE_ATTRIBUTES) break;
    if (stage && frame > 0) {
      ID3D11DeviceContext_CopyResource(ctx, (ID3D11Resource *)stage, (ID3D11Resource *)bb);
      D3D11_MAPPED_SUBRESOURCE map;
      if (SUCCEEDED(ID3D11DeviceContext_Map(ctx, (ID3D11Resource *)stage, 0, D3D11_MAP_READ, 0, &map))) {
        int hits = 0;
        for (int y = 8; y < 260; y++) {
          const unsigned char *row = (const unsigned char *)map.pData + (size_t)y * map.RowPitch;
          for (int x = 900; x < 1272; x++) {
            const unsigned char *p = row + (size_t)x * 4;
            int diff = abs((int)p[0] - 255) + abs((int)p[1] - 0) + abs((int)p[2] - 0);
            if (diff > maxDiff) maxDiff = diff;
            if (diff > 40) hits++;
          }
        }
        ID3D11DeviceContext_Unmap(ctx, (ID3D11Resource *)stage, 0);
        if (hits > 200) drewAfter++;
      }
    }
    float clear[4] = {1.0f, 0.0f, 0.0f, 1.0f};
    ID3D11DeviceContext_OMSetRenderTargets(ctx, 1, &rtv, NULL);
    D3D11_VIEWPORT vp = {0, 0, 1280, 720, 0, 1};
    ID3D11DeviceContext_RSSetViewports(ctx, 1, &vp);
    ID3D11DeviceContext_ClearRenderTargetView(ctx, rtv, clear);
    IDXGISwapChain_Present(sc, 0, 0);
    MSG msg;
    while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
    Sleep(33);
  }
  printf("DREW_FRAMES=%d MAXDIFF=%d\n", drewAfter, maxDiff);
  fflush(stdout);
  return 0;
}
