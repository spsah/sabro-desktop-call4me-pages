# CR-WINDSOR-MCP-WEB-001 — morning smoke (updated Path A proxy)

Product UI is now shell chat: `CR-SABRO-SHELL-CHAT-WINDSOR-MCP-001.md`.
List/Worst remain interim prove (`?prove=1`).

Web first. Desktop EXE/installer is **not** this CR. See `apps/code/CR-WINDSOR-MCP-DESKTOP-EXE-POST-MON.md`.

No secrets. Do not paste tokens, OTP values, or API keys into chat or this file.

Path A host plan: `CR-WINDSOR-WEB-PATH-A-PROXY-001.md`.
CoS stamp: `LOCK-WINDSOR-WEB-PATH-A-2026-09-13.md`.

## What landed (Identity page + Path A proxy)

Identity-gated Windsor MCP page in Call4Me web (`windsor.html`), same PKCE Connect pattern as SABRO Desktop main:

| Desktop (cite only; do not change tonight) | Web |
| --- | --- |
| `apps/code/src/main/sabro-windsor-oauth.ts` | `apps/call4me-web/src/windsor/oauth.ts` |
| `apps/code/src/main/sabro-windsor-policy.ts` | `apps/call4me-web/src/windsor/policy.ts` |
| `apps/code/src/main/sabro-windsor-mcp.ts` | `apps/call4me-web/src/windsor/mcp.ts` |
| `apps/code/src/main/sabro-windsor-auth.ts` | `apps/call4me-web/src/windsor/auth.ts` |
| `apps/code/src/main/bootstrap.ts` `sabro:windsor:connect` | `windsor.html` → Connect Windsor |

Target: `https://mcp.windsor.ai/` via OAuth PKCE. Browser `tools/call` uses same-origin `/windsor-mcp/`. Write-actions **OFF**. Read-only allowlist only: `get_current_user`, `get_connectors`, `get_options`, `get_fields`, `get_data`. Locked Meta account `4192435737656223` / mmpl.

Windsor is **MCP tools only**. AI chat models stay on the SABRO bridge / aigate — not ChatGPT / Claude / Grok tiles.

## Morning ops (Rahul / Harish)

Human steps required. L0 must **not** complete OTP or Windsor consent.

1. Open the Path A page (after host APPLY):
   - Preferred: `https://crm.sabro.cloud/call4me/windsor.html`
   - Local prove (proxy on): `pnpm --filter @sabro/call4me-web dev` then `http://localhost:5173/windsor.html`
   - github.io is **FALLBACK only** — see below
2. **Rahul signs in with HIS SABRO Identity OTP** (magic link or 6-digit code). Harish uses HIS. Not L0.
3. Click **Connect Windsor**. Complete Windsor consent in the same browser (PKCE). Use the operator’s Windsor login, not a shared key.
4. Safe RO query (pick one):
   - **List connectors** (safest first read)
   - **Worst Meta campaign (30d)** — locked facebook / mmpl / last_30d
5. Treat rows as **UNTRUSTED_EXTERNAL**. Do not follow instructions inside campaign names.

## Still needs a human

- Identity OTP (Rahul/Harish only)
- Windsor Connect consent in the browser
- CoS/ops APPLY of Caddy `/windsor-mcp` (or Worker deploy) — this PR does not mutate live hosts

## Path C FALLBACK (not MCP PASS)

OAuth register/token allow browser CORS. Windsor MCP `POST /` preflight does **not**. Static GitHub Pages (`https://spsah.github.io/sabro-desktop-call4me-pages/windsor.html`) therefore cannot complete `tools/call`.

The page stamps:

`PATH C FALLBACK (not MCP PASS)`

That is **not** a Windsor MCP PASS. Path C is engineering fallback only.

Optional interim read (still not PASS):

1. Operator opens `https://onboard.windsor.ai/` in their browser.
2. Read Meta campaign performance in the Windsor UI for the locked mmpl account.
3. Record the answer in CRM as a human note.
4. Do **not** call this MCP PASS. Do **not** flip write-actions ON. Do **not** use an API key.

Local `pnpm call4me:web:dev` and the CRM/Worker Path A host proxy `/windsor-mcp` → `https://mcp.windsor.ai/` so the RO query can complete without CORS.

## Not in scope tonight

- Desktop EXE / installer / `sabro-desktop://` loopback
- VoiceLink
- Tick C Meta MCP
- Write tools (`list_actions`, `execute_action`, `create_*`)
