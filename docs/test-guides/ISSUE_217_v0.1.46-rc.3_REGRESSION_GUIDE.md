# Issue 217 — macOS background Git installation prompts

- Baseline: Space v0.1.46-rc.3 with registry SDK v0.7.96-rc.10.
- Candidate: current Space + published SDK v0.7.96-rc.11, pinned in both manifests
  and the lockfile and installed as a physical package.
- Status: native macOS acceptance and the Space application release remain pending.

## Preparation

Use a clean macOS VM/test machine without command-line developer tools, plus a
normal development Mac for available-Git cases. Do not uninstall a working local
toolchain. Prepare a normal repository, an unborn repository (`.git` but no
commits), and an ordinary folder. Copy prepared fixtures if Git is unavailable.

Record the Space build/revision, SDK package location/version and linkage,
macOS version/architecture, effective PATH and DEVELOPER_DIR. Do not print secrets.
SDK v0.7.96-rc.11 is already installed and pinned. Run the matrix with this paired
SDK/Space build, then repeat against the packaged application.

## macOS no-dialog and availability matrix

1. On the missing-tools machine with system Git selected, open Space and a test
   workspace. Leave it open for at least one minute, change focus several times,
   switch projects and open the changes/stats views. Background calls must not
   show installation dialogs. Existing failure/empty-state UI contracts remain;
   normal conversation and file browsing continue.
2. Set an empty test folder as the default workspace, causing workspace creation
   and Git initialization. The folder must still be created without an installer
   popup or app startup failure when Git is blocked.
3. Repeat on a machine with working system Git: modifications, branch/status,
   review/diff and stats must remain available. Large diff handling must keep the
   existing output cap, and slow Git commands retain the existing timeout.
4. Launch Space with a valid custom DEVELOPER_DIR selecting full Xcode. Confirm
   normal system Git works without requiring a fixed CLT installation directory.
5. Launch with Homebrew/independent Git first on PATH; normal Git must remain usable.
   Repeat with `/usr/bin` first: the guard follows that selection and does not
   silently choose a different Git. Use the application's effective environment,
   since a Terminal shell and Finder-launched app can have different PATH values.
6. After observing a blocked call, install tools explicitly. Wait more than
   5 seconds and trigger a new status/overview refresh in the same application.
   Git must recover without restart. The cache TTL is 5 seconds; scheduled UI
   polling may be slower, so this is not a five-second visible-refresh SLA.

Do not run `git --version` as a missing-tools probe during this test; that manual
command can independently trigger the Apple dialog and invalidate attribution.

## SDK consumer recovery and cross-platform regression

- With tools unavailable, request repo-intelligence overview of the prepared
  unborn repository: filesystem overview remains available and Git-only changed
  scope returns an explicit failure. After restoring tools and waiting past the
  cache TTL, request it again without restart/cache reset. Expect Git-backed
  overview and an untracked test file in changed-scope analysis before any commit.
- Exercise worktree creation/status against unavailable Git and against an ordinary
  available-Git failure. Preserve actionable error semantics; do not turn failure
  into successful empty results or change worktree authorization/cleanup rules.
- Compare memory project identity before/after on a working remote-backed repo and
  on a folder using local fallback. SDK memory resolution remains synchronous;
  existing remote normalization, identity and local fallback rules are unchanged.
- On Windows and Linux, verify normal project status/diff, default-workspace init,
  repo-intelligence and worktree behavior. No Apple developer-tools probe runs;
  missing Git retains the existing platform error behavior.
- Use SDK automated tests for exit-code-2-only blocking, uncertain-probe pass-through,
  concurrent checks, cache expiry and environment separation. These simulated
  platform checks supplement rather than replace native macOS UI verification.

Arbitrary manual/model Bash and PTY commands are not intercepted. SDK FEATURE_300
in v0.7.99 remains Planned; this repair does not introduce a shared ordinary Git
runner. Record each result, elapsed observation time and any popup's triggering
action. Unexecuted native cases stay marked pending. The official SDK integrity
check and local Windows packaged dependency/worker, boot and complete-exit checks
passed; see Issue 217 for the recorded evidence.
