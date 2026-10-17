/* Kanca yardımcıları, koruma taraması ve enjeksiyon.
 * vtable kancası: COM arayüzlerinin vtable'ı süreçte paylaşılır, bu yüzden
 * DLL oyun başladıktan sonra yüklense bile mevcut nesneler yakalanır.
 * Kod yamama (inline hook) YOKTUR: yalnız vtable ve IAT değiştirilir. */
#include "katman.h"
#include <psapi.h>
#include <tlhelp32.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

void *vt_hook(void *iface, int idx, void *replacement) {
  if (!iface || idx < 0) return NULL;
  void **vt = *(void ***)iface;
  if (!vt) return NULL;
  void *original = vt[idx];
  if (original == replacement) return replacement;
  DWORD old = 0;
  size_t bytes = sizeof(void *) * (size_t)(idx + 1);
  if (!VirtualProtect(vt, bytes, PAGE_EXECUTE_READWRITE, &old)) {
    KAT_LOG("vtable korunamadı (idx=%d) err=%lu", idx, GetLastError());
    return NULL;
  }
  vt[idx] = replacement;
  VirtualProtect(vt, bytes, old, &old);
  FlushInstructionCache(GetCurrentProcess(), vt, bytes);
  return original;
}

bool vt_unhook(void *iface, int idx, void *original) {
  if (!iface || !original) return false;
  void **vt = *(void ***)iface;
  DWORD old = 0;
  size_t bytes = sizeof(void *) * (size_t)(idx + 1);
  if (!VirtualProtect(vt, bytes, PAGE_EXECUTE_READWRITE, &old)) return false;
  vt[idx] = original;
  VirtualProtect(vt, bytes, old, &old);
  return true;
}

/* Modül başlıkları okunmadan önce sayfa korunabilirliği doğrulanır: süreçte
 * bozuk/sahte modül tabanları olabiliyor (özellikle Wine altında) ve başlık
 * okuması oyunun çökmesi demek. */
static bool readable(const void *p, size_t n) {
  MEMORY_BASIC_INFORMATION mbi;
  if (!VirtualQuery(p, &mbi, sizeof mbi)) return false;
  if (mbi.State != MEM_COMMIT) return false;
  DWORD prot = mbi.Protect;
  if (prot & (PAGE_NOACCESS | PAGE_GUARD)) return false;
  const BYTE *end = (const BYTE *)p + n;
  return end <= (const BYTE *)mbi.BaseAddress + mbi.RegionSize || VirtualQuery(end, &mbi, sizeof mbi) != 0;
}

static bool patch_iat_of(HMODULE mod, const char *dllName, const char *funcName, void *replacement, void **original) {
  BYTE *base = (BYTE *)mod;
  if (!readable(base, sizeof(IMAGE_DOS_HEADER))) return false;
  IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER *)base;
  if (dos->e_magic != IMAGE_DOS_SIGNATURE) return false;
  if (dos->e_lfanew <= 0 || dos->e_lfanew > 0x1000) return false;
  if (!readable(base + dos->e_lfanew, sizeof(IMAGE_NT_HEADERS))) return false;
  IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS *)(base + dos->e_lfanew);
  if (nt->Signature != IMAGE_NT_SIGNATURE) return false;
  if (nt->OptionalHeader.Magic != IMAGE_NT_OPTIONAL_HDR_MAGIC) return false;
  IMAGE_DATA_DIRECTORY *dir = &nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT];
  if (!dir->VirtualAddress || dir->Size < sizeof(IMAGE_IMPORT_DESCRIPTOR)) return false;
  if (!readable(base + dir->VirtualAddress, dir->Size)) return false;
  IMAGE_IMPORT_DESCRIPTOR *imp = (IMAGE_IMPORT_DESCRIPTOR *)(base + dir->VirtualAddress);
  bool done = false;
  for (; imp->Name; imp++) {
    if (!readable(base + imp->Name, 4)) break;
    const char *name = (const char *)(base + imp->Name);
    if (_stricmp(name, dllName) != 0) continue;
    IMAGE_THUNK_DATA *oft = imp->OriginalFirstThunk ? (IMAGE_THUNK_DATA *)(base + imp->OriginalFirstThunk) : NULL;
    IMAGE_THUNK_DATA *ft = (IMAGE_THUNK_DATA *)(base + imp->FirstThunk);
    if (!readable(ft, sizeof(IMAGE_THUNK_DATA))) continue;
    if (oft && !readable(oft, sizeof(IMAGE_THUNK_DATA))) oft = NULL;
    for (; ft->u1.Function; ft++, (oft ? oft++ : 0)) {
      const char *fname = NULL;
      if (oft) {
        if (oft->u1.Ordinal & IMAGE_ORDINAL_FLAG) continue;
        IMAGE_IMPORT_BY_NAME *ibn = (IMAGE_IMPORT_BY_NAME *)(base + oft->u1.AddressOfData);
        fname = (const char *)ibn->Name;
      }
      if (!fname) continue;
      if (strcmp(fname, funcName) != 0) continue;
      void **slot = (void **)&ft->u1.Function;
      DWORD old = 0;
      if (!VirtualProtect(slot, sizeof(void *), PAGE_READWRITE, &old)) {
        KAT_LOG("IAT korunamadi: %s!%s err=%lu", dllName, funcName, GetLastError());
        continue;
      }
      if (*slot == replacement) { /* zaten yamalı */
        if (original && !*original) *original = NULL;
        done = true;
        continue;
      }
      if (original && !*original) *original = (void *)*slot;
      *slot = replacement;
      VirtualProtect(slot, sizeof(void *), old, &old);
      KAT_LOG("IAT yamalandi: %s!%s -> %p (eski %p)", dllName, funcName, replacement, *original);
      done = true;
    }
  }
  return done;
}

bool iat_patch_module(HMODULE mod, const char *dllName, const char *funcName, void *replacement, void **original) {
  if (!mod) return false;
  return patch_iat_of(mod, dllName, funcName, replacement, original);
}

bool iat_patch_all_loaded(const char *dllName, const char *funcName, void *replacement, void **original) {
  /* Önce ana yürütülebilir ve kendi modülümüz: bunlar neredeyse her zaman
     grafik API'sini içe aktarır. Ardından diğer modüller, ama her biri için
     başlık doğrulaması yapılır (readable) ve hata durumunda o modül atlanır. */
  bool any = false;
  HMODULE mainMod = GetModuleHandleW(NULL);
  if (mainMod) any = patch_iat_of(mainMod, dllName, funcName, replacement, original) || any;
  HMODULE mods[512];
  DWORD needed = 0;
  if (!EnumProcessModules(GetCurrentProcess(), mods, sizeof mods, &needed)) return any;
  size_t n = needed / sizeof(HMODULE);
  if (n > sizeof mods / sizeof mods[0]) n = sizeof mods / sizeof mods[0];
  for (size_t i = 0; i < n; i++) {
    if (mods[i] == mainMod) continue;
    wchar_t name[MAX_PATH];
    if (GetModuleFileNameW(mods[i], name, MAX_PATH)) {
      const wchar_t *base = wcsrchr(name, L'\\');
      base = base ? base + 1 : name;
      /* Sistem DLL'lerine dokunma: ntdll/kernel32/user32 gibi modüllerin IAT'ini
         yamalamak beklenmedik çöküşlere yol açabilir. */
      if (!_wcsicmp(base, L"ntdll.dll") || !_wcsicmp(base, L"kernel32.dll") || !_wcsicmp(base, L"kernelbase.dll") ||
          !_wcsicmp(base, L"user32.dll") || !_wcsicmp(base, L"gdi32.dll") || !_wcsicmp(base, L"dxgi.dll") ||
          !_wcsicmp(base, L"d3d11.dll") || !_wcsicmp(base, L"d3d12.dll") || !_wcsicmp(base, L"d3d9.dll") ||
          !_wcsicmp(base, L"opengl32.dll") || !_wcsicmp(base, L"vulkan-1.dll"))
        continue;
    }
    any = patch_iat_of(mods[i], dllName, funcName, replacement, original) || any;
  }
  return any;
}

/* ---------------- koruma taraması ----------------
 * Bilinen anti-hile / anti-tamper modülleri. Bunlardan biri varsa enjekte
 * ETMİYORUZ: yasaklanma riski kullanıcının üstüne bırakılmaz. */
static const struct {
  const char *module;
  const char *label;
} GUARDS[] = {
    {"EasyAntiCheat.dll", "Easy Anti-Cheat"},
    {"EasyAntiCheat_EOS.dll", "Easy Anti-Cheat (Epic)"},
    {"BEService.dll", "BattlEye"},
    {"BEClient.dll", "BattlEye"},
    {"BEClient_x64.dll", "BattlEye"},
    {"vgk.dll", "Riot Vanguard"},
    {"vgc.dll", "Riot Vanguard"},
    {"xigncode3.xem", "XIGNCODE3"},
    {"npggame.dll", "nProtect GameGuard"},
    {"GameMon.des", "nProtect GameGuard"},
    {"faceitclient.dll", "FACEIT"},
    {"faceit.dll", "FACEIT"},
    {"eslac.dll", "ESL Anti-Cheat"},
    {"acclient.dll", "Anti-Cheat Client"},
    {"TenSLX.dll", "TenProtect"},
    {"SGuard64.exe", "ACE (Tencent)"},
    {"ACE-BASE.dll", "ACE (Tencent)"},
    {"denuvo64.dll", "Denuvo"},
    {"DenuvoNTD.dll", "Denuvo"},
    {"steam_api64.dll", NULL}, /* Steam API koruma değildir: yok say */
};

static bool list_modules(DWORD pid, char *found, size_t foundLen) {
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
  if (snap == INVALID_HANDLE_VALUE) return false;
  MODULEENTRY32W me;
  me.dwSize = sizeof me;
  bool hit = false;
  if (Module32FirstW(snap, &me)) {
    do {
      char name[MAX_PATH];
      WideCharToMultiByte(CP_UTF8, 0, me.szModule, -1, name, sizeof name, NULL, NULL);
      for (size_t i = 0; i < sizeof GUARDS / sizeof GUARDS[0]; i++) {
        if (!GUARDS[i].label) continue;
        if (_stricmp(name, GUARDS[i].module) == 0) {
          if (found && foundLen) snprintf(found, foundLen, "%s", GUARDS[i].label);
          hit = true;
          break;
        }
      }
      if (hit) break;
    } while (Module32NextW(snap, &me));
  }
  CloseHandle(snap);
  return hit;
}

bool guard_scan_process(DWORD pid, char *found, size_t foundLen) {
  if (found && foundLen) found[0] = 0;
  /* Vanguard çekirdek sürücüsüyle çalışır: servis süreçleri de bakılır */
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap != INVALID_HANDLE_VALUE) {
    PROCESSENTRY32W pe;
    pe.dwSize = sizeof pe;
    if (Process32FirstW(snap, &pe)) {
      do {
        char name[MAX_PATH];
        WideCharToMultiByte(CP_UTF8, 0, pe.szExeFile, -1, name, sizeof name, NULL, NULL);
        if (!_stricmp(name, "vgc.exe") || !_stricmp(name, "vgk.exe") || !_stricmp(name, "EasyAntiCheat.exe") ||
            !_stricmp(name, "BEService.exe") || !_stricmp(name, "faceitclient.exe") || !_stricmp(name, "SGuard64.exe")) {
          if (found && foundLen) snprintf(found, foundLen, "%s", name);
          CloseHandle(snap);
          return true;
        }
      } while (Process32NextW(snap, &pe));
    }
    CloseHandle(snap);
  }
  return list_modules(pid, found, foundLen);
}

/* ---------------- süreç bit derinliği ---------------- */
bool kat_process_bits(DWORD pid, int *bits) {
  HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!h) return false;
  BOOL wow = FALSE;
  bool ok = IsWow64Process(h, &wow) ? true : false;
  if (ok) *bits = wow ? 32 : (sizeof(void *) == 8 ? 64 : 32);
  CloseHandle(h);
  return ok;
}

/* ---------------- enjeksiyon (yardımcı süreçte çalışır) ---------------- */
typedef HMODULE(WINAPI *LoadLibraryW_t)(LPCWSTR);
typedef BOOL(WINAPI *FreeLibrary_t)(HMODULE);

bool kat_inject(DWORD pid, const char *dllPath, char *err, size_t errLen) {
  if (err && errLen) err[0] = 0;
  wchar_t wdll[MAX_PATH * 2];
  if (!MultiByteToWideChar(CP_UTF8, 0, dllPath, -1, wdll, sizeof wdll / sizeof wdll[0])) {
    if (err) snprintf(err, errLen, "DLL yolu çevrilemedi");
    return false;
  }
  DWORD access = PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ;
  HANDLE h = OpenProcess(access, FALSE, pid);
  if (!h) {
    DWORD e = GetLastError();
    if (err) snprintf(err, errLen, e == 5 ? "Oyun yonetici olarak calisiyor: erisilemedi" : "Oyun sureci acilamadi (%lu)", e);
    return false;
  }
  HMODULE k32 = GetModuleHandleW(L"kernel32.dll");
  LoadLibraryW_t ll = (LoadLibraryW_t)GetProcAddress(k32, "LoadLibraryW");
  bool ok = false;
  SIZE_T bytes = (wcslen(wdll) + 1) * sizeof(wchar_t);
  void *remote = VirtualAllocEx(h, NULL, bytes, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
  if (remote) {
    if (WriteProcessMemory(h, remote, wdll, bytes, NULL)) {
      HANDLE t = CreateRemoteThread(h, NULL, 0, (LPTHREAD_START_ROUTINE)ll, remote, 0, NULL);
      if (t) {
        WaitForSingleObject(t, 10000);
        DWORD code = 0;
        GetExitCodeThread(t, &code);
        ok = code != 0; /* LoadLibraryW dönüşü: modül tabanı, 0 = başarısız */
        if (!ok && err) snprintf(err, errLen, "DLL oyunun icinde yuklenemedi");
        CloseHandle(t);
      } else if (err)
        snprintf(err, errLen, "Uzak is parcacigi olusturulamadi (%lu)", GetLastError());
    } else if (err)
      snprintf(err, errLen, "DLL yolu yazilamadi (%lu)", GetLastError());
    VirtualFreeEx(h, remote, 0, MEM_RELEASE);
  } else if (err)
    snprintf(err, errLen, "Oyunun belleginde yer ayrilamadi (%lu)", GetLastError());
  CloseHandle(h);
  return ok;
}

bool kat_eject(DWORD pid, char *err, size_t errLen) {
  (void)pid;
  (void)err;
  (void)errLen;
  /* Çıkarma, paylaşımlı bellekteki quit bayrağıyla yapılır: DLL kendini söker.
     Uzaktan FreeLibrary çağırmak oyunu çökertebildiği için kullanılmıyor. */
  return true;
}
