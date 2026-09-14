# Partner library · Space Extension v1

This is an independently built UI package, not a module imported by the trusted
desktop renderer. The archive contains exactly `manifest.json` and a
self-contained `ui/index.html`. Version 0.1.0 retains the writing mentor and
eight scene experts: document processing, research, data analysis, presentations,
finance, product management, design, and email editing. Their persistent role
prompts are separate from the original task templates, which remain starter tasks.
No built-in expert configures a Skill by default. This version declares Feishu,
WeCom, DingTalk, Tencent Meeting, Notion, Airtable, Atlassian, Slack and Zoom
cards backed by trusted host adapters. Notion, Airtable and Atlassian use the
host's read-only remote OAuth path. Slack and Zoom intentionally remain disabled
until the product has reviewed application credentials. A declaration is not a
connected account. The package does not include or install Skills, authenticate
accounts, or receive credentials/documents.

## Build

From the repository root:

```sh
npm run build:packages
node scripts/build-partner-extension.mjs
```

The default output is `out/extensions/kodax.partner-library-0.1.0.space-extension`.
Use `--out-dir <directory>` for another artifact directory. The archive is a ZIP;
the builder computes the HTML SHA-256 and replaces the placeholder from the
source manifest in the archive only.

Install the archive through Space's extension manager, then explicitly enable
it. Installation neither executes the UI nor connects services. Disable removes
the UI contribution; uninstall removes only this package and its registration,
not conversation history, user documents, or existing Skills.

Version 0.1.0 is the first Partner library release candidate. It retains the stable
`kodax.partner-library` / `feishu-docs` / `feishu-cli` identities. Replacing an earlier
local candidate and explicitly re-enabling the package does not inherently require
disconnecting or reconnecting existing accounts. Because this release resets an
unpublished local numbering line from 0.9.1, it must be tested as a same-ID replacement,
not assumed to be a SemVer upgrade. This version change does not grant access to additional
Feishu products or rewrite saved conversation snapshots. The official logo is embedded as a data
URL for offline loading under the existing frame CSP; its source and ownership
are recorded in [brand assets](../../resources/brands/README.md).

The archive uses manifest format version 1 and requires Partner Host API version 4
with `partnerNativeDocumentDeliveryV1`. The loader accepts a fixed `ui/index.html`
entry, at most 2 MiB of HTML, a 64 KiB manifest, and a 4 MiB archive. Paths, entry
types, duplicate names, compression ratios, compatibility, and the HTML hash are
validated. The hash is integrity checking, **not publisher authentication**.
Third-party UI requires the host's isolation and trust disclosure; it does not
receive the trusted renderer's IPC bridge or an SDK code-extension runtime.

The host expert catalog reads only enabled packages whose installed manifest and
HTML still pass integrity checks. Selecting an expert resolves its exact revision
into a session snapshot. Updating the package does not silently rewrite an
existing snapshot's prompt or revision. Disabling/uninstalling the package or
removing that expert makes the old binding unavailable. An optional `skillRef`
is only a reference to an existing Skill, not an installer or permission grant.
An explicit `useSkill` selection is preserved in the snapshot as data; this
catalog never loads, searches, installs, or substitutes Skills.

User-authored experts are stored separately under
`<Space data directory>/extension-data/<extensionId>/experts.json`. Editing a
built-in creates a new `user.<uuid>` copy; editing a user expert requires its
expected revision and increments that revision. Deletes retain the latest
definition with a tombstone and remove it from availability. Earlier role
versions remain in their existing conversation snapshots, not a separate history
engine. Upgrade, disable, and uninstall do not delete this user data, and reinstall
does not resurrect tombstoned experts. Each extension is limited to 128 total
user records (including tombstones) and 1 MiB of UTF-8 data; capacity, conflicts,
and invalid files fail explicitly without overwriting existing content.

Registry publication is the install/uninstall commit point. Unsafe existing
bundle paths fail validation before that commit. If cleanup later fails, the
committed result remains authoritative and a diagnostic warning identifies the
unregistered bundle; its files may remain but cannot supply an active view or
expert. No broader directory cleanup or user-data deletion is attempted.

## Verification and TDD record

```sh
node --test --import tsx apps/desktop/electron/space-extensions/*.test.ts
node --test scripts/test/build-partner-extension.test.mjs
```

The public lifecycle test was first run with no store module and failed
(`ERR_MODULE_NOT_FOUND`); the minimal install/enable/disable/reopen/uninstall
implementation then made it pass. The build test likewise failed with a missing
builder before the independent archive builder was implemented.

Further store tests were added and run RED, then implemented and run GREEN one
at a time: extra executable files, duplicate ZIP names, symbolic-link entries,
oversized HTML, compression bombs, replaced on-disk symlinks, redirected package
directories, non-Space archive suffixes, excessive ZIP entries, UTF-8 BOM
preservation, and recovery after a bundle directory was removed.

Additional public-contract regressions cover malformed/unsupported manifests,
missing entry files, content tampering, traversal paths, upgrade rollback,
serialized concurrent operations, preserved unrelated data, and a real
build → install → enable → read-view → uninstall round trip.

The expert catalog test first failed because its module did not exist, then
passed with enabled-only listing and exact-revision resolution. Additional
RED → GREEN cases cover an edited installed manifest and an oversized registry
created by multiple expert catalogs. Snapshot-preservation, unavailable bindings,
data-only Skill references, and lazy shared runtime construction are also tested.
Real filesystem tests reproduced the update/uninstall post-commit cleanup failure
using read-only bundle directories; their committed results now remain usable
and cleanup failures produce diagnostics. A separate symlink test verifies that
pre-commit validation failures still reject updates without changing registration.

P3 public catalog tests were run RED → GREEN for creation, built-in copies, user
revision updates, tombstone deletion, concurrent revision conflicts, explicit
Skill preference preservation, record and byte limits, and duplicate stored
identities. Regression tests additionally verify isolation between extensions,
disabled-package rejection, upgrade/uninstall/reinstall retention, root/directory/
file symlink rejection, malformed input preservation, and atomic-write failure
recovery. The archive migration test first rejected the old one-expert package,
then verified all eight stable scene IDs, descriptions and original starter tasks
alongside the unchanged writing mentor in the 0.3.0 package.

These are archive, store, and expert-catalog tests. They do not establish that the
whole F146 feature or the interactive Electron install/select/send flow is complete.

## Feishu connector host boundary (P4/P5)

The package frame can only request `connector.catalog` and `connector.configure`.
It cannot provide an extension/session identity, obtain tokens, read documents,
change global policy, or approve writes. Configuration opens the trusted Space
connection dialog. The current host ships a checksum-pinned official CLI 1.0.92
archive with Space, prepares it locally without a user-facing install step, and
provides a cancellable first-connection flow through official Feishu pages.
Merely opening the library or dialog cannot install, start authorization or bind
an account. The connector UI no longer exposes a CLI/profile advanced option;
existing stored connections and their underlying profiles remain compatible. Creating
a new connection uses a distinct Space-owned profile and preserves existing profile
entries and the default selection. Credentials remain owned by
the official CLI: choosing an existing app on Feishu's website may share its
app/user credential storage with other profiles. The package frame receives only connected connector
IDs for its status indicators, never account details or authorization links.

The trusted panel separates account connection from per-conversation selection.
Users select exact `https://<tenant>.feishu.cn/docx/<id>` links with read or
read-plus-append scope, and optionally an exact folder URL for new documents.
The composer connection menu enables/disables each account for this conversation
without changing drafts or sending messages. A newly enabled account may have an
empty document scope; that is not permission to read the user's entire Drive.
The existing right-hand document-scope panel remains the place to grant access.
The existing global connector-write policy remains off unless explicitly changed
in the trusted confirmation dialog. Enabling it affects all connectors but does
not bypass account permissions, document scopes or individual write approvals.

Reads appear in the existing 资料 card as immutable remote snapshots. With the
generic `partnerNativeDocumentDeliveryV1` host capability, a complete request to
create a new document is dispatched once through the selected platform adapter;
the host privately reads it back, returns only a verified canonical URL, and opens
that URL in Partner's right-hand browser. Feishu is the first write adapter, while
the task/signal/opener contract is provider-neutral for later DingTalk and Tencent
Docs adapters. Proposed append content still appears in 待审核 with its complete
content, target, operation and version before confirmation. Unknown/partial or
submitting records cannot be retried; conflicts require rereading and proposing
again. Remote records never masquerade as local file paths or local deliveries.

Renderer tests cover strict frame messages, selection/draft coordination,
no-partial expert/connector create ACKs, scope switching, complete new-dialog
reset, exact-hash confirmation, no uncertain retries, card projections, and the
actual independent HTML. A real browser component fixture additionally verifies
profile-connect versus session-select, policy cancellation/confirmation, draft
preservation, and a late read after switching projects. These are isolated fake
host tests, not a claim that a user's real Feishu account has been authenticated
or a real remote document has been written.

The first-connection contract, cancellation and private-install boundaries are
documented in [F146 onboarding](../../docs/partner/features/f146-feishu-onboarding.md).
Cancelling stops local waiting; it does not revoke consent already granted on
Feishu's website. Disconnecting makes the Space account binding unavailable,
without logging out another app or deleting CLI credentials and remote documents.
