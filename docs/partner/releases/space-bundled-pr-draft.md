# PR draft: bundle the Partner library in Space beta.3

Target: `KodaX-AI-dev/KodaX-Space`, `feature/partner-bundled-release` → `main`.

## User effect

Space 0.1.46-beta.3 includes the Partner library, expert methods and trusted connector host. A fresh profile can open Partner → Plugins and select an expert without installing a separate extension. Expert bindings survive session restoration. External accounts and session resource scopes require explicit user authorization; catalog entries are not evidence of real-account acceptance.

## Implementation

- Provision the installer-owned archive through the existing Extension Store, preserving same-ID installations and disable/uninstall intent. Do not replace existing library versions automatically.
- Keep KodaX pinned to 0.7.96-rc.4 and preserve Coder daemon ownership. Forward SDK extension context and repair the Partner home materials panel and packaged terminal helpers.
- Synchronize four workspace versions and lockfile to 0.1.46-beta.3, update the user manual and in-app help, retain source/patch/license/lock records for builtin methods, and use organization release/update endpoints.
- Preserve original history on the source integration branch. The mainline contribution uses a consolidated commit with GitHub account poppersamhar as author and a full commit body.

## Verification

Run from the repository root with Node 22.23.1: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build:smoke`. Complete the CI E2E shards and four-platform installer workflow before merging/tagging; packaging includes `npm run smoke:pack`, Windows `npm run smoke:boot`, and the existing Linux renderer boot gate. Record actual results and links in the PR and [beta.3 readiness](../../releases/v0.1.46-beta.3-release-readiness.md), including failures and skips.

Earlier local validation used isolated profiles and covered the default Coder Runtime, Partner library selection, persistent expert mock sessions and macOS arm64 package content. Those results are in [the source integration record](space-bundled-integration.md); they do not imply completion of final beta.3 gates.

## Release boundaries

This is a beta prerelease and does not replace the default stable download. Coder sharing of Partner experts/connectors, automatic library replacement and production validation of all external accounts are outside this release. Keep the remaining beta.2 SDK limitations visible. Use the existing organization tag workflow only after required checks pass; never overwrite v0.1.46-beta.2 assets.
