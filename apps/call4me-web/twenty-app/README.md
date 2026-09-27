# SABRO Calling for Twenty

This Twenty app adds a **Call** tab to Opportunity records. **Open Call** is a
named-target `<a href={callUrl} target="sabro-call4me" rel="opener">` (never
Window.open — Twenty FrontComponent stubs it). Query stays stable
(`embedded=twenty&panel=keypad`); destination and deal id travel in the hash
plus a per-click `t` stamp. BroadcastChannel / localStorage / hashchange / focus
deliver that intent so a second click focuses the existing Call4Me tab **and
auto-dials** instead of farming a new tab or waiting for Call.

Tom's product path is the Twenty URL only. The standalone Call4Me deployment remains
an engineering surface.


## Deploy

Configure a Twenty CLI remote for the self-hosted instance, then run:

```bash
corepack yarn install
corepack yarn typecheck
corepack yarn twenty apply
```

No calling credentials belong in this package. Calling-seat material is issued by the
server-side broker after SABRO Identity authentication.
