# CR-TOM-CRM-OPEN-CALL-REUSE-AUTODIAL-001

Invented: 16 Sep 2026. Authority: L0 residual after PR #35 PARTIAL PASS;
LIVE miss after PR #36 (17 Sep 2026).

Parent: CRM Open Call named-tab reuse (PR #35). This slice is **2nd–Nth Open Call
must auto-dial**, not a new tab farm and not a pad-only fill.

Prove matrix: **PROVE-L0-CALL4ME-CRM-P0-MATRIX-2026-09-17**

## Live prove (L0 17 Sep 2026, after PR #35/#36)

| Step | Result |
| --- | --- |
| Keypad dial | PASS |
| Contact dial | PASS |
| 1st Open Call tab + auto-dial | PASS |
| 2nd+ Open Call tab reuse (no new tab) | PASS |
| 2nd+ Open Call auto-dial | FAIL — number on dialer, user must press Call |
| Twenty FrontComponent Open Call | FAIL — `HTMLAnchorElement is not defined` |

## Cause (why PR #36 autodial missed LIVE)

1. Twenty FrontComponent sandbox has `document.createElement("a")` but **no
   `HTMLAnchorElement` binding**. `handleOpenCallClick` did
   `currentTarget instanceof HTMLAnchorElement`, which **throws ReferenceError
   before** stamping hash `t` and before `offerCall4MeIntent`. Native `<a>`
   navigation still runs (uncaught click error does not `preventDefault`), so
   the named tab is reused with the **same hash** → number already on the pad,
   no new auto-dial.
2. Even without that throw, **preventDefault-when-alive** blocked named-target
   fragment navigation. BroadcastChannel / `localStorage` do not cross the FC
   sandbox origin, so `subscribeCall4MeIntent` never saw a new `t` and
   `startDial` never ran.
3. Focus inspect **preferred a stale stored intent** and returned without
   reading a newer location hash `t`.

Ice ≠ MMPL. Sipcentric not in path. Phonebook #31 / 0800 FS host out of scope.
`formatVertoDestination` UK `0…` (PR #35) stays.

## User outcome

1. 1st Open Call: open/reuse tab + auto-dial (keep PASS)
2. 2nd–Nth Open Call: **same tab + auto-dial** (no manual Call)
3. Keypad dial + contact dial still PASS — same normalize → Verto invite
4. Twenty FrontComponent never names `HTMLAnchorElement` or `Window.open`

## What changed

- FC Open Call path creates/clicks `<a>` via `document.createElement("a")` and
  duck-typed `getAttribute` / `setAttribute`. **No `HTMLAnchorElement`
  identifier** in `twenty-app` or `crm-open-call.ts`.
- Each Open Call stamps hash `t` on the named-target `<a>` at click. Query stays
  `embedded=twenty&panel=keypad`. Click **never preventDefault** so named-target
  navigation can deliver `t` into the already-open Call4Me tab.
- `openCall4MeTab` always named-target-clicks (reuse is `target=sabro-call4me`,
  not “skip click when alive”).
- `subscribeCall4MeIntent` still listens to `hashchange`, `storage`,
  BroadcastChannel (`sabro-call4me`), plus `focus` / `pageshow` / `popstate` /
  `visibilitychange`. Focus inspects **location then storage** so a newer hash
  `t` is not dropped.
- Call4Me `applyIntent` queues auto-dial by `t` and runs the same `startDialRef`
  path as first open when `phase === "ready"`.

## Prove matrix rows for L0

| ID | Path | Expect |
| --- | --- | --- |
| keypad | Keypad Call | PASS — Verto invite, UK `0…` never `+` |
| contact | Contacts row dial | PASS — same normalize → invite |
| open-call-1 | Open Call 1st | PASS — named tab + auto-dial |
| open-call-2-tab | Open Call 2nd+ | PASS — zero new tabs (`target=sabro-call4me`) |
| open-call-2-dial | Open Call 2nd+ | PASS — new `t` → `setCrmAutoDial` → `startDial` |
| fc-sandbox | Twenty FC | PASS — Open Call with `HTMLAnchorElement` undefined |

## Out of this CR

Phonebook #31 · Sipcentric · VL 57332 · Meta MCP · EXE · Twenty APPLY hosts
