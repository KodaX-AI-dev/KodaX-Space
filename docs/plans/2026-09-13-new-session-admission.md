# New Session admission without historical lookup

The reported first-send delay occurs before Runtime admission. In KodaX 0.7.96-rc.3, both `sessions.load(id)` and `sessions.create({ sessionId: id })` locate an existing Session. A missing locally allocated ID can therefore trigger a global history scan. The SDK's `sessions.create()` path without an ID uses `createGenerated` instead.

## Change boundary

- For a real Coder using the daemon, `session.create` asks Runtime to allocate and persist the Session, then constructs the Space host Session using that returned ID.
- The Runtime adapter supplies project identity, `space-desktop` surface and the existing Coder/ephemeral tag; it does not supply `sessionId` and validates the returned project and surface.
- Partner, embedded Coder, mock providers and forced-mock runs retain local SDK ID allocation.
- Renderer input gains no freshness flag or authority. Resume, fork and existing Session admission keep the existing persisted ownership and identity checks.

## Verification

1. Exercise the registered `session.create` IPC handler and assert it uses the daemon-generated ID for a real Coder, while Partner and mock Sessions retain the existing allocation path.
2. Exercise `RuntimeHostAdapter.createSession` with a fake Runtime and assert `sessions.create` receives no `sessionId`, no historical load occurs, the ephemeral tag survives, and incompatible returned identities are rejected.
3. Run existing session identity/retag tests, type checks and focused creation/send regression tests.

This removes the avoidable missing-ID lookup. It does not claim that SDK history scans or model first-token latency have been independently repaired.
