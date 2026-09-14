# PR 草稿：随 Space 分发 Partner 专家与连接器库

目标仓库：`KodaX-AI-dev/KodaX-Space`；目标分支：`main`。本文件只作本地准备，尚未创建 PR 或发布。

## 用户效果

目前官方安装包不会自动带上个人分支开发的 Partner 能力。本次基于组织 `main@09bee3b7` 导入 Partner `193e7ebf`，将插件库、方法 Skill 和可信宿主一同打包。用户安装包含本次集成的新版 Space 后，进入 Partner 即可选择专家和默认方法，无需单独安装插件包。

目录包含 16 个在用专家和 13 个连接器。外部服务仍要求用户连接账号并授权资料范围。专家绑定可随 Partner 会话保存和恢复；Coder 共用这些专家、连接器的交互另行推进。

## 实现与融合

- 构建生成固定 Partner 归档，Electron 启动通过 Extension Store 完成一次随包注册；保留已有同 ID 包、停用和卸载选择。不会强制覆盖手动安装或自动升级旧插件版本。
- 保留组织 Space `0.1.46-beta.2` 与 SDK `0.7.96-rc.4` 的主线实现，合并 Partner/IPC/Shell 接缝，补齐 SDK 扩展 owner、pinned contributions 和生命周期 hooks 的转发。
- 修复 Partner 首页自动隐藏资料栏的恢复，以及 node-pty helper 的可执行权限；兼容预编译包和源码构建。
- 仓库元数据和安装包更新源改为组织仓库，保留官方应用身份；删除个人 Partner 发布工作流，后续通过组织短分支、PR 和 Space 发布线交付。

## 验证

收尾全量单元测试及单独收集的 TSX 组件合计 4,180 通过、5 跳过、0 失败；TSX 组件已纳入默认 `npm test`，随现有组织 CI/Release 执行。Partner 交互、默认 Coder Runtime 就绪及退出、路径别名清理和 helper 权限经过验证。类型检查、lint、构建和 macOS arm64 打包 smoke 通过；实际打包应用通过清洁 profile 下的默认运行模式及专家 mock 会话验收。详细范围及曾失败后修复的用例见 [集成记录](space-bundled-integration.md)。

## 发布前仍需执行

用户通知后才推送本分支及创建 PR。组织主线可能继续变化，上传前需重新核对基线。组织 CI 和 Windows/macOS x64/Linux 安装升级验收、真实外部账号验收仍待执行。

本地安装包沿用已存在的 `0.1.46-beta.2`，仅供本地验收。主线维护者需分配未使用的版本号并同步版本文件、CHANGELOG、标签及 Release，不能覆盖同版本官方资产。只有主线发布包含本次集成的版本，用户下载的新版 Space 才会获得这些能力。
