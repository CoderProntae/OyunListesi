/* Test: sahte oyun (OpenGL). Bağlam kurulur, her karede wglSwapBuffers
 * çağrılır; katman IAT yamasıyla bu çağrıyı yakalayıp aynı bağlama çizer.
 * Erken enjeksiyon senaryosu: pencere açıldıktan sonra beklenir. */
#include <windows.h>
#include <GL/gl.h>
#include <stdio.h>

/* wglSwapBuffers'ın bildirimi wingdi.h'de koşulludur; IAT üzerinden gitmesi
   için elle bildirip opengl32'ye bağlanıyoruz (kanca IAT yamasıyla çalışır). */
BOOL WINAPI wglSwapBuffers(HDC);

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
  wc.lpszClassName = L"SahteOyunGL";
  RegisterClassW(&wc);
  HWND hwnd = CreateWindowW(wc.lpszClassName, L"Sahte Oyun OpenGL", WS_POPUP | WS_VISIBLE, 0, 0, 1280, 720, NULL, NULL,
                            wc.hInstance, NULL);
  printf("WINDOW=1\n");
  fflush(stdout);
  if (earlyDelay) Sleep(6000);
  HDC hdc = GetDC(hwnd);
  PIXELFORMATDESCRIPTOR pfd = {0};
  pfd.nSize = sizeof pfd;
  pfd.nVersion = 1;
  pfd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
  pfd.iPixelType = PFD_TYPE_RGBA;
  pfd.cColorBits = 32;
  pfd.cDepthBits = 24;
  int fmt = ChoosePixelFormat(hdc, &pfd);
  printf("PIXFMT=%d\n", fmt);
  if (!fmt || !SetPixelFormat(hdc, fmt, &pfd)) return 1;
  HGLRC rc = wglCreateContext(hdc);
  if (!rc || !wglMakeCurrent(hdc, rc)) {
    printf("CTX=FAIL\n");
    return 1;
  }
  printf("READY=1\n");
  fflush(stdout);
  for (int i = 0; i < 400; i++) {
    HANDLE h = CreateFileW(stopFile, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
    if (h != INVALID_HANDLE_VALUE) {
      CloseHandle(h);
      break;
    }
    glClearColor(0.12f, 0.18f, 0.25f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
    wglSwapBuffers(hdc);
    Sleep(16);
  }
  printf("DONE=1\n");
  fflush(stdout);
  wglMakeCurrent(NULL, NULL);
  wglDeleteContext(rc);
  ReleaseDC(hwnd, hdc);
  return 0;
}
