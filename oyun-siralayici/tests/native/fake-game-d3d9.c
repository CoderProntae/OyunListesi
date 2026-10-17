/* Test: sahte oyun (D3D9 — eski oyunların yolu).
 * Pencere açılır, enjeksiyon penceresi boyunca beklenir, sonra cihaz kurulur:
 * böylece katman Direct3DCreate9 IAT kancasından CreateDevice'ı, oradan da
 * Present'i yakalar (erken enjeksiyon senaryosu). */
#include <initguid.h>
#define COBJMACROS
#include <windows.h>
#include <d3d9.h>
#include <stdio.h>

static LRESULT CALLBACK wp(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (m == WM_DESTROY) {
    PostQuitMessage(0);
    return 0;
  }
  return DefWindowProcW(h, m, w, l);
}

int main(int argc, char **argv) {
  static wchar_t stopFile[MAX_PATH];
  if (argc > 1) MultiByteToWideChar(CP_UTF8, 0, argv[1], -1, stopFile, MAX_PATH);
  printf("PID=%lu\n", GetCurrentProcessId());
  fflush(stdout);
  int earlyDelay = argc > 2;
  WNDCLASSW wc = {0};
  wc.lpfnWndProc = wp;
  wc.hInstance = GetModuleHandleW(NULL);
  wc.lpszClassName = L"SahteOyun9";
  RegisterClassW(&wc);
  HWND hwnd = CreateWindowW(wc.lpszClassName, L"Sahte Oyun D3D9", WS_POPUP | WS_VISIBLE, 0, 0, 1280, 720, NULL, NULL,
                            wc.hInstance, NULL);
  printf("WINDOW=1\n");
  fflush(stdout);
  if (earlyDelay) Sleep(6000); /* enjeksiyon burada yapılır */
  IDirect3D9 *d3d = Direct3DCreate9(D3D_SDK_VERSION);
  printf("D3D9=%p\n", (void *)d3d);
  if (!d3d) return 1;
  D3DPRESENT_PARAMETERS pp = {0};
  pp.Windowed = TRUE;
  pp.SwapEffect = D3DSWAPEFFECT_DISCARD;
  pp.BackBufferCount = 1;
  pp.BackBufferWidth = 1280;
  pp.BackBufferHeight = 720;
  pp.BackBufferFormat = D3DFMT_A8R8G8B8;
  pp.PresentationInterval = D3DPRESENT_INTERVAL_IMMEDIATE;
  pp.hDeviceWindow = hwnd;
  IDirect3DDevice9 *dev = NULL;
  HRESULT hr = IDirect3D9_CreateDevice(d3d, D3DADAPTER_DEFAULT, D3DDEVTYPE_HAL, hwnd,
                                       D3DCREATE_SOFTWARE_VERTEXPROCESSING | D3DCREATE_FPU_PRESERVE, &pp, &dev);
  printf("DEVICE=0x%08lx\n", (unsigned long)hr);
  fflush(stdout);
  if (FAILED(hr)) return 1;
  printf("READY=1\n");
  fflush(stdout);
  for (int i = 0; i < 400; i++) {
    DWORD now = GetTickCount();
    HANDLE h = CreateFileW(stopFile, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (h != INVALID_HANDLE_VALUE) {
      CloseHandle(h);
      break;
    }
    if (FAILED(IDirect3DDevice9_BeginScene(dev))) {
      IDirect3DDevice9_Reset(dev, &pp); /* cihaz kaybı: basitçe sıfırla */
      Sleep(20);
      continue;
    }
    IDirect3DDevice9_Clear(dev, 0, NULL, D3DCLEAR_TARGET, 0x00203040 + (i & 31), 1.0f, 0);
    IDirect3DDevice9_EndScene(dev);
    IDirect3DDevice9_Present(dev, NULL, NULL, NULL, NULL);
    (void)now;
    Sleep(16);
  }
  printf("DONE=1\n");
  fflush(stdout);
  IDirect3DDevice9_Release(dev);
  IDirect3D9_Release(d3d);
  return 0;
}
