# CR-WINDSOR-WEB-PATH-A-PROXY-001 — Path A host + same-origin MCP proxy

Web first. Desktop EXE/installer is **not** this CR (stub only until after Monday).

No secrets. Do not paste tokens, OTP values, or API keys into chat or this file.
Write-actions stay **OFF**. Windsor is MCP tools only — not ChatGPT / Claude / Grok destination tiles.

## Product lock

| Surface | Role |
| --- | --- |
| SABRO AI chat | bridge / aigate (OUP) — unchanged |
| Windsor | MCP tools at `https://mcp.windsor.ai/` via OAuth PKCE, RO allowlist (`get_*` only) |
| github.io Path C | **ENGINEERING FALLBACK** — not MCP PASS |

## What this CR adds

Same-origin `/windsor-mcp` → `https://mcp.windsor.ai/` so the Identity-gated page can `POST` `tools/call` without browser CORS.

| Layer | File |
| --- | --- |
| Shared rewrite + proxy | `src/windsor/proxy.ts` |
| Local Vite (already present) | `vite.config.ts` `server` + `preview` |
| CRM Caddy (preferred public host) | `path-a/Caddyfile.windsor-mcp.snippet` |
| Cloudflare Worker (portable host) | `path-a/worker.ts` + `path-a/wrangler.toml` |
| Browser transport | `windsorMcpRequestUrl()` defaults to `/windsor-mcp/` |

`VITE_WINDSOR_MCP_PROXY=direct` is only for a github.io fallback build.

## Recommended public URL (smallest change)

**Host already live:** `https://crm.sabro.cloud` (Caddy, `/login/`, `/call4me/`).

After ops APPLY:

| Path | Purpose |
| --- | --- |
| `https://crm.sabro.cloud/call4me/windsor.html` | Identity-gated Windsor MCP page |
| `https://crm.sabro.cloud/call4me/windsor-callback.html` | PKCE callback |
| `https://crm.sabro.cloud/windsor-mcp/` | Same-origin MCP POST proxy |

`work.sabro.cloud` is Paperclip (Express). Do not mount Windsor there.

### Human / ops APPLY (CRM Caddy)

This agent cannot SSH the CRM box or edit live Caddy.

1. Rebuild: `pnpm --filter @sabro/call4me-web build` (needs `VITE_SUPABASE_PUBLISHABLE_KEY` in the build env — publishable, not a secret).
2. Rsync `apps/call4me-web/dist/` into the existing `/call4me/` file root (same place that already serves `https://crm.sabro.cloud/call4me/`).
3. Insert `path-a/Caddyfile.windsor-mcp.snippet` **before** the catch-all redir to `/login/`. Reload Caddy.
4. Confirm `POST https://crm.sabro.cloud/windsor-mcp/` returns Windsor `401` JSON (invalid token) — **not** a 302 to `/login/`, **not** github.io `404`/`405`.
5. Add the public callback to the Identity allow-list if magic-link redirects are origin-restricted:
   `https://crm.sabro.cloud/call4me/windsor.html`
6. Rahul / Harish: Identity OTP → **Connect Windsor** → **List connectors** (or worst Meta 30d). Not L0.

Until steps 1–4 land, Path A is **PROXY READY / AWAITING HOST APPLY**. Do not stamp MCP PASS.

## Alternate Path A host (Cloudflare Worker)

Use if CRM Caddy APPLY is blocked. Serves `dist/` plus `/windsor-mcp`.

```bash
pnpm --filter @sabro/call4me-web build
npx wrangler deploy --config apps/call4me-web/path-a/wrangler.toml
```

Then bind a SABRO hostname (preferred `https://windsor.sabro.cloud/windsor.html`) or use the `workers.dev` URL Wrangler prints. Same Identity + PKCE flow. This repo’s Cloudflare account listing had **zero** Workers — deploy is ops/CoS.

## Path C — FALLBACK only

`https://spsah.github.io/sabro-desktop-call4me-pages/windsor.html` can Identity-gate and complete OAuth. Static Pages cannot proxy `/windsor-mcp` (404 / 405). The UI stamps `PATH C FALLBACK (not MCP PASS)`. Optional human read: onboard.windsor.ai + CRM note. **Not MCP PASS.**

## Operator flow (Path A, after APPLY)

1. Open the SABRO URL above (not github.io).
2. **Rahul / Harish** sign in with **their** SABRO Identity OTP (magic link or 6-digit code). Not L0.
3. **Connect Windsor** — PKCE in this browser. Tokens stay in the tab session. No API key field.
4. **List connectors** (safest) or **Worst Meta campaign (30d)** — locked facebook / mmpl / `4192435737656223`.
5. Rows are **UNTRUSTED_EXTERNAL**. Writes denied (`list_actions` / `execute_action` / `create_*`).

AI answers still come from the SABRO bridge / aigate. Windsor only supplies MCP tool data.

## Prove without claiming PASS

- Unit: `pnpm --filter @sabro/call4me-web test`
- Local proxy: `pnpm --filter @sabro/call4me-web dev` then `POST /windsor-mcp/` → Windsor `401` (proxy up, no CORS).
- Live PASS requires the public URL + human OTP + Connect + one RO query.

## Out of scope

- Desktop EXE / installer / `sabro-desktop://` (post-Monday stub)
- Write-actions ON
- Windsor destination tiles
- VoiceLink
