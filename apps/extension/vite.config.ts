import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      "@zitrion/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
    },
  },
  css: {
    postcss: {},
  },
  build: {
    rollupOptions: {
      input: {
        popup: "src/popup/popup.html",
      },
    },
  },
});