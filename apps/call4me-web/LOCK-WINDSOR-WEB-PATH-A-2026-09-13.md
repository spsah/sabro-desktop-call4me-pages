# CoS stamp — CR-WINDSOR-WEB-PATH-A-PROXY-001

Date: 13 Sep 2026 (London morning correction)
Authority (elsewhere): LOCK-WINDSOR-WEB-DESKTOP-PARITY-2026-09-13.md

## STATUS

**PROXY READY / AWAITING HOST APPLY**

Not **MCP PASS** until a public SABRO-origin URL is live **and** Identity OTP → Connect Windsor → one RO `get_*` query is proven on that origin.

When that is done, replace this block with:

```
STATUS: MCP PASS
Public URL: https://crm.sabro.cloud/call4me/windsor.html
Proxy: https://crm.sabro.cloud/windsor-mcp/ → https://mcp.windsor.ai/
Write-actions: OFF
Allowlist: get_current_user, get_connectors, get_options, get_fields, get_data
```

(or the Worker URL if that host is the one applied).

## Path C demotion

`https://spsah.github.io/sabro-desktop-call4me-pages/windsor.html` is **ENGINEERING FALLBACK** only.

- Pages cannot proxy `/windsor-mcp` (404 / 405 / no Workers).
- UI stamp: `PATH C FALLBACK (not MCP PASS)`.
- Do **not** treat Path C as MCP PASS.

## Product lock (unchanged)

- AI chat models: bridge / aigate (OUP) — not Windsor destination tiles.
- Windsor = MCP tools only, OAuth PKCE, write-actions OFF, RO allowlist.
- Ice ≠ MMPL. Locked Meta `4192435737656223` / mmpl.
- No secrets in git, chat, or PR. Desktop EXE sticky after Monday (stub only).
