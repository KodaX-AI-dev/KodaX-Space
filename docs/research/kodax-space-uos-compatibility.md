# KodaX Space 能在统信 UOS 上运行吗？

统信 UOS 桌面版的 AMD64（x86_64）设备可以用现有 Linux `.deb` 包试装，实际可用性仍待验证。当前发布包仅覆盖 AMD64，ARM64、LoongArch、SW64 和 MIPS64 设备暂无对应的原生安装包。 [KodaX Space v0.1.46 发布文件](https://github.com/KodaX-AI-dev/KodaX-Space/releases/expanded_assets/v0.1.46) · [统信关于架构匹配的说明](https://faq.uniontech.com/desktopv25/e27f/1261)

## 已核实

- 截至 2026-11-25，KodaX Space 最新正式版为 v0.1.46，Linux 发布文件为 `KodaX-Space-0.1.46-amd64.deb` 和 `KodaX-Space-0.1.46-x86_64.AppImage`。当前源代码的 Linux 打包目标仍只配置 x64。 [正式版](https://github.com/KodaX-AI-dev/KodaX-Space/releases/latest) · [发布文件](https://github.com/KodaX-AI-dev/KodaX-Space/releases/expanded_assets/v0.1.46) · [electron-builder.yml，297–305 行](../../electron-builder.yml#L297-L305)
- 统信桌面 V20 白皮书在表 3-1 列出专业版、教育版覆盖 AMD64、ARM64、LoongArch、SW64、MIPS64，家庭版覆盖 AMD64。V25 专业版 2500 及以上的官方安装说明要求按处理器架构选择 `.deb`，例如 Intel、AMD、海光、兆芯选 amd64，飞腾、鲲鹏选 arm64。 [V20 白皮书，表 3-1](https://www.uniontech.com/uploads/files/2024/0415/mNpg6AjcW1labtNXUH35zmAuDhy62vS57T2PSgf0.pdf#page=7) · [V25 专业版安装说明](https://faq.uniontech.com/desktopv25/e27f/1261)
- v0.1.46 发布页注明安装包未签名。统信桌面专业版的安装策略可能因缺少有效数字签名而阻止试装。 [v0.1.46 安装说明](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.46#installation-notes) · [统信桌面专业版签名说明](https://faq.uniontech.com/desktop/app/133f) · [统信 V25 专业版签名说明](https://faq.uniontech.com/desktopv25/e27f/675e)
- v0.1.46 和当前工作区均固定 Electron 42.5.0。Electron 在该版本的 README 中称 Linux 预构建产物使用 Ubuntu 22.04 构建，并列出 Ubuntu 18.04+、Fedora 32+ 和 Debian 10+ 的上游验证范围。统信 V20 白皮书表 3-7 列出 glibc 2.28。Space 的发布包另外包含原生 SQLite 和终端组件，应用整体所需的系统库版本应以实际发布包和客户环境为准。 [v0.1.46 package.json，72 行](https://github.com/KodaX-AI-dev/KodaX-Space/blob/v0.1.46/package.json#L72) · [当前 package.json，73 行](../../package.json#L73) · [Electron 42.5.0 平台说明](https://github.com/electron/electron/blob/v42.5.0/README.md#platform-support) · [V20 白皮书，表 3-7](https://www.uniontech.com/uploads/files/2024/0415/mNpg6AjcW1labtNXUH35zmAuDhy62vS57T2PSgf0.pdf#page=25) · [SQLite 打包配置](../../electron-builder.yml#L32-L46) · [终端组件打包配置](../../electron-builder.yml#L145-L155)
- 当前发布流程的 Linux 打包验收运行在 Ubuntu，包内端到端测试使用 D-Bus、Xvfb 和 gnome-keyring。 [发布工作流，224–269 行](../../.github/workflows/release.yml#L224-L269)

## 未证实

本次查阅了发布文件、源代码和官方文档。UOS 实机上的安装和运行结果、发布包所有原生组件要求的最低系统库版本，以及是否获得统信适配认证，均待核实。

## 未解问题

- 客户使用的 UOS 桌面版本、补丁号和 CPU 架构是什么？版本可通过控制中心「关于本机」查看，架构可在终端运行 `arch` 查看。 [统信官方查询方法](https://faq.uniontech.com/desktop/f435/8f32/6612)
- 对应 AMD64 设备能否安装正式版 `.deb`，并通过应用启动、凭据保存、一次基本任务和内置终端检查？
