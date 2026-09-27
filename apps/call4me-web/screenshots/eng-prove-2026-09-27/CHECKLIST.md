# Eng mock-prove checklist · 27 Sep 2026 Europe/London

Worker: Cursor L3:Engineer-CCD on ML-PC1 (craft-gap / apps/call4me-web)
Commit craft: 531a597

## Unit/component prove (primary)
- npm test: **320 passed** (dial.test + broker-origin fail only — missing monorepo supabase paths; pre-existing)
- craft-gap.test.tsx: Contacts no Call/Edit/Delete text; gear Phone access+Import/Export/+Add; Today's/Deals list regions; Tap a contact empty stage
- App.stage-d: no idle keypad; keypad when connected; mask display; Phone access in gear
- typecheck + build: PASS
- Keep: tenant-map.ts bridge, tenant-deals.ts empty-safe, VITE_SUPABASE_PUBLISHABLE_KEY Identity path, TenantShell fail-closed

## Mock SoR copies (side-by-side folder)
| Mock | Copied as |
|---|---|
| MOCK-TODAYS-CALLS.png | ref-MOCK-TODAYS-CALLS.png |
| MOCK-DESKTOP-MASK-PHONE-ACCESS.png | ref-MOCK-DESKTOP-MASK-PHONE-ACCESS.png |
| MOCK-CONTACTS-TEAM-GEAR.png | ref-MOCK-CONTACTS-TEAM-GEAR.png |
| MOCK-MOBILE-TODAYS.png | ref-MOCK-MOBILE-TODAYS.png |
| MOCK-MOBILE-MASKED.png | ref-MOCK-MOBILE-MASKED.png |

## Live browser pixels of built App
BLOCKED for this stamp slice: Eng did not run Identity-signed browser session against live `/c/6402/call4me` (standing: no real Verto/broker exercise without human confirm; Host APPLY HOLD). Component tests prove IA chrome. Host CoS rsync after PR merge is the live pixel prove gate.

## Residual
- Main tip on SABROCLOUD/sabro-desktop is stub README — PR restores apps/call4me-web
- Host APPLY HOLD for CoS (backup+rollback + Identity env prove)
- Live place/end call: HOLD for sabro@ after chrome host land (t5190u) — not L0 QA
