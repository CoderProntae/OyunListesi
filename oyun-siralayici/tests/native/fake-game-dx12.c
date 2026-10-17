/* Test: sahte oyun (D3D12 — Little Nightmares III'ün kullandığı yol).
 * Komut kuyruğu ve swapchain DLL yüklenmeden önce kurulur; katman,
 * ExecuteCommandLists kancasından kuyruğu yakalayıp aynı kuyruğa çizer. */
#include <initguid.h>
#define COBJMACROS
#define WIDL_C_INLINE_WRAPPERS
#include <windows.h>
#include <d3d12.h>
typedef HRESULT(WINAPI *D3D12CreateDevice_t)(IUnknown*,D3D_FEATURE_LEVEL,REFIID,void**);
static D3D12CreateDevice_t pD3D12CreateDevice;
#include <dxgi1_4.h>
#include <dxgi1_6.h>
#include <stdio.h>

static LRESULT CALLBACK wp(HWND h, UINT m, WPARAM w, LPARAM l) {
  if (m == WM_DESTROY) { PostQuitMessage(0); return 0; }
  return DefWindowProcW(h, m, w, l);
}

int main(int argc, char **argv) {
  static wchar_t stopFile[MAX_PATH];
  if (argc > 1) MultiByteToWideChar(CP_UTF8, 0, argv[1], -1, stopFile, MAX_PATH);
  printf("PID=%lu\n", GetCurrentProcessId());
  fflush(stdout);
  /* Test modu: cihaz kurulmadan ÖNCE enjeksiyon yapılabilmesi için pencereyi
     açıp bekler (gerçek uygulamada yardımcı süreç oyunu erken yakalayabilir). */
  int earlyDelay = argc > 2;
  WNDCLASSW wc = {0};
  wc.lpfnWndProc = wp;
  wc.hInstance = GetModuleHandleW(NULL);
  wc.lpszClassName = L"SahteOyun12";
  RegisterClassW(&wc);
  HWND hwnd = CreateWindowW(wc.lpszClassName, L"Sahte Oyun DX12", WS_POPUP | WS_VISIBLE, 0, 0, 1280, 720, NULL, NULL,
                            wc.hInstance, NULL);
  printf("WINDOW=1\n");
  fflush(stdout);
  if (earlyDelay) Sleep(6000);
  HMODULE d12 = LoadLibraryW(L"d3d12.dll");
  pD3D12CreateDevice = d12 ? (D3D12CreateDevice_t)GetProcAddress(d12, "D3D12CreateDevice") : NULL;
  IDXGIFactory2 *factory = NULL;
  HRESULT hr = CreateDXGIFactory2(0, &IID_IDXGIFactory2, (void **)&factory);
  printf("FACTORY=0x%08lx\n", (unsigned long)hr);
  ID3D12Device *dev = NULL;
  hr = pD3D12CreateDevice ? pD3D12CreateDevice(NULL, D3D_FEATURE_LEVEL_11_0, &IID_ID3D12Device, (void **)&dev) : E_FAIL;
  printf("DEVICE=0x%08lx\n", (unsigned long)hr);
  fflush(stdout);
  if (FAILED(hr)) return 1;
  D3D12_COMMAND_QUEUE_DESC qd = {0};
  qd.Type = D3D12_COMMAND_LIST_TYPE_DIRECT;
  ID3D12CommandQueue *queue = NULL;
  ID3D12Device_CreateCommandQueue(dev, &qd, &IID_ID3D12CommandQueue, (void **)&queue);
  DXGI_SWAP_CHAIN_DESC1 sd = {0};
  sd.BufferCount = 2;
  sd.Width = 1280;
  sd.Height = 720;
  sd.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
  sd.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
  sd.SampleDesc.Count = 1;
  sd.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;
  IDXGISwapChain1 *sc1 = NULL;
  IDXGISwapChain3 *sc3 = NULL;
  hr = IDXGIFactory2_CreateSwapChainForHwnd(factory, (IUnknown *)queue, hwnd, &sd, NULL, NULL, &sc1);
  printf("SWAPCHAIN=0x%08lx\n", (unsigned long)hr);
  fflush(stdout);
  if (FAILED(hr)) return 1;
  D3D12_DESCRIPTOR_HEAP_DESC hd = {0};
  hd.Type = D3D12_DESCRIPTOR_HEAP_TYPE_RTV;
  hd.NumDescriptors = 2;
  ID3D12DescriptorHeap *rtvHeap = NULL;
  ID3D12Device_CreateDescriptorHeap(dev, &hd, &IID_ID3D12DescriptorHeap, (void **)&rtvHeap);
  UINT inc = ID3D12Device_GetDescriptorHandleIncrementSize(dev, D3D12_DESCRIPTOR_HEAP_TYPE_RTV);
  D3D12_CPU_DESCRIPTOR_HANDLE h0 = ID3D12DescriptorHeap_GetCPUDescriptorHandleForHeapStart(rtvHeap);
  D3D12_CPU_DESCRIPTOR_HANDLE h1 = h0;
  h1.ptr += inc;
  ID3D12Resource *bb[2] = {NULL, NULL};
  IDXGISwapChain1_QueryInterface(sc1, &IID_IDXGISwapChain3, (void **)&sc3);
  IDXGISwapChain1_GetBuffer(sc1, 0, &IID_ID3D12Resource, (void **)&bb[0]);
  IDXGISwapChain1_GetBuffer(sc1, 1, &IID_ID3D12Resource, (void **)&bb[1]);
  ID3D12Device_CreateRenderTargetView(dev, bb[0], NULL, h0);
  ID3D12Device_CreateRenderTargetView(dev, bb[1], NULL, h1);
  ID3D12CommandAllocator *alloc = NULL;
  ID3D12Device_CreateCommandAllocator(dev, D3D12_COMMAND_LIST_TYPE_DIRECT, &IID_ID3D12CommandAllocator, (void **)&alloc);
  ID3D12GraphicsCommandList *list = NULL;
  ID3D12Device_CreateCommandList(dev, 0, D3D12_COMMAND_LIST_TYPE_DIRECT, alloc, NULL, &IID_ID3D12GraphicsCommandList,
                                 (void **)&list);
  ID3D12GraphicsCommandList_Close(list);
  printf("READY=1\n");
  fflush(stdout);
  for (int frame = 0; frame < 300; frame++) {
    if (frame % 10 == 0 && stopFile[0] && GetFileAttributesW(stopFile) != INVALID_FILE_ATTRIBUTES) break;
    UINT idx = IDXGISwapChain3_GetCurrentBackBufferIndex(sc3);
    ID3D12CommandAllocator_Reset(alloc);
    ID3D12GraphicsCommandList_Reset(list, alloc, NULL);
    D3D12_RESOURCE_BARRIER bar = {0};
    bar.Type = D3D12_RESOURCE_BARRIER_TYPE_TRANSITION;
    bar.Transition.pResource = bb[idx];
    bar.Transition.StateBefore = D3D12_RESOURCE_STATE_PRESENT;
    bar.Transition.StateAfter = D3D12_RESOURCE_STATE_RENDER_TARGET;
    bar.Transition.Subresource = D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES;
    ID3D12GraphicsCommandList_ResourceBarrier(list, 1, &bar);
    D3D12_CPU_DESCRIPTOR_HANDLE cur = idx == 0 ? h0 : h1;
    ID3D12GraphicsCommandList_OMSetRenderTargets(list, 1, &cur, FALSE, NULL);
    float red[4] = {1, 0, 0, 1};
    ID3D12GraphicsCommandList_ClearRenderTargetView(list, cur, red, 0, NULL);
    bar.Transition.StateBefore = D3D12_RESOURCE_STATE_RENDER_TARGET;
    bar.Transition.StateAfter = D3D12_RESOURCE_STATE_PRESENT;
    ID3D12GraphicsCommandList_ResourceBarrier(list, 1, &bar);
    ID3D12GraphicsCommandList_Close(list);
    ID3D12CommandList *lists[1] = {(ID3D12CommandList *)list};
    ID3D12CommandQueue_ExecuteCommandLists(queue, 1, lists);
    IDXGISwapChain1_Present(sc1, 0, 0);
    MSG msg;
    while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
      TranslateMessage(&msg);
      DispatchMessageW(&msg);
    }
    Sleep(33);
  }
  printf("GAME_DONE=1\n");
  fflush(stdout);
  return 0;
}
