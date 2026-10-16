# Issue 221 — Session deletion failure feedback

Use an isolated `KODAX_PROFILE_DIR` for manual reproduction. Never start a test
Host against the personal Session directory.

## Automated verification

```powershell
node --test --test-force-exit --import tsx apps/desktop/electron/test/host.test.ts apps/desktop/electron/test/session-runtime-store.test.ts apps/desktop/electron/test/runtime-host-adapter.test.ts
```

Expected: all tests pass. New regressions verify that SDK `delete_failed` rejects
with `session_delete_failed`, and a Runtime transport failure preserves the
original error while restoring the local Session.

## Desktop checks

1. Create a Coder Session in the isolated profile and send one message.
2. Delete it through the sidebar. The row should disappear only after successful
   IPC completion; switching Sessions must leave the composer usable.
3. Inject an SDK `delete_failed` result at the Session store test boundary.
   Deletion must show an error, retain the row and its sidecars, and release the
   deleting indicator so retry remains possible. It must not show the warning
   that another KodaX process is running the Session.
4. Repeat with a Runtime deletion exception. Preserve that error and the local
   Session; do not classify a transport or storage error as `session_running`.
5. Return a genuine SDK `session_running` result. The existing busy warning and
   retained Session/attachment behavior must remain intact.

## Reported local recovery

On 2026-10-16, the reported `- V` Session contained one user message and no
assistant response. Its copied canonical record reproduced the storage failure;
public Runtime deletion of the copy succeeded. The four original Session files
were backed up under `~/.kodax/session-repair-backups/` before deletion through
the live Host. The conflicting idle `default` daemon accepted guarded shutdown;
the `coder` alpha.6 daemon then reported healthy. Refresh or restart the existing
Space window to discard its previous failed initialization state.

A follow-up exposed that health-only diagnostics had started alpha.6 without
Space's `daemonOrphanExitMs: 30000` policy, causing the real window to reject
`daemonOrphanExit:1` and display empty history with a capability-upgrade error.
The diagnostic Host was stopped using guarded shutdown and replaced through
the actual Space Runtime adapter's initialization path. Acceptance now includes
the complete Space capability validation plus nonempty SDK product views for
three real histories (136, 120 and 115 items, with user and assistant content).
Check the desktop's current view after Ctrl+R; a healthy status alone does not
prove that the Space connection or history read works.
The user confirmed normal history browsing after the final refresh on October 16.
The wider startup/history gap was subsequently fixed and verified as Issue 222;
see its separate regression guide and candidate evidence.

The source fix does not change the ordinary SDK storage ownership contract or
add a force-delete path. Windows candidate `0.1.47-alpha.2.issue222.3` now
includes the corrected feedback under `out/issue-222`.
