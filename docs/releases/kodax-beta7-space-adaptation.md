# Registry SDK 0.7.97-beta.7 的 Space 适配

2026-11-12。Root 和 Desktop 精确依赖 `@kodax-ai/kodax@0.7.97-beta.7`。
lockfile 使用 npm Registry URL，SHA-512 为
`GBEgt0X0YMbF62bpMfXRXYqcDchon7JUv/ltUzotROZo2PfzXMCPwRAfdFfg2WWXkVtz+lqNpxMPpCcQsOfftw==`。
beta.7 修复了 [beta.6 记录](kodax-beta6-space-adaptation.md)中向 SDK 反馈的问题（SDK Issue 408）。

## SDK 变化与 Space 处理

| beta.7 变化                                                                                                    | Space 处理                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 视图、历史和搜索中的用户文字不再带观测标签；图片观测信息进入 `attachments[].observationId/width/height/sha256` | 删除 Space 自己的标签剥离。不再解析标签格式，也不再计算 `.media` 目录                                                                                                             |
| `readItem({ part:'attachment' })` 读取 PNG、JPEG、WebP、GIF，返回实际 `mediaType`；历史条目 ID 同样可读        | 用户图片先尝试 Space 自己的剪贴板沙箱（beta.5 之前保存的会话），否则经 Host 读取。读取按实际格式校验长度、SHA-256 和文件签名，以实际格式返回。GIF 在 Space 中不预览，显示为不支持 |
| `visual_*` 工具归入 `read` 能力                                                                                | 无需改动                                                                                                                                                                          |
| 扩展 `tool:before` 的审批请求带 `extensionAsks: {extension, reason}[]`                                         | 经 IPC 传到审批弹窗，逐条显示“扩展 X 要求确认：原因”。Space 判定为危险操作时，不再覆盖扩展给出的原因                                                                              |

## 验收

2026-11-12，分支 `feat/f305-one-host-space`。

| 检查            | 结果                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------- |
| 完整 `npm test` | 发布脚本 153 通过 / 7 跳过；Desktop 4,339 通过 / 13 跳过（4,352）；Schema 373/373；0 失败 |
| 类型、lint      | 通过                                                                                      |
| 真实 Host 重建  | 3/3 通过，含带 PNG 的用户输入：正文无标签、图片经 Host 或沙箱预览可用                     |

| Windows 目录包 | `node scripts/pack.mjs --win --dir` 通过：`smoke-pack` 全部检查通过，含打包后的 beta.7 Runtime 与 Worker 执行 |
| 成品冷启动 | Renderer 5,394 ms 就绪；Runtime 27,105 ms 就绪；122 条历史子进程记录全部保留并移到 `.unresolved/` |
| 成品完整退出 | 7/7 通过 |

未运行源码 Electron E2E 全集，也未进行 macOS/Linux 实机验收，未创建标签或发布安装包。日志在 `%TEMP%/kodax-f305/` 的 `b7-*.log`。
