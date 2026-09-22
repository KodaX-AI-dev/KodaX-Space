# FEATURE_276 — 用户自主安装的本地语音输入

**版本**：Space 0.1.46-rc.2 开发分支，功能未发布；2026-09-22。

**分支**：`feature/partner-maintenance-20260917`。

**范围**：Coder / Partner 共享输入框、设置 → 语音输入；不修改 KodaX Runtime。

## 使用方法

1. 打开“设置 → 语音输入”，点击“安装语音输入”。也可点击输入框麦克风打开安装面板。
2. 等待下载、完整性校验和模型初始化完成。选择“中文（简体）”、English 或自动识别，默认中文。
3. 点击麦克风并授权，讲话后点击停止；识别文字追加到当前草稿，检查后自行发送。单次最多 30 秒。
4. 点击取消可放弃当前录音/识别。设置中可检查/修复或删除已下载组件。

模型为 **Whisper Base multilingual Q5_1**，不是 `base.en`。模型 59,707,625 bytes；macOS arm64 引擎下载 1,516,419 bytes，总下载约 61.2 MB，界面保守显示约 62 MB；安装后的模型和引擎约 64.1 MB，不含临时文件/内存。其他支持平台的压缩引擎约 1.2–1.6 MB。运行时内存高于下载大小。

Whisper 模型、whisper.cpp、whisper.node 采用 MIT 许可，可免费商用；发行时保留版权与许可证。安装目录包含 `THIRD-PARTY-NOTICES.txt`，仓库副本为 [第三方声明](../voice-third-party-notices.txt)。本地推理无按次费用，不需要 ASR API key；正常发送草稿后的 LLM 调用仍按用户所选服务计费。

模型与平台引擎 URL、版本、大小和 SHA-256 固定在 `apps/desktop/electron/voice/manifest.ts`。下载需要访问 Hugging Face 和 npm Registry；离线可使用已安装组件，不能首次安装。

## 前置条件

- 使用包含 F276 的开发构建或后续安装包；当前发布版本不会因为分支上传自动获得功能。
- 为验收使用独立 `KODAX_PROFILE_DIR`；不删除日常用户数据。Mac 允许麦克风权限，Windows / Linux 准备可用输入设备。
- 默认不下载语音组件；本地 ASR 无账号要求。界面渲染用 Space Electron，不在普通网页中运行本功能。
- 冷启动模型加载可能明显慢于连续识别。本次 Apple Silicon 冷加载约 21–23 秒；模型闲置 60 秒后回收，下次需要重新加载。这是实测样本，不是性能承诺。

## 人工测试用例

每项实际结果与 Pass / Fail 由执行人填写；以下步骤不是“全部已人工通过”的声明。

### TC-01 安装、中文输入与草稿保留

**优先级**：高；**类型**：正向；**前置条件**：全新独立配置、联网。

1. 启动 Space，不点击安装，确认没有模型下载；打开语音设置并主动安装。
2. 等待“可以使用本地语音输入”，在输入框写“已有草稿”，录入一句中文后停止。
3. 断网，再录入一句中文；检查草稿和对话。

**预期**：进度可见，实际模型加载后就绪；两次文本均追加到草稿，无自动发送，无音频文件。实际结果：待填。

### TC-02 中断、损坏、修复与卸载

**优先级**：高；**类型**：负向；**前置条件**：独立配置，允许检查其中的 voice 目录。

1. 下载中取消，再重新安装；重复快速点击安装。
2. 退出测试构建后，仅在测试配置中损坏 `voice/whisper-base-q5_1-node-1.1.3/model.bin`，重新启动并点击修复。
3. 下载中完全退出后重启，确认残留 `.part` 清理；重新安装后点击删除。

**预期**：不重复安装，不把不完整/损坏组件标为可用；修复重新校验并加载；卸载等待 worker 退出后删除整个组件目录。实际结果：待填。

### TC-03 权限拒绝与静音

**优先级**：高；**类型**：负向；**前置条件**：组件已安装。

1. 在系统设置拒绝麦克风权限，点击录音；之后恢复权限重试。
2. 录制静音并停止。

**预期**：拒绝时提示去系统设置授权；静音提示未检测到清晰语音；草稿不变，录音设备释放。实际结果：待填。

### TC-04 30 秒、取消与上下文切换

**优先级**：高；**类型**：边界；**前置条件**：组件已安装，两个测试会话/项目可切换。

1. 连续录音超过 30 秒，确认自动停止并识别。
2. 在等待权限、录音、识别三个阶段分别取消。
3. 分别切换会话、项目、Coder/Partner，或新建空白会话；包括从空白会话再次新建空白会话。
4. 识别尚未完成时发送已有草稿，再输入下一条草稿；最后测试隐藏/关闭窗口。

**预期**：最长 30 秒；取消、旧会话、旧草稿的迟到结果不插入当前草稿，录音停止，识别 worker 被终止。实际结果：待填。

### TC-05 界面与语言

**优先级**：中；**类型**：UI；**前置条件**：组件已安装。

1. 在明暗主题、中英文界面与较窄窗口下打开设置和麦克风面板。
2. 用键盘操作安装、停止、取消、关闭、语言选择；切到 English，录入英文并重启检查选择。

**预期**：控件可读、可聚焦，有状态说明；安装期间可取消；识别语言保持，输入框保留原文本。实际结果：待填。

### TC-06 冷热启动和内存释放

**优先级**：中；**类型**：性能；**前置条件**：已安装，准备固定 5–10 秒音频和进程监视工具。

1. 首次输入记录加载及识别耗时；60 秒内重复，比较耗时。
2. 闲置超过 60 秒，确认 `Space local voice` utility process 退出；再输入。
3. 冷启动立即取消、卸载及完全退出，确认无迟到启动遗留进程。

**预期**：界面保持可操作，同一时刻只接受一个转录；连续输入复用模型，闲置/取消/退出释放；记录实际延迟和内存，不用单次样本估计所有设备。实际结果：待填。

### TC-07 IPC、隐私与分发

**优先级**：高；**类型**：安全；**前置条件**：测试构建和 IPC/网络观测工具。

1. 运行本指南末尾的 schema/远程子框架测试；验证过大 PCM、奇数字节、URL、路径和命令字段被拒绝。
2. 安装后断网识别，检查日志、临时目录和网络请求；测试远程 iframe 无语音桥和麦克风权限。
3. 检查下载字节和解压 native 二进制均校验 SHA-256；检查安装目录许可证。

**预期**：只有可信主窗口可调用；录音仅在内存中处理、不入日志；取消/卸载不越出组件目录；许可证随模型引擎分发。实际结果：待填。

### TC-08 平台与安装包

**优先级**：高；**类型**：兼容性；**前置条件**：目标架构真实机器与发布候选安装包。

1. 在 macOS arm64/x64、Windows x64、Linux x64 执行 TC-01、02、03、06。
2. macOS 核对安装包包含 `NSMicrophoneUsageDescription`，在签名/公证环境验证加载外部 native 引擎和麦克风授权。
3. 不支持架构检查不可安装说明。

**预期**：对应平台二进制加载，离线中英文可用；没有 Python/编译器安装要求；不支持平台不发起下载。实际结果：待填。

## 2026-09-22 自动验证记录

| 检查 | 结果与边界 |
| --- | --- |
| 安装生命周期 TDD | 损坏下载拒绝、取消、修复、重启检查、原生加载失败、残留清理、原生包精确提取及双哈希验证通过 |
| 进程与草稿 TDD | 启动前取消后补杀、等待退出、模型复用、迟到麦克风/转录取消、成功结果一次插入通过 |
| 定向回归 | 374 tests，0 fail / 0 skip；全部 IPC schema、远程 frame 权限、共享 Partner 输入框与新增 voice 测试 |
| 覆盖率 | installer / runner / dictation 三个被测模块合计行覆盖率 96.58%；非整个新功能或 UI 的覆盖率 |
| 静态与构建 | `npm run typecheck`、`npm run lint`、`npm run build:smoke` 通过 |
| Electron 实际下载/加载 | macOS arm64，Electron 42.5.0，独立测试 profile；Electron net.fetch 下载模型并经真实 native 加载后 ready；发现并修复 Node fetch 超时及 fork env 中 undefined 问题 |
| 真实组件录音链路 | 公开中文 WAV 通过测试用 Web Audio MediaStream → 实际 MediaRecorder/解码/PCM → 实际 IPC/utility process/Whisper → 草稿，成功保留已有文本并追加识别结果；未录制用户真实麦克风 |
| 离线识别 | Electron session 网络设为 offline 后，英文 JFK PCM 通过真实 IPC 返回预期英文；warm 调用约 345 ms，仅一次样本 |
| 取消/错误/卸载 UI | 录音取消保留原草稿；注入 NotAllowedError 显示中文权限提示；静音显示 noSpeech；卸载后目录不存在且 UI 返回“尚未安装” |
| 双轴评审 | Standards / Spec 分别复核；迟到启动、空白新会话、正常退出、损坏状态和启动前进程取消问题已修复，无剩余可行动发现 |
| 未验收范围 | 真实硬件麦克风、完整 Space 桌面交互回归、签名/公证安装包、Windows / Intel Mac / Linux 真机；本次未发布组织 Release |

首次验证复用一个可见 Electron 窗口；该窗口结束后，后续组件验收在隐藏窗口完成，未反复弹出测试窗口。所有安装/卸载均位于独立临时 profile，未改变日常 Space 配置。

回归命令：

```sh
node --import tsx --test packages/space-ipc-schema/test/*.test.ts packages/space-ipc-schema/src/*.test.ts packages/space-ipc-schema/src/channels/*.test.ts apps/desktop/electron/window/remote-frame-permissions.test.ts apps/desktop/renderer/src/shell/BottomBar.partner.test.ts apps/desktop/electron/voice/*.test.ts apps/desktop/renderer/src/features/voice/dictation.test.ts
npm run typecheck
npm run lint
npm run build:smoke
```

测试素材：[公开中文样本](https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01/blob/main/test_wavs/0.wav)、[whisper.cpp JFK 样本](https://github.com/ggml-org/whisper.cpp/blob/v1.8.4/samples/jfk.wav)。原始样本本身不打包进产品。

源码完成、上传自己的分支、合入组织主线、发布安装包是不同状态；此记录只证明上述本地开发验证。
