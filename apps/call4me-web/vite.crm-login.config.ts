import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/login/",
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: "dist-crm-login",
    rollupOptions: {
      input: new URL("./crm-login.html", import.meta.url).pathname,
    },
  },
});
