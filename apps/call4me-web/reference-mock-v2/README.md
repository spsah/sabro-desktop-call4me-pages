# Call4Me HTML mock — CUT 2

Local clickable mock. **Not live.** No API, no SIP, no DISA, no secrets, no FCC.

Product line: **siptrunk.ai** business phone (Call4Me v1 lock, 23 Aug 2026). Not SABRO. Not CRM.

## How to open

Open `index.html` in a browser (double-click or File → Open). No server needed.

On a phone: copy the folder, tap `index.html` in Safari or Chrome.

Hashes: `#calls` (today list) and `#contacts`.

## What v1 is

Two jobs, lightly:

1. **Calls for me** — today’s list from contacts you uploaded.
2. **Make a call** — tap a name. Originate via DISA so the **cloud** number is shown, not the personal SIM.

Contact-first. Dial pad hidden. **Web** = in-browser. **Phone** = the device you already have (mobile, desk, landline, SIP, PSTN). End hangs up. Pad `*` and `#` are digits / DTMF only.

Solo user. No team admin, no buy-a-number, no IVR, no Channel Sense, no Line Manager.

## What is fake

Everything. Import only pretends (adds two masked names). Calls never leave the page. Last-four masks only — no full numbers. DISA / End is copy, not a live hang-up.

CUT 1 (`/workspace/call4me-html-mock/`) still exists. This folder is the simpler v1-shaped cut.
