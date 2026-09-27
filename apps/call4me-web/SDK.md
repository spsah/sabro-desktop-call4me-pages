# Call4Me JavaScript SDK

Add one script and mount the Identity-only calling widget:

```html
<script src="https://spsah.github.io/sabro-desktop-call4me-pages/sdk/call4me-sdk.js"></script>
<div id="call4me"></div>
<script>
  SABRO.Call4Me.mount("#call4me", {
    opportunityId: "22222222-2222-4222-8222-222222222222",
    theme: "sabro",
  });
</script>
```

`opportunityId` is optional. Supplying it binds call evidence to that opportunity. `theme`
accepts `"sabro"` or `{ accent, background, surface, text }` CSS colors. The widget renders
inside a shadow root so its styles do not leak into the host page.

`mount` returns an `unmount()` handle. Calling `mount` again on the same target replaces the
existing widget.

## Host setup

- Ask SABRO operations to add the exact production origin to the broker allowlist.
- Permit the SDK origin in the host page's `script-src` policy and calling endpoints in
  `connect-src`.
- Allow microphone use for the page.
- Do not add calling-seat credentials to host markup or JavaScript. The SDK exchanges the
  signed-in SABRO Identity session for a short-lived broker ticket; upstream credentials stay
  server-side.

Build with `npm run build:sdk`. The distributable and sample host page are written to
`dist-sdk/`.
