import type { BrowserState } from "../shared/browser";
const bridge = (window as any).browserChrome as {
  command: (action: string, args?: object) => Promise<any>;
  onState: (cb: (s: BrowserState) => void) => void;
  onFocus: (cb: () => void) => void;
};
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const address = el<HTMLInputElement>("address"),
  status = el("status");
let state: BrowserState = { tabs: [], activeId: "" },
  lastId = "",
  lastURL = "";
const command = (action: string, args?: object) =>
  bridge.command(action, args).catch((e) => {
    status.textContent = e.message;
  });
function render(next: BrowserState) {
  state = next;
  const active = state.tabs.find((t) => t.id === state.activeId);
  const tabs = el("tabs");
  tabs.replaceChildren();
  for (const tab of state.tabs) {
    const wrapper = document.createElement("div");
    wrapper.className = "tab" + (tab.id === state.activeId ? " active" : "");
    const button = document.createElement("button");
    button.className = "tab-select";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.id === state.activeId));
    button.textContent = (tab.loading ? "◌ " : "") + tab.title;
    button.title = tab.title + (tab.url ? "\n" + tab.url : "");
    button.onclick = () => command("select", { id: tab.id });
    const close = document.createElement("button");
    close.className = "tab-close";
    close.textContent = "×";
    close.setAttribute("aria-label", tab.title + " sekmesini kapat");
    close.onclick = () => command("close", { id: tab.id });
    wrapper.append(button, close);
    tabs.append(wrapper);
  }
  const add = document.createElement("button");
  add.id = "new";
  add.textContent = "+";
  add.title = "Yeni sekme (Ctrl T)";
  add.setAttribute("aria-label", "Yeni sekme");
  add.onclick = async () => {
    await command("new");
    address.focus();
  };
  tabs.append(add);
  if (
    lastId !== state.activeId ||
    (lastURL !== active?.url && document.activeElement !== address)
  )
    address.value = active?.url || "";
  lastId = state.activeId;
  lastURL = active?.url || "";
  el<HTMLButtonElement>("back").disabled = !active?.back;
  el<HTMLButtonElement>("forward").disabled = !active?.forward;
  el("reload").textContent = active?.loading ? "×" : "↻";
  el("reload").setAttribute("aria-label", active?.loading ? "Durdur" : "Yenile");
  el("security").textContent = active?.url.startsWith("https:")
    ? "HTTPS"
    : active?.url
      ? "HTTP"
      : "ARA";
  el("home").hidden = Boolean(active?.url);
  status.textContent =
    active?.error ||
    (active?.loading
      ? "Sayfa yükleniyor…"
      : state.notice || active?.url || "Yeni sekme · Aramalar DuckDuckGo ile açılır.");
}
el("back").onclick = () => command("back");
el("forward").onclick = () => command("forward");
el("reload").onclick = () =>
  command(state.tabs.find((t) => t.id === state.activeId)?.loading ? "stop" : "reload");
el("address-form").onsubmit = (e) => {
  e.preventDefault();
  void command("navigate", { url: address.value }).then(() => address.blur());
};
address.onfocus = () => address.select();
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-url]"))
  button.onclick = () => command("navigate", { url: button.dataset.url });
bridge.onState(render);
bridge.onFocus(() => {
  address.focus();
  address.select();
});
void bridge.command("state").then(render);
