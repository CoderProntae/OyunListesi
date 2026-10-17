/* Test: yardımcı sürecin yaptığı enjeksiyonun aynısı (CreateRemoteThread). */
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char **argv) {
  if (argc < 3) {
    printf("kullanim: inject <pid> <dll>\n");
    return 2;
  }
  DWORD pid = (DWORD)atoi(argv[1]);
  wchar_t dll[MAX_PATH * 2];
  MultiByteToWideChar(CP_UTF8, 0, argv[2], -1, dll, MAX_PATH * 2);
  HANDLE h = OpenProcess(PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ,
                         FALSE, pid);
  if (!h) {
    printf("INJECT=OPENFAIL %lu\n", GetLastError());
    return 1;
  }
  HMODULE k32 = GetModuleHandleW(L"kernel32.dll");
  FARPROC ll = GetProcAddress(k32, "LoadLibraryW");
  SIZE_T bytes = (wcslen(dll) + 1) * sizeof(wchar_t);
  void *remote = VirtualAllocEx(h, NULL, bytes, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
  if (!remote) {
    printf("INJECT=ALLOCFAIL %lu\n", GetLastError());
    return 1;
  }
  WriteProcessMemory(h, remote, dll, bytes, NULL);
  HANDLE t = CreateRemoteThread(h, NULL, 0, (LPTHREAD_START_ROUTINE)ll, remote, 0, NULL);
  if (!t) {
    printf("INJECT=THREADFAIL %lu\n", GetLastError());
    return 1;
  }
  WaitForSingleObject(t, 15000);
  DWORD code = 0;
  GetExitCodeThread(t, &code);
  printf("INJECT=%s base=0x%lx\n", code ? "OK" : "FAIL", code);
  CloseHandle(t);
  VirtualFreeEx(h, remote, 0, MEM_RELEASE);
  CloseHandle(h);
  return code ? 0 : 1;
}
