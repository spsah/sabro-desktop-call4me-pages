import {
  handleAigateProxyRequest,
  isAigateProxyPath,
} from "../src/windsor/aigate-proxy";
import {
  handleWindsorMcpProxyRequest,
  isWindsorMcpProxyPath,
} from "../src/windsor/proxy";

type AssetEnv = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  AIGATE_AUTH_TOKEN?: string;
};

function isAppSabroCloud(hostname: string): boolean {
  return hostname === "app.sabro.cloud";
}

export default {
  async fetch(request: Request, env: AssetEnv): Promise<Response> {
    const url = new URL(request.url);
    if (isWindsorMcpProxyPath(url.pathname)) {
      return handleWindsorMcpProxyRequest(request);
    }
    if (isAigateProxyPath(url.pathname)) {
      return handleAigateProxyRequest(request, {
        authToken: env.AIGATE_AUTH_TOKEN,
      });
    }
    // Exact / is the Windsor shelf. /index.html stays Call4Me for the in-shell iframe.
    if (isAppSabroCloud(url.hostname) && url.pathname === "/") {
      return env.ASSETS.fetch(new Request(new URL("/windsor.html", url)));
    }
    return env.ASSETS.fetch(request);
  },
};
