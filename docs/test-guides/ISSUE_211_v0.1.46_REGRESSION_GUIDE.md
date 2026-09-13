# Issue 211: Retry after a pre-admission history timeout

Baseline: Space `0.1.46-beta.1`, SDK `0.7.96-rc.3`. Fix: **Unreleased**, present in the
working tree. Rebuild before testing; the currently running installed app is not changed by source edits.

## Acceptance criteria

1. A strict-history timeout before Run admission returns `accepted: false` with
   `session_history_unavailable`; it does not become a generic uncertain `HANDLER_ERROR`.
2. The main composer restores the exact draft and enables sending. Retrying unchanged text uses
   the same Session and a new operation ID and produces one visible user query.
3. Quick Ask restores its prompt, displays the rejection, and enables another attempt without
   waiting for stream events that cannot arrive.
4. A generic uncertain failure after admission retains its exact-operation duplicate protection.
5. No automatic resend occurs. This verifies recovery, not a fix for the 15-second read itself.

## Automated checks

Run from the repository root:

```powershell
node --test --import tsx apps/desktop/electron/test/real-session-runtime-queue.test.ts
node --test --import tsx packages/space-ipc-schema/test/session.test.ts
npm run build:smoke
npm run e2e:run -- tests/e2e/session-send-retry.spec.ts
```

The Electron unit seam makes admission fail before `startManagedRun`, then recover on retry.
The E2E test substitutes the `session.send` handler to verify the real composer/store behavior,
operation identities, and Quick Ask rejection. It does not simulate daemon filesystem load.
The fixture uses an isolated test home and a disposable project.

## Manual acceptance

Use a rebuilt candidate and a disposable Coder Session. If the real history timeout recurs, verify
that the draft is restored and retry the unchanged message once. Confirm the same Session remains
selected and only one accepted query appears. Repeat through Quick Ask and verify its prompt is
preserved. Record the candidate version and result; avoid injecting failures into a real active Run.

For an already affected installed-app operation, first test a rebuilt candidate: the new source
classification does not retroactively change a cached error in the old running process.

## Verification record — 2026-09-13

- Related focused checks: 238 passed; production smoke build passed.
- Focused Electron E2E: 2/2 passed (ordinary send/reply and structured-rejection retry). The latter
  verified same-Session unchanged-draft retry with a new operation ID and Quick Ask error display,
  draft restoration, and enabled controls.
- No released or installed-app fix is claimed. Underlying history latency remains Issue 214.
