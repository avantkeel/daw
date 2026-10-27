// Bundles Electron main/preload and both renderer entry points, then copies static files into dist/.
// Removing Electron later = delete the first two builds below.
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: "info" };

await Promise.all([
  // Electron main process
  build({
    ...common,
    entryPoints: ["src/platform/electron/main.ts"],
    outfile: "dist/main.js",
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["electron"],
  }),
  // Electron preload
  build({
    ...common,
    entryPoints: ["src/platform/electron/preload.ts"],
    outfile: "dist/preload.js",
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  // The actual app (runs in any browser-like runtime)
  build({
    ...common,
    entryPoints: ["src/renderer.ts"],
    outfile: "dist/renderer.js",
    platform: "browser",
    format: "iife",
    target: "chrome120",
  }),
  build({
    ...common,
    entryPoints: ["src/mixer-renderer.ts"],
    outfile: "dist/mixer-renderer.js",
    platform: "browser",
    format: "iife",
    target: "chrome120",
  }),
]);

await cp("src/ui/index.html", "dist/index.html");
await cp("src/ui/mixer.html", "dist/mixer.html");
await cp("src/ui/styles.css", "dist/styles.css");
