# Screenshots

- `reference-mock-v2-calls.png` / `reference-mock-v2-contacts.png` — Playwright captures of the local substitute mock (`reference-mock-v2/index.html`).
- Authenticated Call4Me Contacts / Today's calls / Active deals tabs were **not** screenshot: local preview hits the Identity gate, and this job forbids connecting to a real Identity/Supabase project or using secrets. Structural proof is via `src/craft-gap.test.tsx`.
