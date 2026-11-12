# Issue 245 — Startup-failure diagnostic export

Scope: Settings diagnostic ZIP export, including when the Coder Runtime cannot start.
This change does not repair the Windows Job verification timeout tracked in Issue 246
or the conflicting Ready label tracked in Issue 247. Validation uses SDK 0.7.97-beta.4.

## Automated checks

```powershell
node --import ./scripts/test/isolated-credential-profile.mjs --import tsx --test apps/desktop/electron/diagnostics/*.test.ts apps/desktop/electron/test/diagnostic-export.test.ts apps/desktop/electron/test/diagnostic-redaction.test.ts apps/desktop/electron/test/diagnostic-safe-write.test.ts
node scripts/e2e-run.mjs tests/e2e/diagnostic-export.spec.ts
```

The E2E fixture uses an isolated Runtime home, exits the real daemon before readiness,
seeds a Windows probe record, then operates Settings and inspects the exported ZIP.
The seeded `ETIMEDOUT` record tests evidence preservation; it does not reproduce the
customer's slow Windows Job probe. No customer Runtime directory is modified.

For packaged validation, build first, then run the same test with
`SPACE_E2E_EXECUTABLE` set to the absolute path of `out/win-unpacked/KodaX Space.exe`.
Restore the previous environment value after testing.

## Manual acceptance

1. Use a disposable profile with startup failure evidence in
   `<configured Runtime home>/runtime/daemon/coder/bootstrap.log` and `daemon.log`.
   Use fake credentials only. Do not delete a real customer's Runtime state.
2. While the startup-failed banner is visible, open Settings → Diagnostics and export.
   Export must work without making the Runtime healthy or launching another Host.
3. Check `manifest.json`: the installed SDK version must be present even without an
   attached Host. `logSources` must identify every expected source and collection result.
4. Check `logs/runtime/coder/bootstrap.log` and `daemon.log`: retain startup ID, PID,
   phase, error text, probe stage, duration, timeout and error code. Credentials and
   configured private paths must be masked. Do not include `auth.json`, daemon tokens
   or arbitrary Runtime files.
5. Check `capabilities.json`: skipped Runtime inspections say `runtime-unavailable`.
   A ready Host whose inspection stalls must time out without blocking log export.
6. Repeat with a missing log, an unreadable source, oversized logs, a custom Runtime
   home and another profile. Missing/unreadable/truncated/omitted sources must be explicit;
   recent evidence takes priority over older Space rotations. Per-file default is 1 MiB
   and the total exported-log budget is 5 MiB.
7. Confirm ordinary successful startup still exports and selected categories are respected.
   Export must not alter the original log files.

Unit tests also cover paths aliased outside the Runtime home and nested startup/cleanup
errors. The adapter regression verifies that every failed attempt records its original
error for bounded structured redaction, including `AggregateError` causes.
