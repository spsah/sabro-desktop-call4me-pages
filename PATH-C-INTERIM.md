# PATH C INTERIM — not MCP PASS

This GitHub Pages host (`https://spsah.github.io/sabro-desktop-call4me-pages/`) is **static**.

Morning URL (Identity gate + Connect):

- https://spsah.github.io/sabro-desktop-call4me-pages/windsor.html
- Callback: https://spsah.github.io/sabro-desktop-call4me-pages/windsor-callback.html

**Stamp:** PATH C INTERIM. Do **not** treat this URL as MCP PASS.

CTO Path A requires a same-origin proxy:

```
/windsor-mcp  →  https://mcp.windsor.ai/
```

GitHub Pages cannot run a Cloudflare Worker or Pages Function on `*.github.io`. This account also has no Worker to attach. Path A host (Worker / Pages Function proxy) is left to CoS.

## CoS Path A drop-in (do not enable on this static host)

```js
export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const prefix = "/windsor-mcp";
    if (incoming.pathname !== prefix && !incoming.pathname.startsWith(`${prefix}/`)) {
      return fetch(request);
    }
    const upstream = new URL("https://mcp.windsor.ai/");
    const rest = incoming.pathname.slice(prefix.length);
    upstream.pathname = rest || "/";
    upstream.search = incoming.search;
    const headers = new Headers(request.headers);
    headers.delete("host");
    return fetch(new Request(upstream, { method: request.method, headers, body: request.body }));
  },
};
```

Never store Windsor API keys or other secrets in this Pages repo.
