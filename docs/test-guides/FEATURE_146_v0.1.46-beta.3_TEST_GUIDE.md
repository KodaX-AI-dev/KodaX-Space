# Partner bundled-library acceptance for Space 0.1.46-beta.3

Use an isolated absolute `KODAX_PROFILE_DIR` or `KODAX_TEST_ONBOARDING`; do not reset a real user profile. Run installation and upgrade checks on each supported platform. Record OS, package version/hash, result and evidence; an unchecked row is not a pass.

| Scenario | Steps and expected result |
| --- | --- |
| Fresh installation | Start the built installer/application with a clean profile. Open Partner → Plugins. The official library is enabled, experts and methods are available, and no separate extension download or external-account authorization has occurred. |
| Persistent expert | Select an expert, create a Partner session, complete a mock or explicitly authorized real-model task, restart and restore the session. The selected expert/method binding is preserved; switching or removing it updates only that session. Record mock versus real-model evidence separately. |
| Disable and restart | Disable the official library, restart and verify it remains disabled. Coder can still start and create a session. |
| Uninstall and restart | Uninstall the library and restart. It must not reappear automatically. |
| Existing installation | Begin with a manually installed same-ID package, including a disabled state. Upgrade Space. Confirm the package/version and user choice are preserved. Do not claim automatic library-version replacement. |
| Coder regression | Start the default Coder Runtime, create and restore a Coder session, switch between surfaces, and exit. The Partner library must not alter daemon ownership or session identity. |
| Connector authorization | With an explicitly authorized test account, connect a supported service and select only permitted resources for the Partner session. Verify out-of-scope resources remain inaccessible. Disconnect and verify access is removed. Never put credentials in screenshots or logs. |
| Remote delivery | For an operation that supports creation or reviewed modification, complete its authorization/review flow. Verify the real remote receipt, canonical resource URL and separate content-verification result. A mock receipt is not real-service acceptance. |
| Package contents | Verify the library archive, method skill lock and trusted host dependencies are included; run `npm run smoke:pack`. On Windows run `npm run smoke:boot` (also invoked by pack). |

The complete legacy Partner guides remain available under [Partner test guides](../partner/test-guides/FEATURE_F146_PARTNER_v0.1.0_TEST_GUIDE.md). Release status and final gate evidence belong in [beta.3 readiness](../releases/v0.1.46-beta.3-release-readiness.md).
