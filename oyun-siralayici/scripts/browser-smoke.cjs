const { _electron } = require("playwright");
const path = require("path");
const fs = require("fs");
const http = require("http");
const assert = require("node:assert/strict");
(async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    const title =
      req.url === "/next"
        ? "İkinci sayfa"
        : req.url === "/popup"
          ? "Yeni ürün"
          : "Test mağazası";
    res.end(
      `<html><head><title>${title}</title></head><body style="background:#212436;color:#eee;font:18px system-ui;padding:60px"><h1>${title}</h1><p>Yerel test sunucusu · Gerçek mağaza değildir.</p><a id="next" href="/next">Sonraki sayfa</a> · <a id="popup" target="_blank" href="/popup">Yeni sekmede ürün</a></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const root = fs.mkdtempSync(path.resolve(".cache/browser-smoke-"));
  const app = await _electron.launch({
    args: [path.resolve("electron-dist/main.cjs"), "--no-sandbox", "--disable-gpu"],
    env: { ...process.env, XDG_CONFIG_HOME: root },
    timeout: 25000,
  });
  try {
    const main = await app.firstWindow();
    await main.getByRole("heading", { name: "İstatistikler", exact: true }).waitFor();
    const newWindow = app.waitForEvent("window");
    await main.getByRole("button", { name: "Tarayıcı", exact: true }).click();
    const browser = await newWindow;
    browser.on("pageerror", (e) => console.error("BROWSER PAGEERROR", e.message));
    const address = browser.getByRole("textbox", { name: "Adres veya arama" });
    await address.waitFor();
    await address.fill(origin + "/");
    await address.press("Enter");
    await browser.getByRole("tab", { name: "Test mağazası", exact: true }).waitFor();
    const isolation = await app.evaluate(async ({ webContents, session }, origin) => {
      const wc = webContents.getAllWebContents().find((w) => w.getURL() === origin + "/");
      return {
        values: await wc.executeJavaScript(
          "({desktop:typeof window.desktop,browser:typeof window.browserChrome,node:typeof require})",
        ),
        prefs: wc.getLastWebPreferences(),
        isolatedSession: wc.session === session.fromPartition("persist:oyun-browser"),
      };
    }, origin);
    assert.deepEqual(isolation.values, {
      desktop: "undefined",
      browser: "undefined",
      node: "undefined",
    });
    assert.equal(isolation.prefs.contextIsolation, true);
    assert.equal(isolation.prefs.sandbox, true);
    assert.equal(isolation.prefs.nodeIntegration, false);
    assert.equal(isolation.isolatedSession, true);
    await app.evaluate(
      ({ webContents }, origin) =>
        webContents
          .getAllWebContents()
          .find((w) => w.getURL() === origin + "/")
          .executeJavaScript('document.getElementById("next").click()', true),
      origin,
    );
    await browser.getByRole("tab", { name: "İkinci sayfa", exact: true }).waitFor();
    await browser.getByRole("button", { name: "Geri", exact: true }).click();
    await browser.getByRole("tab", { name: "Test mağazası", exact: true }).waitFor();
    await browser.getByRole("button", { name: "İleri", exact: true }).click();
    await browser.getByRole("tab", { name: "İkinci sayfa", exact: true }).waitFor();
    await browser.getByRole("button", { name: "Yeni sekme", exact: true }).click();
    await browser.getByRole("tab", { name: "Yeni sekme", exact: true }).waitFor();
    await address.fill(origin + "/");
    await address.press("Enter");
    await browser.getByRole("tab", { name: "Test mağazası", exact: true }).waitFor();
    await app.evaluate(
      ({ webContents }, origin) =>
        webContents
          .getAllWebContents()
          .find((w) => w.getURL() === origin + "/")
          .executeJavaScript('document.getElementById("popup").click()', true),
      origin,
    );
    await browser.getByRole("tab", { name: "Yeni ürün", exact: true }).waitFor();
    assert.equal(await browser.getByRole("tab").count(), 3);
    await browser
      .getByRole("button", { name: "Yeni ürün sekmesini kapat", exact: true })
      .click();
    assert.equal(await browser.getByRole("tab").count(), 2);
    await browser.getByRole("tab", { name: "İkinci sayfa", exact: true }).click();
    await app.evaluate(
      ({ webContents }, origin) =>
        webContents
          .getAllWebContents()
          .find((w) => w.getURL() === origin + "/next")
          .sendInputEvent({ type: "keyDown", keyCode: "L", modifiers: ["control"] }),
      origin,
    );
    await browser.waitForFunction(() => document.activeElement?.id === "address");
    await address.fill("file:///etc/passwd");
    await address.press("Enter");
    await browser.getByRole("status").filter({ hasText: "yalnızca HTTP(S)" }).waitFor();
    assert.equal(
      await app.evaluate(({ webContents }) =>
        webContents.getAllWebContents().some((w) => w.getURL().includes("/etc/passwd")),
      ),
      false,
    );
    await main.evaluate(
      (url) => window.desktop.call("openExternal", { url }),
      origin + "/popup",
    );
    await browser.getByRole("tab", { name: "Yeni ürün", exact: true }).waitFor();
    assert.equal(await browser.getByRole("tab").count(), 3);
    // 2.1.4: the same store link a second time brings the open tab forward
    // instead of piling up an identical tab.
    await browser.getByRole("tab", { name: "İkinci sayfa", exact: true }).click();
    await main.evaluate(
      (url) => window.desktop.call("openExternal", { url }),
      origin + "/popup",
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(await browser.getByRole("tab").count(), 3);
    assert.equal(
      await browser
        .getByRole("tab", { name: "Yeni ürün", exact: true })
        .evaluate((el) => el.closest(".tab").classList.contains("active")),
      true,
      "the already open tab is brought forward",
    );
    // Page.screenshot captures only browser chrome, not sibling native WebContentsViews.
    await app.evaluate(async ({ webContents }, origin) => {
      const wc = webContents
        .getAllWebContents()
        .find((w) => w.getURL() === origin + "/popup");
      await wc.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
    }, origin);
    const bounds = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle().includes("Tarayıcı"))
        .getBounds(),
    );
    require("node:child_process").execFileSync("python3", [
      "-c",
      "from PIL import ImageGrab; ImageGrab.grab().crop((" +
        [bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height].join(
          ",",
        ) +
        `)).save("docs/tarayici-${require("../package.json").version}.png")`,
    ]);
    await browser.close();
    const reopened = app.waitForEvent("window");
    await main.getByRole("button", { name: "Tarayıcı", exact: true }).click();
    const again = await reopened;
    await again.getByRole("textbox", { name: "Adres veya arama" }).waitFor();
    console.log(
      JSON.stringify(
        {
          platform: "Linux; not a Windows runtime test",
          manualTopMenu: true,
          addressNavigation: true,
          tabCreateCloseSwitch: true,
          popupInNewTab: true,
          appLinkInSameBrowser: true,
          backForward: true,
          ctrlL: true,
          blockedFileNavigation: true,
          remoteHasNoAppBridge: true,
          isolatedSession: true,
          reopening: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
