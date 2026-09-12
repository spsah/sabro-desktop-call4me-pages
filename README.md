# Call4Me web deployment

Generated deployment artifacts only. The implementation and product home are
[`spsah/sabro-desktop`](https://github.com/spsah/sabro-desktop), package
`apps/call4me-web`.

Published paths:

- Call4Me: [`index.html`](./index.html)
- Windsor Identity gate + Connect: [`windsor.html`](./windsor.html)
- Windsor Identity / OAuth callback: [`windsor-callback.html`](./windsor-callback.html)

## PATH C INTERIM — not MCP PASS

This GitHub Pages site is a **static** host. Morning ops use `windsor.html`
for SABRO Identity + Windsor Connect only.

Do **not** claim Windsor **MCP PASS** from this URL. Path A (same-origin
`/windsor-mcp` → `https://mcp.windsor.ai/`) needs a Cloudflare Worker or
Pages Function on a Path A host and is left to CoS.

See [`PATH-C-INTERIM.md`](./PATH-C-INTERIM.md).
