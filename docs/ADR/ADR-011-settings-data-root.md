# ADR-011: 数据位置由 Settings 指针决定，切换经 Host 停止重启，复制原位进行

- **Status**: Accepted
- **Date**: 2026-11-13
- **Companion**: [F148 设计](../features/v0.1.47.md#feature_148-settings-based-data-location)、[测试指南](../test-guides/FEATURE_148_v0.1.47_TEST_GUIDE.md)

## Context

Space 与 KodaX SDK 共享一个数据根（会话、设置、凭据、Runtime 状态）。此前有 `KODAX_HOME` 与 `KODAX_PROFILE_DIR` 两个变量，二者不一致时 Space store 与 SDK 落到不同目录。用户只能通过环境变量更换位置，而全局环境变量还会改变 CLI 的位置。SDK 在 import 时固定 `<KODAX_HOME>/sessions`，且每个 `KODAX_HOME` 只有一个 Host，所以运行中无法热切换。

## Decision

1. **单一变量**：只认 `KODAX_HOME`。`KODAX_PROFILE_DIR` 作为弃用别名保留一个版本。
2. **优先级**：测试模式 > Settings 指针 > `KODAX_HOME` > `~/.kodax`。指针存放在 `<appData>/KodaX Space/data-root.json`，即它描述的根之外，因此根不可用时仍可读取，也不会被复制。
3. **启动前解析**：`data-root-bootstrap` 是 `main.ts` 的第一个 import，在 store 与 SDK 加载前写好 `KODAX_HOME`。指针指向的位置不可用时，本次回退并询问用户，从不自动创建该目录。
4. **切换即重启**：复用更新安装的退出路径。Host 必须验证停止才继续；然后可选复制，再写指针，最后 relaunch。任何前置步骤失败都不写指针。
5. **复制原位进行，旧根只读**：SDK `copyKodaXDataRoot` 只接受空目标（忽略系统杂项文件），先写 `.kodax-copy-incomplete` 标记，完成后删除；失败时清理。JSON/JSONL 中指向旧根的绝对路径被改写到新根。按根独立的 Space 客户端身份与 input intents 不复制。

## 被否决方案

- **继续用环境变量**：用户难以设置，且全局变量会把 CLI 一起迁走；无法提示位置不可用。
- **指针放在根内或 Space settings.json 中**：根不可用时读不到指针，形成循环依赖。
- **运行中热切换**：SDK 在 import 时固定会话目录，Host 按根唯一，热切换需要重建全部 SDK 状态。
- **移动（剪切）数据**：中途失败会让数据分散在两处；复制并保留旧根，失败时可直接回退。
- **先复制到同级 `.copying` 目录再改名**：改名会在驱动器根、挂载点、被占用的目录上失败，清理失败目录时还可能删除用户数据；原位复制加标记没有这些问题。
- **只复制、不改写路径**：约十类 store（MCPB 安装目录、会话图片与媒体、模型可见的工具输出路径、workflow 快照、Partner 交付与检查点、学习计划等）保存旧根的绝对路径，复制后会继续读写旧位置。

## 后果与重审条件

- 切换需要重启，并且要求没有其他 KodaX 客户端连接当前根。
- 复制依赖 SDK 导出。没有该导出的 SDK 版本只提供“切换到空目录或已有数据目录”。
- 不随根移动的状态（Linux 全局 keyring 中的 Partner 连接器密钥、`safeStorage` 密钥、沙箱 ACL）记录在 F148 已知限制中。
- 若 SDK 提供运行中重定位会话目录与 Host 的公开契约，或改为以根内相对路径存储，重审“重启切换”与“复制时改写路径”。
