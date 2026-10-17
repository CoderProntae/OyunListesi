import { BrowserWindow, WebContentsView, ipcMain, session } from "electron";
import path from "node:path";
import { browserURL, webNavigation, type BrowserState } from "../shared/browser";

type Tab = {
  id: string;
  view: WebContentsView;
  url: string;
  title: string;
  error?: string;
};
/** Remote pages have NO preload, application bridge, Node, or access to the app session. */
export class AppBrowser {
  window: BrowserWindow | null = null;
  private tabs: Tab[] = [];
  private activeId = "";
  private sequence = 0;
  private notice = "";
  private ready: Promise<void> | null = null;
  constructor() {
    const browsing = session.fromPartition("persist:oyun-browser");
    browsing.setPermissionRequestHandler((_wc, _permission, done) => done(false));
    browsing.setPermissionCheckHandler(() => false);
    browsing.on("will-download", (_event, item) => {
      item.setSaveDialogOptions({ title: "Dosyayı kaydet — Oyun Sıralayıcı" });
      this.notice = "İndiriliyor: " + item.getFilename();
      this.send();
      item.once("done", (_e, state) => {
        this.notice =
          state === "completed"
            ? "İndirildi: " + item.getSavePath()
            : "İndirme tamamlanmadı: " + state;
        this.send();
      });
    });
    ipcMain.handle("browser:command", (event, action: unknown, args: any = {}) => {
      if (
        !this.window ||
        event.sender !== this.window.webContents ||
        event.senderFrame !== this.window.webContents.mainFrame
      )
        throw new Error("Tarayıcı komut kaynağı geçersiz.");
      if (typeof action !== "string" || !args || typeof args !== "object")
        throw new Error("Geçersiz komut.");
      const tab = this.tabs.find((t) => t.id === this.activeId),
        wc = tab?.view.webContents;
      switch (action) {
        case "state":
          return this.state();
        case "new":
          return this.add(typeof args.url === "string" ? browserURL(args.url) : "");
        case "navigate":
          if (typeof args.url !== "string") throw new Error("Adres gerekli.");
          if (tab) this.navigate(tab, browserURL(args.url));
          break;
        case "select":
          this.select(String(args.id));
          break;
        case "close":
          this.closeTab(String(args.id));
          break;
        case "back":
          if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
          break;
        case "forward":
          if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
          break;
        case "reload":
          if (tab?.url) {
            tab.error = undefined;
            wc?.reload();
          }
          break;
        case "stop":
          wc?.stop();
          break;
        default:
          throw new Error("Bilinmeyen tarayıcı komutu.");
      }
      this.send();
    });
  }
  async open(input = "") {
    const url = browserURL(input);
    if (!this.window || this.window.isDestroyed()) this.create();
    await this.ready;
    // 2.1.4: the same address is not piled up in tabs. A store link clicked
    // twice from the game page brings the tab that is already open forward.
    const same = url ? this.tabs.find((t) => t.url === url) : undefined;
    if (same) this.select(same.id);
    else if (url || !this.tabs.length) this.add(url);
    if (this.window?.isMinimized()) this.window.restore();
    this.window?.show();
    this.window?.focus();
    this.send();
    if (!url) this.window?.webContents.send("browser:focus");
  }
  private create() {
    const win = new BrowserWindow({
      width: 1280,
      height: 850,
      minWidth: 680,
      minHeight: 460,
      show: false,
      backgroundColor: "#11131b",
      title: "Tarayıcı · Oyun Sıralayıcı",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "browser-preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        partition: "oyun-browser-chrome",
      },
    });
    this.window = win;
    win.setMenu(null);
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("before-input-event", (event, input) =>
      this.shortcut(event, input),
    );
    win.on("resize", () => this.layout());
    win.on("closed", () => {
      for (const tab of this.tabs)
        if (!tab.view.webContents.isDestroyed())
          tab.view.webContents.close({ waitForBeforeUnload: false });
      this.tabs = [];
      this.activeId = "";
      this.window = null;
      this.ready = null;
    });
    this.ready = win.loadFile(path.join(__dirname, "browser.html"));
  }
  private shortcut(event: Electron.Event, input: Electron.Input) {
    if (input.type !== "keyDown") return;
    const ctrl = input.control || input.meta,
      key = input.key.toLowerCase();
    if (ctrl && key === "l") {
      event.preventDefault();
      this.window?.webContents.focus();
      this.window?.webContents.send("browser:focus");
    } else if (ctrl && key === "t") {
      event.preventDefault();
      this.add("");
      this.window?.webContents.focus();
      this.window?.webContents.send("browser:focus");
    } else if (ctrl && key === "w") {
      event.preventDefault();
      this.closeTab(this.activeId);
    } else if (ctrl && key === "tab" && this.tabs.length) {
      event.preventDefault();
      const index = this.tabs.findIndex((t) => t.id === this.activeId);
      this.select(
        this.tabs[(index + (input.shift ? -1 : 1) + this.tabs.length) % this.tabs.length]
          .id,
      );
    }
  }
  private add(url: string) {
    if (!this.window) return;
    const view = new WebContentsView({
      webPreferences: {
        partition: "persist:oyun-browser",
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
      },
    });
    view.setBackgroundColor("#171923");
    const tab: Tab = { id: String(++this.sequence), view, url: "", title: "Yeni sekme" };
    this.tabs.push(tab);
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      if (webNavigation(url)) this.add(url);
      return { action: "deny" };
    });
    wc.on("will-navigate", (event, url) => {
      if (!webNavigation(url)) {
        event.preventDefault();
        this.notice = "Bu bağlantı bir HTTP(S) web sayfası değil.";
        this.send();
      }
    });
    wc.on("will-redirect", (event, url) => {
      if (!webNavigation(url)) event.preventDefault();
    });
    wc.on("will-attach-webview", (e) => e.preventDefault());
    // A page's "Leave site?" prompt never blocks closing (2.0.5: the app must
    // be able to close when an update takes over).
    wc.on("will-prevent-unload", (e) => e.preventDefault());
    wc.on("before-input-event", (event, input) => this.shortcut(event, input));
    wc.on("did-navigate", (_event, url) => {
      tab.url = webNavigation(url) ? url : "";
      tab.error = undefined;
      this.send();
    });
    wc.on("did-navigate-in-page", (_event, url, main) => {
      if (main) {
        tab.url = url;
        this.send();
      }
    });
    wc.on("page-title-updated", (_event, title) => {
      tab.title = tab.url ? title.slice(0, 250) : "Yeni sekme";
      this.send();
    });
    wc.on("did-start-loading", () => {
      tab.error = undefined;
      this.send();
    });
    wc.on("did-stop-loading", () => this.send());
    wc.on("did-fail-load", (_event, code, description, _url, main) => {
      if (main && code !== -3) {
        tab.error = "Sayfa yüklenemedi: " + description;
        this.send();
      }
    });
    wc.on("render-process-gone", () => {
      tab.error = "Sekme işlemi kapandı. Yenile düğmesini kullanabilirsin.";
      this.send();
    });
    this.select(tab.id);
    if (url) this.navigate(tab, url);
    this.send();
    return tab.id;
  }
  private navigate(tab: Tab, url: string) {
    tab.url = url;
    tab.error = undefined;
    tab.title = url ? new URL(url).hostname : "Yeni sekme";
    if (url) void tab.view.webContents.loadURL(url).catch(() => {});
    else {
      tab.view.webContents.stop();
      void tab.view.webContents.loadURL("about:blank").catch(() => {});
    }
    this.layout();
    this.send();
  }
  private select(id: string) {
    if (!this.tabs.some((t) => t.id === id)) return;
    for (const tab of this.tabs) this.window?.contentView.removeChildView(tab.view);
    this.activeId = id;
    const active = this.tabs.find((t) => t.id === id)!;
    if (active.url) {
      this.window?.contentView.addChildView(active.view);
      active.view.webContents.focus();
    }
    this.layout();
    this.send();
  }
  private closeTab(id: string) {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index < 0) return;
    const tab = this.tabs[index];
    this.window?.contentView.removeChildView(tab.view);
    this.tabs.splice(index, 1);
    tab.view.webContents.close({ waitForBeforeUnload: false });
    if (!this.tabs.length) this.add("");
    else if (this.activeId === id)
      this.select(this.tabs[Math.min(index, this.tabs.length - 1)].id);
    this.send();
  }
  private layout() {
    if (!this.window) return;
    const [width, height] = this.window.getContentSize(),
      tab = this.tabs.find((t) => t.id === this.activeId);
    if (tab?.url) {
      this.window.contentView.addChildView(tab.view);
      tab.view.setBounds({ x: 0, y: 120, width, height: Math.max(0, height - 148) });
    } else if (tab) this.window.contentView.removeChildView(tab.view);
  }
  private state(): BrowserState {
    return {
      activeId: this.activeId,
      notice: this.notice,
      tabs: this.tabs.map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        error: t.error,
        loading: t.view.webContents.isLoading(),
        back: t.view.webContents.navigationHistory.canGoBack(),
        forward: t.view.webContents.navigationHistory.canGoForward(),
      })),
    };
  }
  private send() {
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send("browser:state", this.state());
  }
  close() {
    this.window?.close();
  }
}
