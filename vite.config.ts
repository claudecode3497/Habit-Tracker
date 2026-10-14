import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Writes dist/sw.js: an offline-first service worker that precaches every built file. */
function offlineServiceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "cadence:sw",
    apply: "build",
    configResolved(config) {
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push("/" + relative(outDir, full).split("\\").join("/"));
        }
      };
      walk(outDir);
      const precache = ["/", ...files.filter((f) => f !== "/sw.js" && !f.endsWith(".map"))];
      const version = Date.now().toString(36);
      writeFileSync(
        join(outDir, "sw.js"),
        `const CACHE = "cadence-${version}";
const FILES = ${JSON.stringify(precache)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match("/"))),
  );
});
`,
      );
    },
  };
}

export default defineConfig({
  server: { host: "0.0.0.0", port: 8080 },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: false }),
    tailwindcss(),
    viteReact(),
    offlineServiceWorker(),
  ],
});
