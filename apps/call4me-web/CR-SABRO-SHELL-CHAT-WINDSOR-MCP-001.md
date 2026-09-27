# CR-SABRO-SHELL-CHAT-WINDSOR-MCP-001 — Slice 1 (Windsor in shell chat)

Authority: L0 final=query · CTO ACCEPT invent · CoS kick.

Parent invent GENERIC-MCP-HOST remains. This slice is Windsor-in-shell-chat first.

## What landed

Identity-gated **freehand shell chat** on the existing Call4Me web entry
(`apps/call4me-web/windsor.html` → `WindsorApp`). This is the real SABRO web
shell that already has Identity + Windsor Path A. `apps/web` is the PostHog
portability host and was not used.

| Surface | Role |
| --- | --- |
| Freehand chat | `handleWebChat` — same shape as desktop `bootstrap.ts` `handleChat` |
| Model | same-origin `/aigate` → `https://bridge.makh.ai` (no ChatGPT / Claude / Grok tiles) |
| Meta ads | Windsor MCP tools from `src/windsor/policy.ts` (do not fork a second allowlist) |
| Connect | one OAuth PKCE; tokens stay in the tab |

Policy twin stays PR #21: write-actions **ON**, allowlisted Meta ids
`4192435737656223` (mmpl, primary), `1401505225224082`, `272592740320720`,
OAuth scopes `offline_access create delete`. Ice tenants are not these
accounts.

List connectors / Worst Meta campaign (30d) are **interim prove** only. Hidden
unless `?prove=1` or `VITE_WINDSOR_PROVE_UI=1`.

L0 addendum: the same shell will later embed Twenty CRM for **Harish only**.
This PR adds only a hide-until-invite CRM nav + placeholder (`?view=crm`).
No iframe / full embed. CoS stamps Identity `app_metadata.crm_embed` (or
Harish email local-part) so others never see the nav.

## Rahul test URL

Preferred after CoS cutover:

`https://app.sabro.cloud/` (worker rewrites `/` → `/windsor.html`)

Until DNS / Caddy / Worker APPLY (currently 404):

- Path A if already live: `https://crm.sabro.cloud/call4me/windsor.html`
- Local: `pnpm --filter @sabro/call4me-web dev` then `http://localhost:5173/windsor.html`

Human steps (not L0): Identity OTP → **Connect Windsor** once → type a freehand
ads question (example: “worst Meta ads campaign last 30 days”). Ordinary chat
needs `/aigate` APPLY.

## CoS redeploy (cutover)

This PR does not mutate live hosts or put secrets in git.

1. Build: `pnpm --filter @sabro/call4me-web build`  
   Needs `VITE_SUPABASE_PUBLISHABLE_KEY` in the build env (publishable, not a secret).
2. **Same-origin `/windsor-mcp` is required** (Path A). Browser `tools/call`
   cannot hit `mcp.windsor.ai` directly (CORS). Reuse
   `path-a/Caddyfile.windsor-mcp.snippet` or the Worker.
3. Same-origin `/aigate` → `https://bridge.makh.ai`. Set host secret
   `AIGATE_AUTH_TOKEN` (bridge-desk identity). Never commit it.
   Worker: `wrangler secret put AIGATE_AUTH_TOKEN --config apps/call4me-web/path-a/wrangler.toml`
   Caddy: `path-a/Caddyfile.app.sabro.cloud.snippet`.
4. Bind **app.sabro.cloud** to the Worker or a Caddy vhost serving `dist/`
   plus the two proxies. Worker `/` serves `windsor.html`.
5. Add Identity redirect allow-list:
   `https://app.sabro.cloud/windsor.html`  
   Windsor callback: `https://app.sabro.cloud/windsor-callback.html`
6. Confirm `POST https://app.sabro.cloud/windsor-mcp/` → Windsor `401` JSON
   (not 302 / 404). `POST /aigate/v1/messages` without the secret → `503`
   `AIGATE HOLD` (expected before secret APPLY).

Alternate: keep serving under `https://crm.sabro.cloud/call4me/` and add
`/aigate` on that host. Chat still needs same-origin `/windsor-mcp`.

```bash
pnpm --filter @sabro/call4me-web build
npx wrangler deploy --config apps/call4me-web/path-a/wrangler.toml
```

## Prove

```bash
pnpm --filter @sabro/call4me-web test
```

Local Meta ads chat works after Connect without aigate (performance questions
use Windsor `get_*` directly). Write tool-loop and ordinary Sonnet need `/aigate`.

## Residuals

- **app.sabro.cloud is still 404** until CoS host APPLY (DNS + Caddy or Worker).
- **`AIGATE_AUTH_TOKEN`** is host-only. This PR ships the proxy shape, not the secret.
- `/aigate` injects a shared gate token — restrict the origin (CF Access / Identity)
  so the public internet cannot burn the bridge quota.
- **Twenty CRM embed** (Harish-only, same shell) is residual for the **cutover invent**. This PR is a nav hide-until-invite placeholder only — no iframe.
- GENERIC-MCP-HOST (non-Windsor MCP in chat) is out of this slice.
- Desktop EXE / installer is not this CR.
- github.io remains Path C FALLBACK (not MCP PASS) — no `/windsor-mcp`, no `/aigate`.
