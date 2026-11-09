# 分支清理归档清单（2026-11-09）

初始比较基线 `a26a73d2`。领先/落后描述 Git 拓扑，不等同于需要合并的功能数量。以下清理已获本轮方案授权；表中引用在删除前逐项核对，未合并的旧提交先保存在远端归档标签。当前状态：归档已创建，等待最终代码验收后删除过时分支。

## 保留范围

- `main`：验证后快进并推送。
- `codex/alpha4-release-final`：另一个线程拥有，分支、工作树均不处理。
- `codex/ci-release-optimization`、`codex/queue-history-recovery`：仍被现有工作树占用，本地和远端均保留。
- `dev` / `origin/dev`：F144 设计与拆分保留，仍按主线规划排期。
- `origin/feature/partner-maintenance-20260917`：在线文档共享预览与 Whisper 保留，暂不集成也不清理。
- 工作区原有 `design-demos/` 不提交、不修改。

## 过时分支与恢复依据

| 引用                                                                      | 原 HEAD                                    | 领先 / 落后 | 恢复依据                                                                 | 处理理由                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------ | ----------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `refs/heads/backup/local-alpha4-prep`                                     | `32f24359cac40ea56d3943f0765e7ead8ece6276` | +3 / −90    | `archive/2026-11-09/backup/local-alpha4-prep`                            | 历史/视觉已适配恢复；四份研究原文单独归档；旧发布准备不覆盖主线。                   |
| `refs/heads/codex/beta4-main-integration`                                 | `f26a75a3f3d6861df50fe36f4cb729e34492525c` | +0 / −14    | `main` 的提交祖先                                                        | 已是主线祖先，提交仍由主线可达。                                                    |
| `refs/heads/codex/fix-artifact-standalone-window`                         | `528317a90f4aae9a72261993372c9bfb1f26c12d` | +1 / −330   | `archive/2026-11-09/codex/fix-artifact-standalone-window`                | 独立窗口修复已由第二步提取并验证。                                                  |
| `refs/heads/codex/kodax-077-space-maintenance`                            | `8963dd092da36293d1361c9ac583475ca5e82226` | +0 / −493   | `main` 的提交祖先                                                        | 已是主线祖先，提交仍由主线可达。                                                    |
| `refs/heads/codex/recover-step2-fixes`                                    | `a26a73d2abf4e9956d7c6d7ef79af6e894da3d50` | +0 / −0     | `main` 的提交祖先                                                        | 已是主线祖先，提交仍由主线可达。                                                    |
| `refs/heads/codex/sdk-alpha12-preparation`                                | `8c0ca5f18e9c25855f8d2d540b700b630d8e746b` | +4 / −57    | `archive/2026-11-09/codex/sdk-alpha12-preparation`                       | 过时的诊断点击探针与固定 CI run；实际 iframe 修复已入主线。                         |
| `refs/heads/codex/sdk-migration-closeout`                                 | `579e57c89c674eb60311d365badddf8199eb22db` | +0 / −110   | `main` 的提交祖先                                                        | 已是主线祖先，提交仍由主线可达。                                                    |
| `refs/heads/codex/startup-shutdown-ux`                                    | `7251094500cbe3b1083e73046947fbeeedadf9ae` | +1 / −468   | `archive/2026-11-09/codex/startup-shutdown-ux`                           | 与主线 fac8096b 等价的旧启动/退出补丁。                                             |
| `refs/heads/codex/windows-startup-diagnosis`                              | `bd3e9af711cd2ac3d7e8310c1266693d65d0b9d9` | +1 / −21    | `archive/2026-11-09/codex/windows-startup-diagnosis`                     | 旧诊断探针；attach 与输入/滚动修复已入主线。                                        |
| `refs/remotes/origin/codex/alpha7-current-consumer-qualification`         | `f10de75fe4187c454f9756f9c26d5f4a77a022bb` | +1 / −139   | `archive/2026-11-09/codex/alpha7-current-consumer-qualification`         | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-current-macos-qualification`            | `e588fe33dc46f68f00080d8b021627081ad9b2ff` | +1 / −137   | `archive/2026-11-09/codex/alpha7-current-macos-qualification`            | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-keyring-diagnostics`                    | `b4c2f467ff7f66ad8bdd38702300fc0296847023` | +4 / −149   | `archive/2026-11-09/codex/alpha7-keyring-diagnostics`                    | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-linux-qualification`                    | `847f03922d77768e8bd29fbcf7f851172f8e8006` | +1 / −151   | `archive/2026-11-09/codex/alpha7-linux-qualification`                    | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-macos-diagnostics`                      | `850e82d3602aafb75e519cc0484186eb388c2f48` | +1 / −149   | `archive/2026-11-09/codex/alpha7-macos-diagnostics`                      | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-macos-product-diagnostics`              | `0c02843cf2a5ccd9762d0e7db7463183de78085c` | +7 / −137   | `archive/2026-11-09/codex/alpha7-macos-product-diagnostics`              | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-macos-qualification`                    | `4675b96b6b5ecd0f944452b2386ab59829244a90` | +1 / −147   | `archive/2026-11-09/codex/alpha7-macos-qualification`                    | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-platform-probes`                        | `3dc7816189402f52874a565eb88a2624533342f0` | +1 / −149   | `archive/2026-11-09/codex/alpha7-platform-probes`                        | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-space-qualification`                    | `dcd21ef855cebca5c17dd2233b617807264f195f` | +0 / −128   | `main` 的提交祖先                                                        | 已是主线祖先，提交仍由主线可达。                                                    |
| `refs/remotes/origin/codex/alpha7-stop-receipt-qualification`             | `86d8439dbd4e84fa87e0ff0462f0954694459dd7` | +1 / −133   | `archive/2026-11-09/codex/alpha7-stop-receipt-qualification`             | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-windows-diagnostics`                    | `cb481304fe7bdd6605aa9a5813d69ced58904d4d` | +5 / −142   | `archive/2026-11-09/codex/alpha7-windows-diagnostics`                    | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-windows-history-contract-qualification` | `75a5e75d3ba27e8e47189bb1f19612e265d7e3f1` | +1 / −131   | `archive/2026-11-09/codex/alpha7-windows-history-contract-qualification` | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/alpha7-windows-input-phase`                    | `9026f959e076b1853324f21a58deea9baf090804` | +1 / −137   | `archive/2026-11-09/codex/alpha7-windows-input-phase`                    | 只含 alpha.7 临时 CI 筛选、日志与资格验证探针；保留证据，不回退当前 CI 与产品代码。 |
| `refs/remotes/origin/codex/fix-artifact-standalone-window`                | `528317a90f4aae9a72261993372c9bfb1f26c12d` | +1 / −330   | `archive/2026-11-09/codex/fix-artifact-standalone-window`                | 独立窗口修复已由第二步提取并验证。                                                  |
| `refs/remotes/origin/codex/kodax-077-space-maintenance`                   | `8db6e6504d8c65c82c8595538ee1dae3742ee9c5` | +0 / −501   | `main` 的提交祖先                                                        | 已是主线祖先，提交仍由主线可达。                                                    |
| `refs/remotes/origin/codex/sdk-alpha12-preparation`                       | `8c0ca5f18e9c25855f8d2d540b700b630d8e746b` | +4 / −57    | `archive/2026-11-09/codex/sdk-alpha12-preparation`                       | 过时的诊断点击探针与固定 CI run；实际 iframe 修复已入主线。                         |
| `refs/remotes/origin/codex/startup-shutdown-ux`                           | `7251094500cbe3b1083e73046947fbeeedadf9ae` | +1 / −468   | `archive/2026-11-09/codex/startup-shutdown-ux`                           | 与主线 fac8096b 等价的旧启动/退出补丁。                                             |
| `refs/remotes/origin/codex/windows-startup-diagnosis`                     | `bd3e9af711cd2ac3d7e8310c1266693d65d0b9d9` | +1 / −21    | `archive/2026-11-09/codex/windows-startup-diagnosis`                     | 旧诊断探针；attach 与输入/滚动修复已入主线。                                        |
| `refs/remotes/origin/docs/partner-beta3-published`                        | `517cdeb1ed0935384a863f80a7ffc8c653f407e3` | +0 / −235   | `main` 的提交祖先                                                        | 已是主线祖先，提交仍由主线可达。                                                    |
| `refs/remotes/origin/feature/partner-bundled-release`                     | `38cf025302c66473333083d4f815fe8b2a746cd5` | +0 / −240   | `main` 的提交祖先                                                        | 已是主线祖先，提交仍由主线可达。                                                    |
| `refs/remotes/origin/integration/partner-bundled-release`                 | `f8daed670b41c393f5084c4cea603e4b1c9882c7` | +39 / −244  | `archive/2026-11-09/integration/partner-bundled-release`                 | Partner 旧集成历史，主线已通过 PR #5 与后续 qualification 接入；不整支合入旧代码。  |

相同 HEAD 的本地与远端共用归档标签。18 个归档标签均以 `archive/2026-11-09/` 开头；release workflow 只接受 `v*` 标签，因此这些归档不发布安装器。合并后本轮临时 `codex/continuous-history-recovery` 同样可由主线恢复。

## 恢复方式

```powershell
git fetch origin refs/tags/archive/2026-11-09/backup/local-alpha4-prep:refs/tags/archive/2026-11-09/backup/local-alpha4-prep
git switch -c codex/recovered-alpha4-prep archive/2026-11-09/backup/local-alpha4-prep
```

其他条目使用其归档标签；已合并条目可从表中的完整 HEAD 建立新分支。不要在恢复时强行切换其他线程的工作树。

## 独立保留的研究材料

本地备份中的 `3cad4589` 四份研究恢复到原 `docs/research/` 路径，顶部明确标注历史归档，不把旧版本/排期视为当前状态：

- `kodax-unified-host-space-adaptation-plan-2026-10-31.md`
- `unified-host-sdk-upstream-contract-2026-10-31.md`
- `unified-host-space-lifecycle-delivery-2026-10-31.md`
- `unified-host-space-partner-integrations-2026-10-31.md`

## 执行核验

待最终验收与清理执行后记录实际数量、远端引用核验和主线同步结果。
