import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
  AIGATE_UNAVAILABLE_HOLD,
  isAigateProxyPath,
  rewriteAigateProxyPath,
} from "./src/windsor/aigate-proxy";
import { rewriteWindsorMcpProxyPath } from "./src/windsor/proxy";

const root = dirname(fileURLToPath(import.meta.url));

function aigateTokenGuard(): Plugin {
  return {
    name: "aigate-token-guard",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0] ?? "";
        if (!isAigateProxyPath(path)) {
          next();
          return;
        }
        if (process.env.AIGATE_AUTH_TOKEN?.trim()) {
          next();
          return;
        }
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ error: AIGATE_UNAVAILABLE_HOLD }));
      });
    },
  };
}


/**
 * Serve c.html for /c/* while preserving the browser URL / location.pathname.
 * Internal rewrite only (dev + preview). Matches Stage A Caddy handle intent.
 */
function tenantPathSpaFallback(): Plugin {
  const rewrite = (req: { url?: string }) => {
    const raw = req.url ?? "";
    const path = raw.split("?")[0] ?? "";
    if (path === "/c" || path.startsWith("/c/")) {
      const qs = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      req.url = `/c.html${qs}`;
    }
  };
  return {
    name: "tenant-path-spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req);
        next();
      });
    },
  };
}

const hostProxies = {
  "/windsor-mcp": {
    target: "https://mcp.windsor.ai",
    changeOrigin: true,
    rewrite: rewriteWindsorMcpProxyPath,
  },
  "/aigate": {
    target: "https://bridge.makh.ai",
    changeOrigin: true,
    rewrite: rewriteAigateProxyPath,
    configure: (
      proxy: {
        on: (
          event: "proxyReq",
          listener: (proxyReq: {
            removeHeader: (name: string) => void;
            setHeader: (name: string, value: string) => void;
          }) => void,
        ) => void;
      },
    ) => {
      proxy.on("proxyReq", (proxyReq) => {
        const token = process.env.AIGATE_AUTH_TOKEN?.trim();
        if (!token) return;
        proxyReq.removeHeader("authorization");
        proxyReq.removeHeader("cookie");
        proxyReq.setHeader("Authorization", `Bearer ${token}`);
        proxyReq.setHeader("x-api-key", token);
      });
    },
  },
};

export default defineConfig({
  base: "./",
  plugins: [react(), aigateTokenGuard(), tenantPathSpaFallback()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        windsor: resolve(root, "windsor.html"),
        windsorCallback: resolve(root, "windsor-callback.html"),
        c: resolve(root, "c.html"),
      },
    },
  },
  server: { proxy: hostProxies },
  preview: { proxy: hostProxies },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.ts",
  },
});
