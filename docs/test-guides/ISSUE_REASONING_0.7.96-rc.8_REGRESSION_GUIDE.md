# KodaX rc.8 / Space reasoning regression verification

## Scope and acceptance

Consume exact published @kodax-ai/kodax@0.7.96-rc.8 bytes in root and desktop manifests, npm lockfile and installed dependency. Preserve existing runtime capability gates and unrelated Space preview work.

- Keep user effort intent (including auto, none/off, xhigh/max and legacy aliases) in shared settings, chat requests and workflow launches. Let the SDK negotiate levels and own rejection caching.
- Unknown capability is distinct from explicit lack of support. Unknown compatible providers allow attempts at all standard levels and disabling. Declared unsupported controls remain unavailable.
- Forward SDK reasoning_resolved events through daemon and embedded host paths with requested effort, sent effort, fallbacks and verified:false. Root observations must not be replaced by transient child observations. UI selection stays intent; last-request observation is separate and scoped to current provider/model/intent.
- No visible thinking is not evidence of unsupported effort. HTTP 200 is not evidence that requested strength took effect.
- Preserve SDK parsing/replay of reasoning_content, reasoning and structured reasoning_details by using the SDK compatibility layer; Space must not invent another wire parser.
- Recognize native and cause-wrapped TimeoutError/AbortError, numeric DOMException codes and cyclic causes without crashing.
- Retain previous Runtime, credential, queue, permission, shell and A2A behavior.

## Released artifact evidence (2026-09-17)

npm official registry became available at about 08:53 UTC. Space installed rc.8 from https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.96-rc.8.tgz.

SHA-512 integrity: sha512-eDAxYhXo7V4jVrNXJ4OxszsAkqynrPVZt/bnH8z71rsH0k5vUXqFN4EGFs+vuc8ELk4wHECV+OLBBwjwEJOWnQ==

This matches the downloaded GitHub rc.8 release tarball exactly (SHA-256 ef04a52dff0bb6a0af7c384eb18164bd4edb2567438aaa2c5e8256d19cbfcc0c).

Real OpenRouter tests used the existing custom provider with no reasoning declaration, fixed synthetic prompts, bounded calls/time/tokens/cost, and credentials kept out of logs. Runs imported the released SDK, not source builds.

- Union Alpha: default auto sent max; explicit none/low/medium/high/xhigh/max were sent as selected. All eight cases completed (15 HTTP attempts including rate-limit retries). No rejection capability downgrade on 429. Streaming responses contained none of reasoning_content/reasoning/reasoning_details; the complete response contained reasoning:null with the other two fields absent. No non-null reasoning payload and no claim about effective strength.
- Invalid effort: first round received explicit rejection and fell back to max; second round skipped the rejected effort using the cache. Three requests total; requested intent and fallback provenance preserved.
- gpt-oss-20b: returned reasoning plus reasoning_details, preserved the structured detail in the tool-result replay, and completed the second round with OPENROUTER_REPLAY_OK. Detail JSON SHA-256 1b1865a6fa3f3140085132dcb5579838285d26aac3fc46f1f2c65097902b76fc. Earlier attempt timed out on the second response; it is not counted as a passing round trip.

Raw synthetic request/response reports live under the local OS temp kodax-eval-dumps/openrouter-reasoning directory (08-52-58.314Z-rejection, 08-54-31.059Z-matrix, 09-00-22.033Z-replay). They contain no headers or credentials and are not release artifacts.

## Checks

Run npm run typecheck, npm test, npm run build:smoke and the model-picker Playwright spec. Focused tests cover reasoning intent projection, unknown versus declared capability, daemon provenance, workflow intent, typed errors and installed Runtime contracts. Deterministic SDK contract tests supplement live cases when an upstream does not naturally reject a standard level.

Manual UI: select an unprofiled compatible model; verify Off, Auto and the five strength levels Low, Medium, High, Xhigh and Max are available as attempts. Minimal and other additional levels remain available when explicitly declared by the model. Send a request; inspect the picker for last sent effort and factual fallback reason (including Minimal if the SDK falls back to it). Switching model or effort must hide an unrelated observation and never rewrite the selection.

## Final validation results

- Official npm and npmmirror both serve rc.8. Root/Desktop manifests, npm lock and installed package are pinned to the official registry artifact. The production release-dependency gate passed, including installed-file byte comparison and the universal native bundle. Global CLI reports 0.7.96-rc.8 and its doctor command runs successfully.
- Global Windows npm installation attempted to compile the macOS-only optional fsevents dependency and failed. The global CLI was installed with --ignore-scripts as a local workaround. Space's normal workspace install succeeded without that workaround. No published SDK bytes were patched.
- npm test: 4,184 passed, 20 skipped, zero failed (90 release tests, 3,752 desktop tests, 362 schema tests; totals include skipped tests). This includes the root/child observation regression added during this work.
- Typecheck, changed-file ESLint and build:smoke passed.
- Reasoning helper/error/ladder coverage: 98.08% lines, 89.41% branches, 95% functions across the three focused modules.
- The SDK's 29 custom-reasoning regression cases were run against Space's installed rc.8 exports and all passed. They cover default, none fallback, high levels, cached rejections, rate-limit behavior and all reasoning response extensions, including encrypted/structured replay.
- Three isolated released-SDK shell probes passed: implicit CLI production NODE_ENV is not leaked to user commands; explicit production/development values are preserved.
- Desktop Playwright: existing provider/model picker case passed; new unknown-capability/last-sent observation case passed. The new case checks all standard choices, preserves Off while reporting sent Minimal/cached rejection, and clears an observation when the user's selection changes. Screenshot visually checked.
- Space desktop validation uses isolated profiles and compiled development artifacts. No new Space installer/release was published by this task.

## Released DOMException integration follow-up

- Added four persistent cases in `provider-credential-scope.test.ts` using Space's actual credential lease wrapper and the installed rc.8 public SDK exports. Synthetic credentials only; no provider network requests or real keychain reads.
- Each case derives a child lease, throws a native TimeoutError or AbortError through `withProviderRequestCredential`, and passes the SDK-redacted result to Space's `wrapSdkError`. Direct errors, two-level nested causes and cyclic causes preserve native name/code/stack, redact credentials, retain Space's network/cancelled classification and release credential access afterwards.
- Rechecked 393 tests covering credentials, error reporting, reasoning intent, Runtime host projection, session queue, terminal evidence and workflows: all passed. Typecheck and the added test file's ESLint check passed. These focused results supplement the full-suite results above; the full suite was not rerun for this test-only addition.
- No additional production workaround, sandbox permission change or Agent Home redirection was introduced.

## Seven-choice picker follow-up (2026-09-17)

- Corrected the unknown-capability picker to Off, Auto, Low, Medium, High, XHigh and Max. Minimal remains available when explicitly declared and remains visible as an observed SDK fallback.
- Confirmed the ladder regression failed before the change and passed afterwards. The 26 focused reasoning/schema tests, broader targeted Runtime/credential/workflow tests, typecheck, changed-file ESLint and build:smoke passed.
- Exercised the installed rc.8 public provider against a local HTTP fixture: auto sent max; rejected high fell back to medium and was skipped on the next call; rejected none fell back to minimal. Combined reasoning/reasoning_details produced one thinking text. These are deterministic transport checks, not additional upstream probes.
- Both model-picker desktop E2E cases passed; the screenshot confirms seven choices, preserved Off intent and separately displayed sent Minimal. No installer was generated.

## Standards review

One P2 documentation synchronization finding was fixed in USER_MANUAL.zh-CN.md and the in-app manual, then independently rechecked. No remaining findings.

## Spec review

One P2 embedded child-event ownership finding was fixed with the existing child-event filter and a regression test, then independently rechecked. No remaining findings.

## Session failure verification (2026-09-17)

- Rechecked the defect from session `20260914_084034_oz884c2d160c23` against both installed artifacts. The same offline probe calls `runWithProviderCredential` and `redactScopedProviderCredential` with a synthetic credential, then reads native error properties. The desktop's packaged rc.6 throws `ERR_INVALID_THIS` for both TimeoutError and AbortError; workspace rc.8 preserves their names, numeric codes (23/20), and redacted messages.
- The production dependency gate verified that both Space manifests, the lockfile and installed SDK resolve to rc.8, and that installed SDK files match the locked npm release tarball byte for byte.
- Rechecked the four child-lease integration cases, typecheck, changed-file ESLint and `build:smoke`: passed. Focused reasoning/error/ladder coverage remains 98.08% lines and 89.41% branches.
- After unit tests finished, switched the native binding to Electron and ran `npm run e2e:run -- tests/e2e/model-picker.spec.ts`: both cases passed. The unknown-capability picker offers Off/Auto plus Low/Medium/High/XHigh/Max, while a sent Minimal fallback remains an observation rather than rewriting the selected Off intent. The native binding is left ready for Electron.
- Full `npm test` executed 4,208 cases: 4,150 passed, 20 skipped, 38 failed while the shared SQLite binding was missing, locked or switched to Electron ABI 146 instead of Node ABI 127. After verifying the Node binding, all 57 cases in the three affected files (`artifact-store`, `baseline-durable-store-atomic`, `create-artifact-tool`) passed. The original full invocation therefore exited nonzero; its failures were cleared by the targeted rerun, not by claiming a clean full rerun.
- Existing rc.8 production changes already cover the SDK contracts; this follow-up adds verification evidence without another production workaround. The previously packaged desktop still embeds rc.6. Building development artifacts does not replace that package or change a running process; loading rc.8 in that desktop requires a new package and restart.
