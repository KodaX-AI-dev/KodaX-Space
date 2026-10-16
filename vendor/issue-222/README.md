# Issue 222 SDK integration candidate

- Package: `@kodax-ai/kodax@0.7.97-alpha.6.issue222.3`
- SDK source commit: `d45938b90eafabf5764cab4de008b057a64092c4`
- Tarball SHA-256: `83153e63e20d7084a3cd40288372301d5220c6aa24a3b270f7bd6fba8a78f236`
- Lockfile SRI: `sha512-6kbjcxtC8mOk0pm8zr+SgOcrUqfrm8ewObr4iPtalQg30amS7sO6siigDbCHuj74uq+87Bt/xZZor0ZksLhO+g==`

This local public-SDK tarball carries the shared storage owner discovery,
bounded descriptor waiting, guarded orphan-policy refresh and diagnostics fix.
It was built with the SDK release pack/audit path and installed as a physical
package. Both Space manifests resolve this same file; `npm ci` does not require
a sibling checkout. Installed package bytes and native authorities are checked
against the integrity-pinned tarball before packaging.

The Windows native build was generated locally. The other platform native
artifacts were retained unchanged from the audited alpha.6 package; this local
Windows verification does not qualify macOS/Linux installers. The candidate
has not been published to npm or GitHub.

See [verification and package hashes](../../docs/releases/issue-222-recovery-verification.md).
