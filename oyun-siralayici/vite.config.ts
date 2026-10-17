import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";
export default defineConfig({
  plugins: [react()],
  // Shown in Ayarlar; read from package.json so it can never go stale again.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  base: "./",
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:4317" },
      "/media": { target: "http://127.0.0.1:4317" },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: "index.html", overlay: "overlay.html" } },
  },
});
