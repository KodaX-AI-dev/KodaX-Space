# Partner integration compatibility — beta.4 regression guide

This guide covers the integration repair, alongside the existing Issue 215 image and Runtime
recovery checks. Use an isolated Space profile. A mock model validates desktop interaction;
it does not constitute live provider or connector acceptance.

## Startup and optional components

1. With no prepared Feishu archive and with network unavailable, start development Space.
   Both Coder and Partner must open; starting Space must not download connector components.
2. In Settings, inspect connector component status. Unsupported platforms must be identified
   honestly. Installing a supported component must not start account authorization.
3. Exercise failed download, cancellation and retry. The UI must show the outcome and remain
   usable. Repeat installation requests must not race over the same destination.
4. After a successful installation, restart without network and reuse the component. Verify
   missing/corrupt binaries are handled by the pinned installer, not an arbitrary PATH binary.
5. Formal packaging must continue checking its pinned bundled Feishu resource.

## Files, links and results

1. In Coder and Partner, click an ordinary HTTP(S) link: it opens in the system browser.
   Invalid external requests must report failure instead of failing silently. Keep the original
   external-link contract; this repair does not promise arbitrary-length URL support.
2. Open a local document, image, text file and changed code file. Existing File Viewer, Diff
   and reveal behavior must remain intact.
3. In Partner, view a saved connector source through its card and internal reference. The saved
   snapshot remains available without making an unrequested provider call. Changing sessions
   must not show another session's source.
4. View a successful online-document/Base result. Its local result card remains visible and
   provides an explicit system-browser action. Reloading history must not open external pages.
5. Verify no Partner webview or embedded-browser launcher remains. The extension library frame
   and local document-preview frames must still work.

## Authority and navigation

1. Bind A and B. In one update, remove B and revoke A's create-document authority. Check the
   returned state, state after reload and authority used for a subsequent run.
2. Remove an unavailable binding while retaining unchanged unavailable bindings: removal must
   still work offline. Changing adapter, mailbox or authority must not reuse a stale snapshot.
3. Repeatedly open connector management, then expert management in the current bundled library.
   Both directions must switch correctly without reloading or discarding the frame state.
4. Repeat with an already-installed older library. Management navigation must initialize a
   fresh frame and request bridge on the requested tab; catalog requests must still work.
   This compatibility fallback clears unsaved page edits, but preserves installed packages,
   saved expert settings and connector accounts. Navigation before initial readiness must
   use the latest requested tab.

## Shared runtime and release checks

1. In Coder, create/send, stop, resume and reload a conversation; repeat on Partner with a
   bundled expert. Switch surfaces and confirm drafts, histories and controls remain scoped.
2. Run the Issue 215 clipboard/image and rc.5 recovery regression checks. Inspect packaged SDK
   pins and exercise the real packaged image decoder, including its Worker/WASM dependencies.
3. Run unit suites, typecheck, lint, build and isolated Electron acceptance. Record explicit
   platform skips and live-account boundaries instead of claiming unexecuted checks passed.
