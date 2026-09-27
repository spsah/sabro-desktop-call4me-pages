# SABRO Identity CRM bridge

This loopback-only service verifies a SABRO Identity bearer session, requires a valid trusted
principal UUID, links that principal to a Twenty workspace member through Twenty's public
invite flow, and exchanges Twenty's short-lived login token for its secure session cookie.

The generated Twenty linking password is random, server-held, and never returned to the
browser. Caddy makes `/login/` the public sign-in door and redirects Twenty's password pages
back to it. `AUTH_PASSWORD_ENABLED` remains enabled internally only for this server-side link;
there is no public password form in the supported workspace path.

Runtime configuration belongs in `/opt/sabro/secure/sabro-identity-bridge.env`. Required names:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `TWENTY_ORIGIN`
- `TWENTY_GRAPHQL_URL`
- `TWENTY_WORKSPACE_INVITE_HASH`
- `SABRO_IDENTITY_LINK_STORE`

No secret values belong in source control.
