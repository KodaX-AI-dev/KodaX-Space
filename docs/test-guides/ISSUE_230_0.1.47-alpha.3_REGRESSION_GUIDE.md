# Issues 230–232 regression

Scope: unpublished Space `0.1.47-alpha.3` working tree with SDK alpha.10, 2026-10-28.

1. On Kylin V10 SP1/UKUI, open Space at normal and maximized sizes. Minimize, maximize/restore and close must remain visible and functional. Close follows the existing lifecycle policy. On macOS there must be no duplicate custom controls.
2. Start Space, leave it idle and exit without opening update settings: no update check/download/install. Open Settings → Preferences → Software updates: state retrieval is local. Check explicitly; finding an update must not download it.
3. Cancel Download confirmation: no download. Confirm: only the selected version downloads. Cancel Restart & install: no installation. Confirm while idle: verified Runtime shutdown and local cleanup precede the installer. With an active task or another connected client, installation is blocked and Space stays open; finish the work/close the other client before retrying. An ordinary exit after downloading must not install automatically. A shutdown watchdog, recovery or force-close path must not launch the installer.
4. Offer `0.1.47-alpha.3` to an installed stable `0.1.46`, including a misconfigured latest feed or cached downloaded event: reject download/install. An alpha installation may accept its own alpha channel or a newer stable release, never switch to beta or downgrade automatically.
5. Reopen settings during downloading/ready: show current state without an extra check. Repeated clicks or stale version confirmations must not duplicate requests.
6. For the independent CLI sandbox report, capture CLI version/executable origin and a task-level trace. Missing Node/dependencies must be diagnosed accurately, while ordinary execution preserves KodaX's existing automatic fallback through the current permission policy. In Auto, a permitted command must finish without extra environment/setup steps; doctor not-ready is not proof that ordinary Bash cannot run. Verify CLI and Space consistency, one execution after proven pre-start failure, unchanged denial/Stop and no replay of uncertain execution. Optional sandbox repair must not become the prerequisite for continuing ordinary tasks.

Automated seams:

- `node --test --test-force-exit --import tsx apps/desktop/electron/ipc/updater.test.ts`
- `node --test --test-force-exit --import tsx apps/desktop/renderer/src/shell/WindowControls.test.tsx`
- `node --test --test-force-exit --import tsx apps/desktop/electron/test/kodax-sandbox-fallback.test.ts`
- `node scripts/e2e-run.mjs tests/e2e/manual-updates.spec.ts`
- `node scripts/e2e-run.mjs tests/e2e/update-safe-exit.spec.ts tests/e2e/window-controls.spec.ts`

Investigation, SDK handoff and honest platform limits: [record](../research/kylin-window-sandbox-and-manual-updates-2026-10-28.md).
