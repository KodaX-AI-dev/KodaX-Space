# KodaX Space、KodaX CLI 和 SDK 能在 Anolis OS 8.x 上使用吗？

截至 2026-11-27，稳定版 v0.1.46 和预发布版 v0.1.47-rc.2 的 x86_64 AppImage 都无法在使用标准系统库的 Anolis OS 8.10 上完整运行。两版的 SQLite 和伪终端模块都需要系统缺少的 glibc 符号。此判断来自发布二进制和龙蜥系统库的静态比对。[稳定版](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.46) · [预发布版](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.47-rc.2) · [龙蜥官方 glibc RPM](https://mirrors.openanolis.cn/anolis/8.10/BaseOS/x86_64/os/Packages/glibc-2.28-251.0.2.an8.53.x86_64.rpm)

单独运行 KodaX 时，Anolis 8.10 的 x86_64 和 aarch64 测试结果一致。稳定版在 RHCK 4.18 上拒绝文本写入，在 ANCK 5.10 上通过；0.7.97-rc.2 在两个内核上均通过。测试方法和范围见下文。

## 系统版本

龙蜥官方镜像列出了 8.2、8.4、8.6、8.8、8.9、8.10，未列出 8.1。8.10 是独立的小版本。对于标为「8.1」的机器，需以目标机的 `cat /etc/os-release`、`uname -m`、`getconf GNU_LIBC_VERSION` 确认发行版、架构与系统库。[官方镜像目录](https://mirrors.openanolis.cn/anolis/) · [8.10 发布说明](https://openanolis.cn/blog/detail/1338898869152530451)

## 安装包与系统库的比对

下载两个版本的 x86_64 AppImage，对照 GitHub Release 资产元数据核验 SHA-256，解开 SquashFS 后读取 ELF 的版本需求表和动态符号表。下表是各文件实际引用的最高 GLIBC 版本。两版 Linux 发行资产均只有 x86_64/amd64。[稳定版资产元数据](https://api.github.com/repos/KodaX-AI-dev/KodaX-Space/releases/tags/v0.1.46) · [预发布版资产元数据](https://api.github.com/repos/KodaX-AI-dev/KodaX-Space/releases/tags/v0.1.47-rc.2)

| AppImage 内文件 | v0.1.46 | v0.1.47-rc.2 | 具体导入 |
| --- | --- | --- | --- |
| `kodax-space` | GLIBC_2.25 | GLIBC_2.25 | Electron 主程序 |
| `better_sqlite3.node` | GLIBC_2.34 | GLIBC_2.34 | 两版均引用 `dlopen@GLIBC_2.34` 和 `pthread_create@GLIBC_2.34`，另需 `GLIBCXX_3.4.29` |
| `pty.node` | GLIBC_2.34 | GLIBC_2.42 | 稳定版引用 `openpty@GLIBC_2.34`，预发布版还引用 `cfsetospeed@GLIBC_2.42` |

官方 8.10 x86_64 RPM 中的 `libc-2.28.so` 提供 `GLIBC_2.28`，缺少上述 `GLIBC_2.34` 和 `GLIBC_2.42`。AppImage 中也没有替代的 libc。这足以确认这些原生模块不能在标准环境下加载。可见影响包括 Artifact 目录、Partner 知识索引和内置终端。终端按需加载原生模块，因此打开主窗口不足以确认兼容。[官方 RPM](https://mirrors.openanolis.cn/anolis/8.10/BaseOS/x86_64/os/Packages/glibc-2.28-251.0.2.an8.53.x86_64.rpm) · [Artifact 存储](https://github.com/KodaX-AI-dev/KodaX-Space/blob/v0.1.46/apps/desktop/electron/artifact/store.ts#L939) · [Partner 知识索引](https://github.com/KodaX-AI-dev/KodaX-Space/blob/v0.1.46/apps/desktop/electron/kodax/partner-knowledge-index.ts#L321) · [终端加载逻辑](https://github.com/KodaX-AI-dev/KodaX-Space/blob/v0.1.46/apps/desktop/electron/terminal/ptyHost.ts#L30)

### 独立复核

两个 AppImage 的 SHA-256 分别为 `21666c33f7ce8c424fe660f72b7f06ff17071e97df2479f7a39d628c8bea02e7`（v0.1.46）和 `2cb64b2f9e3a250aa6c0230e4847064f7a7dacc1b9a9634d8b1abeb38df0a3d5`（v0.1.47-rc.2）。在 x86_64 Linux 上，可以对每个安装包分别执行以下命令复核导入符号。将第一行的路径改成待查文件。[稳定版下载](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.46) · [预发布版下载](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.47-rc.2)

```bash
app=./KodaX-Space-0.1.46-x86_64.AppImage
sha256sum "$app"
chmod +x "$app"
"$app" --appimage-extract >/dev/null
find squashfs-root -type f \( -name better_sqlite3.node -o -name pty.node \) \
  -print -exec objdump -T '{}' \; | grep -E '\.node$|GLIBC_2\.(34|42)|GLIBCXX_3\.4\.29'
```

## 未证实与未解问题

本次没有在目标机上运行图形桌面，因此主窗口是否能打开、第一处可见故障以及厂商定制版「8.1」的实际系统库仍待确认。上述符号检查针对 AppImage，未单独拆检同版本的 Debian 包。源码适配可先在 Anolis 8 的 glibc 2.28 环境中针对对应 Electron ABI 重编 SQLite 和 PTY 模块，再用生成的包验证桌面启动、Artifact 和终端。该方案尚未进行构建和实机验收。
## 单独使用 KodaX CLI 和 SDK

Space v0.1.46 依赖 KodaX 0.7.96，Space v0.1.47-rc.2 依赖 KodaX 0.7.97-rc.2。独立 KodaX 提供 Linux x64 和 arm64 的命令行压缩包，也提供适用于 Node.js 的 npm CLI 与 SDK。[Space 稳定版依赖](https://github.com/KodaX-AI-dev/KodaX-Space/blob/v0.1.46/package.json) · [KodaX 稳定版资产](https://github.com/icetomoyo/KodaX/releases/tag/v0.7.96) · [KodaX 预发布版资产](https://github.com/icetomoyo/KodaX/releases/tag/v0.7.97-rc.2)

### 发布包与运行环境

四个独立 CLI 压缩包的 SHA-256 均与官方资产元数据一致。ELF 版本需求表显示两个版本、两种架构的主程序最高引用 `GLIBC_2.17`。稳定版在两种架构上的文本事务模块最高引用 `GLIBC_2.28`，RC 在 x64 上降到 `GLIBC_2.14`，在 arm64 上降到 `GLIBC_2.17`。龙蜥 8.10 的 glibc 2.28 满足四个组合。使用独立版应完整解压并保留 `vendor/` 等随包文件，无需另装 Node。[稳定版校验信息](https://api.github.com/repos/icetomoyo/KodaX/releases/tags/v0.7.96) · [RC 校验信息](https://api.github.com/repos/icetomoyo/KodaX/releases/tags/v0.7.97-rc.2) · [打包文件清单](https://github.com/icetomoyo/KodaX/blob/v0.7.97-rc.2/.github/workflows/release.yml)

使用 npm CLI 或嵌入 SDK 时，本次选用官方 Node.js 22.23.1。Node 22 的 x64、arm64 Linux 构建要求内核 ≥4.18、glibc ≥2.28、`GLIBCXX_3.4.25`。KodaX 两个根包分别声明 Node ≥20.0.0 和 ≥20.16.0，但 RC 当前可解析到要求 Node ≥22 的 Azure 传递依赖。[Node 22 平台与工具链](https://github.com/nodejs/node/blob/v22.23.1/BUILDING.md#official-binary-platforms-and-toolchains) · [稳定版 npm 元数据](https://registry.npmjs.org/@kodax-ai%2fkodax/0.7.96) · [RC npm 元数据](https://registry.npmjs.org/@kodax-ai%2fkodax/0.7.97-rc.2) · [Azure 依赖元数据](https://registry.npmjs.org/@azure%2fcore-auth/1.11.0)

### 运行验证

用 QEMU 的 CPU 模拟模式启动龙蜥官方内核，用户态取自官方 Anolis 8.10 容器镜像，测试文件位于虚拟机的内存文件系统。测试有四项：完整解压的独立 CLI 执行 `--version` 和 `--help`；用官方 Node 运行 npm 包的 CLI 入口；导入 SDK 根入口及 `@kodax-ai/kodax/runtime`；用独立版内置运行时加载随包原生模块，连续执行 snapshot、创建、修改，再读回并校验两次内容。原生写入测试直接调用 KodaX 的文本事务接口，未调用模型。构建 npm 测试环境时，针对目标 OS 和架构解析依赖，并将文件放入虚拟机。[龙蜥 x86_64 镜像](https://mirrors.openanolis.cn/anolis/8.10/isos/GA/x86_64/) · [龙蜥 aarch64 镜像](https://mirrors.openanolis.cn/anolis/8.10/isos/GA/aarch64/) · [原生模块接口](https://github.com/icetomoyo/KodaX/blob/v0.7.97-rc.2/native/windows-text-transaction/src/node_api.rs)

两个版本在两种架构和两个内核上均通过独立 CLI 版本及帮助检查、npm CLI 版本检查、SDK 根入口和 runtime 入口导入。下面是原生模块创建并修改文件的结果。

| Anolis OS 8.10 内核样本 | 架构 | KodaX 0.7.96 的创建和修改 | KodaX 0.7.97-rc.2 的创建和修改 |
| --- | --- | --- | --- |
| RHCK 4.18.0-553.97.1.0.1.an8 | x86_64、aarch64 | 两种架构均报 `unsupported_filesystem` | 两种架构均成功 |
| ANCK 5.10.134-20.2.an8 | x86_64、aarch64 | 两种架构均成功 | 两种架构均成功 |

4.18 上稳定版返回的具体错误为 `trusted text filesystem does not report mount identity`。稳定版只从 `statx` 取挂载 ID；RC 在该字段缺失时会读取 `/proc/self/fdinfo`。这解释了相同 glibc 下，不同内核的写入结果为何不同。上游把 4.18 和 4.19 都列入修复范围；本次测试的内核为表中两个具体构建。[稳定版实现](https://github.com/icetomoyo/KodaX/blob/v0.7.96/native/windows-text-transaction/src/unix_transaction.rs#L56-L85) · [RC 修复说明](https://github.com/icetomoyo/KodaX/blob/v0.7.97-rc.2/CHANGELOG.md#L999-L1005) · [RHCK 内核包](https://mirrors.openanolis.cn/anolis/8.10/BaseOS/x86_64/os/Packages/kernel-core-4.18.0-553.97.1.0.1.an8.x86_64.rpm) · [ANCK 内核包](https://mirrors.openanolis.cn/anolis/8.10/kernel-5.10/x86_64/os/Packages/kernel-core-5.10.134-20.2.an8.x86_64.rpm)

本轮没有连接模型，没有验证真实项目的 ext4/XFS 挂载、交互会话、Undo 或 ASRT shell 沙箱。启用 Linux shell 隔离还需 bubblewrap、socat、ripgrep 及允许非特权用户命名空间的主机策略。要确认一台标为「8.1」的机器属于哪个组合，可先运行下列命令。[KodaX 沙箱说明](https://github.com/icetomoyo/KodaX/blob/v0.7.97-rc.2/public_docs/configuration/sandbox.md#L38-L54) · [主机策略说明](https://github.com/icetomoyo/KodaX/blob/v0.7.97-rc.2/public_docs/getting-started/installation.md)

```bash
cat /etc/os-release
uname -rm
getconf GNU_LIBC_VERSION
```

### 在目标机复核文本写入

以下命令在已解压的独立 Linux 包目录执行，只在新建的临时目录创建测试文件。它使用随包 Bun 运行时执行原生文本事务，验证创建、修改及两次读回。它与虚拟机测试使用同一接口。[KodaX 原生接口](https://github.com/icetomoyo/KodaX/blob/v0.7.97-rc.2/native/windows-text-transaction/src/node_api.rs)

```bash
BUN_BE_BUN=1 ./kodax -e '
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { TrustedTextTransactionRoot } =
  require("./vendor/kodax-native/linux-" + process.arch + "/kodax-text-transaction.node");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kodax-anolis-"));
  const work = path.join(dir, "work");
  const state = path.join(dir, "state");
  const file = path.join(work, "check.txt");
  fs.mkdirSync(work, { mode: 0o700 });
  fs.mkdirSync(state, { mode: 0o700 });
  const root = new TrustedTextTransactionRoot(work, state, false);
  for (const value of ["first", "second"]) {
    const before = await root.snapshot(file);
    const result = await root.commit(file, before.revision, value, false, 5000);
    if (fs.readFileSync(file, "utf8") !== value) throw Error("content mismatch");
    process.stdout.write(result.status + " " + file + "\n");
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });'
```


## Electron 42.5.0 的桌面依赖

**Anolis OS 8.10 x86_64 的官方桌面库足以让 Space 发布包里的 Electron 42.5.0 在 X11 上创建窗口并渲染页面。** Space v0.1.46 与 v0.1.47-rc.2 中 `kodax-space` 主 ELF 的 SHA-256 相同，均为 `481d576df01c7f2ba084f8024d3d0f4afa2f9b5b41b1c3c8da012d52ff8b6467`。本次使用该 ELF、配套 Chromium 资源和最小 Electron 测试应用，单独评估图形运行时。[稳定版发布物](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.46) · [RC 发布物](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.47-rc.2)

| 组件 | 检查的龙蜥 x86_64 RPM | 符号与实际加载结果 |
| --- | --- | --- |
| GTK 3 | [gtk3 3.24.31-5.0.2.an8](https://mirrors.openanolis.cn/anolis/8.10/AppStream/x86_64/os/Packages/gtk3-3.24.31-5.0.2.an8.x86_64.rpm) | 54 个直接导入的 `gtk_*` 符号全部匹配，进程映射包含 `libgtk-3.so.0.2404.27`。 |
| NSS | [nss 3.112.0-4.0.1.an8](https://mirrors.openanolis.cn/anolis/8.10/AppStream/x86_64/os/Packages/nss-3.112.0-4.0.1.an8.x86_64.rpm) | `libnss3` 的 62 个版本化导入均匹配，最高需要 `NSS_3.30`，进程映射包含 `libnss3.so`。 |
| GBM | [mesa-libgbm 23.1.4-3.0.1.an8](https://mirrors.openanolis.cn/anolis/8.10/AppStream/x86_64/os/Packages/mesa-libgbm-23.1.4-3.0.1.an8.x86_64.rpm) | 19 个强导入、1 个弱导入均匹配，进程映射包含 `libgbm.so.1.0.0`。 |
| X11 与 XCB 的连接库 | [libX11-xcb 1.8.12-1.an8.1](https://mirrors.openanolis.cn/anolis/8.10/AppStream/x86_64/os/Packages/libX11-xcb-1.8.12-1.an8.1.x86_64.rpm) | Chromium 在初始化 X11 时动态加载 `libX11-xcb.so.1`。仅检查 `ldd` 会漏掉它。 |

主 ELF 的 34 项直接依赖由随包的 FFmpeg 和 33 项系统库提供。按官方 RPM 元数据核验包校验和，并核对实际 ELF，全部 1,461 个非弱导入均能解析。客体中的 `ldd -r` 同样没有报缺少共享库或未定义符号。[BaseOS 元数据](https://mirrors.openanolis.cn/anolis/8.10/BaseOS/x86_64/os/repodata/repomd.xml) · [AppStream 元数据](https://mirrors.openanolis.cn/anolis/8.10/AppStream/x86_64/os/repodata/repomd.xml)

### X11 窗口实测

在 QEMU 中启动 Anolis OS 8.10 x86_64 官方 RHCK 内核 `4.18.0-553.97.1.0.1.an8`，使用龙蜥 glibc 2.28、上述 RPM、Xvfb 和普通用户会话。缺少 `libX11-xcb.so.1` 时，链接检查通过，GUI 初始化以状态 133 退出；用同版本 Electron 官方调试符号定位到 `x11::InitXlib()`。在同一个测试环境加入龙蜥官方 `libX11-xcb` RPM 后，窗口成功打开。[Chromium 对应版本的加载逻辑](https://chromium.googlesource.com/chromium/src/+/refs/tags/148.0.7778.271/ui/gfx/x/xlib_support.cc#42) · [Electron 42.5.0 调试符号](https://github.com/electron/electron/releases/tag/v42.5.0)

测试创建 `BrowserWindow`，加载已知背景色的页面，读取标题与可见状态，再对窗口截图并校验像素。软件渲染测试和显式选择 GTK 3、保留默认 GPU 策略的测试都得到了以下结果。在后者中虚拟显示的 GPU 初始化失败，Electron 回退后仍能正确渲染。

```text
electron=42.5.0  title="Anolis GTK smoke"  visible=true
capture=480x293  pixel(BGRA)=[160,90,35,255]  exit=0
mapped=libgbm.so.1.0.0, libgtk-3.so.0.2404.27, libnss3.so
```

截图只提供发行版、架构和 glibc。目标机可用 `rpm -q gtk3 nss mesa-libgbm libX11-xcb` 核对已安装的软件包。本次覆盖 X11 软件渲染；用户机器上的显卡驱动、硬件加速与原生 Wayland 会话仍待实机验证。测试应用独立于 Space 业务代码，前文确认的 SQLite 与 PTY 模块 ABI 缺口仍然存在。

