# Issue 222 SDK integration candidate

Historical candidate 4 provenance and a real older-SDK upgrade regression fixture.
Current Space depends on Registry `0.7.97-alpha.7`, not this local tarball. See
[current integration](../../docs/releases/kodax-0.7.97-alpha.7-integration.md).

- Package: `@kodax-ai/kodax@0.7.97-alpha.6.issue222.4`
- SDK source commit: `bfe8f376236a55d9bff16e56c7eccab80d9cdb74`
- Tarball SHA-256: `603b1093f854e2d3f1c05ca907f0673914bee20e455aab85938fb8b492bbc3e1`
- Lockfile SRI: `sha512-GPQWD7ZK3lCDx+LflgLU82aM/MzIYDI7gquz62jexxAuqdpeoaPXIGrnKBuoiFsLJn8lXuhTUgsbp+2kFQktlQ==`

This local public-SDK tarball carries the shared storage owner discovery,
bounded descriptor waiting, guarded orphan-policy refresh and diagnostics fix,
plus structured retryable startup/connect timeout errors.
It was built with the SDK release pack/audit path and installed as a physical
package for candidate 4. Both Space manifests at that time resolved this file.
Candidate 4 package bytes and native authorities were checked against its
integrity-pinned tarball before packaging.

The Windows native build was generated locally. The other platform native
artifacts were retained unchanged from the audited alpha.6 package; this local
Windows verification does not qualify macOS/Linux installers. The candidate
has not been published to npm or GitHub.

See [verification and package hashes](../../docs/releases/issue-222-recovery-verification.md).
