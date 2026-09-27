import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [react()],
  publicDir: "sdk-sample",
  build: {
    emptyOutDir: true,
    minify: "esbuild",
    lib: {
      entry: new URL("./src/sdk.tsx", import.meta.url).pathname,
      fileName: () => "call4me-sdk.js",
      formats: ["iife"],
      name: "SABROCall4MeBundle",
    },
    outDir: "dist-sdk",
  },
});
