# SDK 0.7.97-beta.7（本地候选包）的 Space 适配

> 2026-11-13 更新：候选包中的两个原生 Job 提交已随 SDK `0.7.97-beta.8` 正式发布，Space 已改回 Registry 依赖，见 [beta.8 适配](kodax-beta8-space-adaptation.md)。下文保留 beta.7 当时的接入与验收语境。

2026-11-12。Root 和 Desktop 精确依赖 `@kodax-ai/kodax@0.7.97-beta.7`，但**当前安装的是本地候选包**
`file:../KodaX/kodax-ai-kodax-0.7.97-beta.7.tgz`，不是 Registry 版本。
候选包 = 已发布 beta.7 + 两个未发布的 SDK 提交（`586ba53d5`、`72033b51f`：原生 Windows Job owner，修复 Issues 245–247）。

| 包                 | SHA-512                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ |
| 本地候选包（当前） | `dEwOi7OHTg9+4h3mRf4rKmM/Kq0OMuSGn0zWqOFfT6xf52De0zReMtp8X3RC7x385aAJ7uIlV8PqazrYs5adFw==` |
| Registry beta.7    | `GBEgt0X0YMbF62bpMfXRXYqcDchon7JUv/ltUzotROZo2PfzXMCPwRAfdFfg2WWXkVtz+lqNpxMPpCcQsOfftw==` |

SDK 发布含这两个提交的新版本（预期 beta.8）后，改回 Registry 依赖并重新生成 lockfile。
在此之前，打包用 `node scripts/pack.mjs --win --dir --allow-local-kodax`；正式发布入口会拒绝本地 SDK 依赖。
beta.7 修复了 [beta.6 记录](kodax-beta6-space-adaptation.md)中向 SDK 反馈的问题（SDK Issue 408）。

## SDK 变化与 Space 处理

| beta.7 变化                                                                                                    | Space 处理                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 视图、历史和搜索中的用户文字不再带观测标签；图片观测信息进入 `attachments[].observationId/width/height/sha256` | 删除 Space 自己的标签剥离。不再解析标签格式，也不再计算 `.media` 目录                                                                                                                                                         |
| `readItem({ part:'attachment' })` 读取 PNG、JPEG、WebP、GIF，返回实际 `mediaType`；历史条目 ID 同样可读        | 经 Host 读取并以实际格式预览（含 GIF）。校验用 SDK `validateImageBytes` 解码，加 SHA-256 与 PNG 尺寸核对；Space 不能预览的类型返回“不支持”且不发放能力。用户图片先尝试 Space 剪贴板沙箱（beta.5 之前保存的会话），否则经 Host |
| 粘贴或拖入 GIF                                                                                                 | SDK `normalizePastedImage` 把 GIF 重编码为静态首帧 PNG 再发送；无法转换的 GIF 被拒绝并提示，不会以 GIF 原样发给模型                                                                                                           |
| `visual_*` 工具归入 `read` 能力                                                                                | 无需改动                                                                                                                                                                                                                      |
| 扩展 `tool:before` 的审批请求带 `extensionAsks: {extension, reason}[]`                                         | 经 IPC 传到审批弹窗，逐条显示“扩展 X 要求确认：原因”。Space 判定为危险操作时，不再覆盖扩展给出的原因                                                                                                                          |

## 合并说明

本分支与 `origin/main`（Issues 245–247 的启动恢复与原生 Job 修复）合并。两侧各自适配了图片读取：
保留 main 的 SDK 解码校验与“不支持”状态，叠加本分支的沙箱优先回退与 GIF；其余冲突按文件取舍，
Electron main 对 SDK 的静态 import 改为 `createRequire`，以满足 ESM 边界测试。

## 验收

2026-11-12，分支 `feat/f305-one-host-space` 与 `origin/main` `bdac5688` 合并后，在已校验的本地候选包上运行。

打包门禁曾发现 node_modules 里是旧版 SDK 构建（npm 用了旧缓存，lockfile 的 integrity 本身是对的）。
重装并核对内容与 tgz 一致后，才重跑下列检查；此前一轮测试结果作废。

| 检查              | 结果                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 完整 `npm test`   | 发布脚本 153 通过 / 7 跳过；Desktop 4,357 通过 / 13 跳过（4,370）；Schema 373/373；0 失败                                                                                                                                                          |
| 类型、lint        | 通过                                                                                                                                                                                                                                               |
| 源码 Electron E2E | 22/22 通过：`file-attachments`（含新增的 GIF 选取后发送静态图并预览）、`runtime-startup-recovery`、`diagnostic-export`、`runtime-startup-diagnostics`、`runtime-startup-exit`、`sdk-unified-contract`、`runtime-user-input`、`runtime-diagnostics` |
| Windows 目录包    | `node scripts/pack.mjs --win --dir --allow-local-kodax` 通过：tarball 与已安装 SDK 内容逐文件核验、`smoke-pack` 全部检查通过                                                                                                                       |
| 成品冷启动        | Renderer 6,828 ms 就绪；Runtime 28,606 ms 就绪；122 条历史子进程记录全部保留并移到 `.unresolved/`                                                                                                                                                  |
| 成品完整退出      | 7/7 通过                                                                                                                                                                                                                                           |

未运行源码 Electron E2E 全集，没有覆盖 `extensionAsks` 审批弹窗渲染的 E2E，也未进行 macOS/Linux 实机验收，未创建标签或发布安装包。
正式发布前需要 SDK 发布含原生 Job 提交的版本并改回 Registry 依赖。日志在 `%TEMP%/kodax-f305/` 的 `m-*.log`。
