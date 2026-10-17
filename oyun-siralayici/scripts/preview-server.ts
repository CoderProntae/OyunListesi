import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
const service = new Service(
  path.resolve(process.env.PREVIEW_DATA || ".cache/preview-data"),
  false,
);
const streams = new Set<http.ServerResponse>();
service.on("event", (event) => {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const s of streams) s.write(data);
});
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  const url = new URL(req.url || "/", "http://127.0.0.1");
  try {
    if (req.headers["sec-fetch-site"] === "cross-site") {
      res.writeHead(403);
      res.end("Kaynak engellendi");
      return;
    }
    if (url.pathname === "/api/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"ok":true,"desktop":false}');
      return;
    }
    if (url.pathname === "/api/events" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(": connected\n\n");
      streams.add(res);
      const timer = setInterval(() => res.write(": heartbeat\n\n"), 20000);
      req.on("close", () => {
        streams.delete(res);
        clearInterval(timer);
      });
      return;
    }
    if (url.pathname.startsWith("/media/") && req.method === "GET") {
      const name = url.pathname.slice(7);
      if (!/^[a-f0-9]{64}\.img$/.test(name)) throw new Error("Dosya engellendi.");
      const file = path.join(service.store.root, "media", name);
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      const bytes = fs.readFileSync(file);
      res.writeHead(200, {
        "Content-Type":
          bytes[0] === 0x89
            ? "image/png"
            : bytes.slice(0, 4).toString() === "RIFF"
              ? "image/webp"
              : "image/jpeg",
        "Cache-Control": "public,max-age=86400",
      });
      res.end(bytes);
      return;
    }
    if (url.pathname === "/api/call" && req.method === "POST") {
      if (req.headers["x-oyun-client"] !== "desktop-preview")
        throw new Error("İstek başlığı eksik.");
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 129_000_000) {
          res.writeHead(413);
          res.end();
          req.destroy();
          return;
        }
      }
      const { method, args } = JSON.parse(raw);
      const result = await service.call(method, args);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result: result ?? null }));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (e: any) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});
server.listen(4317, "0.0.0.0", () =>
  console.log(
    "Preview API ready on 4317. Browser preview cannot detect your PC or reach your local LM Studio.",
  ),
);
const close = () => {
  service.close();
  for (const r of streams) r.end();
  server.close(() => process.exit());
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
