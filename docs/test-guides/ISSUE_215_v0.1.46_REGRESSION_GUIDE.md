# Issue 215：坏图与旧会话恢复

Space 已将 root/Desktop manifest 和 lockfile 精确更新为官方
`@kodax-ai/kodax@0.7.96-rc.5`，本地安装使用 Registry 实体包，不再使用 SDK dev-link。
接收/恢复时准备图片、后续请求复用，以及有证据的一次文字诊断恢复由 SDK 提供。
客户需使用包含本次更新的 Space 构建；已有运行进程需重启才能加载新 SDK。

## 已验证

```powershell
node --test --import tsx apps/desktop/electron/test/clipboard-save-image.test.ts
npx tsc -p apps/desktop/electron/tsconfig.json --noEmit
```

剪贴板 42 项通过、1 项主机符号链接权限相关跳过。新增用例验证：确认坏图不能
在归一化失败后写盘；有效 WebP 在原归一化器不支持时保留原字节，并纠正 MIME；
校验器不可用时保留原附图路径。旧 SDK 没有该可选接口时仍按原有规则处理。

SDK 已通过扩大回归、zhipu-coding/zai-coding 真实旧历史恢复以及 Windows
Node/Bun/真实 Electron ASAR 解码探针；细节见
[SDK 回归指南](../../../KodaX/docs/test-guides/ISSUE_335_v0.7.96_REGRESSION_GUIDE.md)。

## 正式包自动检查

2026-09-14 正式 rc.5 实体包验收完成：`npm test` 退出码 0，发布脚本 64 项、
桌面 Electron/renderer 3016 项、IPC schema 318 项通过（合计 3398，通过之外另有
5 项环境相关跳过）；完整类型检查、renderer/main 构建及改动代码 ESLint 通过。
初次全量的手册版本断言仍为 rc.4，修正后上述冻结复跑全部通过。

Windows x64 Setup/Portable 已生成（各约 158.5/158.3 MiB），精确 Registry 完整性、
ASAR 依赖/解码/Runtime、应用启动与连续两次完整退出/历史恢复均通过。日志保存在
工作区 `.tmp-rc5-full-test-final.log`、`.tmp-rc5-typecheck.log`、`.tmp-rc5-build.log`、
`.tmp-rc5-pack-smoke-final.log`、`.tmp-rc5-boot.log`、`.tmp-rc5-exit.log`。
未发布新的 Space 版本，未做 macOS/Linux 运行验收或真实客户资料测试。

```powershell
npm test
npm run typecheck
npm run build:smoke
node scripts/pack.mjs --win
```

`test:release` 使用实际安装的公开 SDK：正常 PNG 经过 read、tool_call、托管运行、
子 Agent 和 guardrail 后保留图片；缺少 SOF 帧的 JPEG 返回可操作的文字错误且原文件
不变；同路径替换成有效 PNG 后恢复读取并纠正 MIME。原有效图控制样本存在 CRC 错误，
已换成可解码样本，未降低 SDK 校验要求。

`smoke-pack` 实际从 ASAR 加载 media facade 并执行图片解码 Worker/WASM；有效 PNG
必须返回 valid，坏 JPEG 必须返回 invalid，unverified 不能冒充通过。未新增解包规则。
现有 Runtime、启动和完整退出 smoke 随打包执行。

本次实际打包曾暴露验收入口问题：旧 smoke 的 `--input-type=module` 被 SDK 的
CommonJS eval Worker 继承，导致 `require` 不可用。改成临时 `.mjs` 文件入口后，
同一份 ASAR 的正常 PNG/WebP、坏 JPEG 及 Runtime Worker 验证通过；没有修改 SDK
字节或解包规则。探针文件以排他方式创建并在完成后清理。

## Standards

独立子 Agent 复核 `09bee3b7` 到当前工作区改动：生产与测试无待修规范问题或
过度工程；文档中的 SDK 版本、问题统计和两份用户手册已同步。打包探针入口
修复经追加复核通过。剩余 finding：0。

## Spec

独立子 Agent 对照 Issue 215 与用户的正式 rc.5 集成要求复核：精确 Registry
依赖、剪贴板兼容、既有恢复事件以及真实 Worker/WASM 验收符合需求，未新增
功能限额或改写原历史。剩余 finding：0。

## 安装包人工验收

1. 粘贴和拖入正常 JPEG/PNG/WebP，可预览、发送、收到正常回复。
2. 使用由损坏 `.doc` 提取的 JPEG 模拟页眉：`read` 返回重新提取的提示，
   模型能够继续处理文字和其他正常图片；不要声称已看到了无法解码的图。
3. MCP 返回文字、正常图、坏图、结构化数据和 isError：只隔离坏图，其他结果保留。
4. 恢复含坏图的旧 Session，分别追问、关闭重开、fork 后追问、切换两家 Coding
   Provider：发送不再因该坏图返回 400，原 JSONL 和原图不被重写。
5. 把坏图原路径替换为正常 PNG，再次 read 或重新恢复运行：按新内容校验，MIME 不再沿用 JPEG。
   同一运行已经准备的正常图片，在原文件改写/删除后仍应保持原观察内容；新 read 才读取新内容。
6. 验证普通网络/认证/额度/上下文错误仍按原流程处理，不循环重试、不重跑已执行工具。
7. 解码期间取消，停止本次等待及剩余图片准备；普通文本的中途输入、等待子任务和恢复顺序不变。

macOS/Linux 以及上述实际用户操作流程仍需发布验收。服务端拒绝本地可解码图片时，
SDK 仅在明确的附件定位和错误证据支持下做请求视图修复并继续一次，不自动重编码，
不删除全部图片，不重写原历史；含糊错误不能承诺自动修复。
