# 只改 CI（在 manylinux_2_28 容器里用 @electron/rebuild 重编 better-sqlite3 和 node-pty），能否让 KodaX Space Linux 包在 Anolis OS 8.10 上完整运行、功能与性能无损？

**TL;DR：部分成立。** 在 glibc 和 libstdc++ 的 ABI 层面，这个说法成立。v0.1.47-rc.2 的 AppImage 和 .deb 中只有 `better_sqlite3.node` 与 `pty.node` 两个 ELF 超出 GLIBC_2.28。gcc-toolset-14 满足 Electron 42 头文件对 C++20 和 GCC 11+ 的要求；`libstdc++_nonshared.a` 正好补上 better-sqlite3 唯一需要的 `GLIBCXX_3.4.29` 符号；两个模块的源码也没有随 glibc 版本变化的分支。但“只改 CI”和“完整、无损”这两点不成立，原因有五个。
(1) 现在发布的 `better_sqlite3.node` 是上游在 Debian 12 上编好的预编译件，和上游文件逐字节相同。只把构建放进容器，@electron/rebuild 仍会下载同一个文件，必须显式强制源码编译。
(2) Anolis 是 RPM 发行版，仓库里没有 dpkg，所以 .deb 在 Anolis 上无从谈起。
(3) 目标机还需要包外条件：`libX11-xcb`、FUSE2 的 `fuse-libs`，以及非特权用户命名空间。缺少用户命名空间时，AppImage 会自动加 `--no-sandbox`，Chromium 沙箱就没了。CI 解决不了这些问题。
(4) 原生 Wayland 会话尚未验证。
(5) “性能无损”没有基准数据支持。

调研日期 2026-11-27。目标机事实以用户截图为准：Anolis OS 8.10（`PLATFORM_ID="platform:an8"`）、x86_64、glibc 2.28、有图形桌面；内核（RHCK 4.18 或 ANCK 5.10）以及 X11/Wayland 未知。[前一份调研](kodax-space-anolis-8-compatibility.md)

## 1. Electron 42 原生模块的编译要求与 manylinux_2_28 工具链

| 结论 | 依据 |
| --- | --- |
| Electron 42.5.0 对应 Chromium 148.0.7778.271 和 Node v24.17.0，`NODE_MODULE_VERSION` 为 146。 | [electron DEPS@v42.5.0 L4-L7](https://github.com/electron/electron/blob/v42.5.0/DEPS#L4-L7)；本地检查 `node-v42.5.0-headers.tar.gz`（sha256 `1f8338d2…6c97`，与 electronjs.org `SHASUMS256.txt` 一致）中的 `include/node/node_version.h:25-27,98` |
| Electron 头文件在 Linux 上强制 `-std=gnu++20`、`-fno-rtti`、`-fno-exceptions`。 | 同一头文件包 `include/node/common.gypi:537-543` |
| V8 头文件低于 C++20 时直接报错；头文件引用 `<concepts>` 和 `<source_location>`，因此需要 GCC 11 及以上。 | 同一头文件包 `v8config.h:12-13`、`v8-internal.h:14`、`v8-source-location.h:9`；better-sqlite3 上游 CI 的注释是 “Electron 39+ requires GCC 11+ for `<source_location>` header (bookworm)”：[build.yml@v12.11.1 L30-L31](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/.github/workflows/build.yml#L30-L31) |
| better-sqlite3 自身也用 `-std=c++20` 编译，属于 V8 ABI 模块。已发布的二进制导出 `node_register_module_v146`，所以必须按 Electron 的 ABI 编译。 | [binding.gyp@v12.11.1 L12](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/binding.gyp#L12)；检查 rc.2 中的 `better_sqlite3.node` 字符串表 |
| node-pty 1.1.0 是 N-API 模块（依赖 node-addon-api，导出 `napi_register_module_v1`），与 Electron ABI 无关。安装时它会执行 `node scripts/prebuild.js \|\| node-gyp rebuild`；Linux 没有随包预编译件，因此会在 `npm ci` 时用宿主编译器从源码编译。它不在 electron-builder 的 rebuild 列表中。 | node-pty 1.1.0 的 `package.json` 中 `scripts.install` 和 `dependencies`；`electron-builder.yml` 中 node-pty 相关 extraResources 的注释；rc.2 CI 日志第 185-188 行，@electron/rebuild 只处理了 better-sqlite3 |
| manylinux_2_28 基于 AlmaLinux 8，工具链为 GCC 14，即 `/opt/rh/gcc-toolset-14` 并已放在 PATH 前部；gcc-toolset-15 仍是 TODO。 | [README.rst L207-L224](https://github.com/pypa/manylinux/blob/89b4e2b712e83be32ba37c20c37069702620c877/README.rst#L207-L224)；[build.sh L37-L41](https://github.com/pypa/manylinux/blob/89b4e2b712e83be32ba37c20c37069702620c877/build.sh#L37-L41)；[install-runtime-packages.sh L136-L141](https://github.com/pypa/manylinux/blob/89b4e2b712e83be32ba37c20c37069702620c877/docker/build_scripts/install-runtime-packages.sh#L136-L141)；[Dockerfile L5-L7,L24-L26](https://github.com/pypa/manylinux/blob/89b4e2b712e83be32ba37c20c37069702620c877/docker/Dockerfile#L5-L26) |
| 结论：GCC 14 满足 C++20 和 GCC 11+ 的要求。作为对照，当前发布件分别由 GCC 12.2（better-sqlite3 上游）和 GCC 15.2（pty.node）编译，两者都能正常加载。 | 本次 ELF 审计读取了 `.comment` 段，见第 3 节 |
| Node 22.23.1 和 Node 24 的官方 x64 二进制要求 glibc ≥ 2.28、kernel ≥ 4.18，可以在 AlmaLinux 8 容器中运行。 | [Node v22.23.1 BUILDING.md L108](https://github.com/nodejs/node/blob/v22.23.1/BUILDING.md#L108)；[Node v24.17.0 BUILDING.md L108](https://github.com/nodejs/node/blob/v24.17.0/BUILDING.md#L108) |
| @electron/rebuild 4.2.0 要求 Node ≥ 22.12.0，与 `.nvmrc` 中的 22.23.1 相符。 | 本地 `node_modules/@electron/rebuild/package.json` 中的 `engines` |
| node-gyp 12.2.0 需要“受支持的 Python”、`make` 和 GCC，探测下限为 Python ≥ 3.6，可以通过 `--python` 或 `npm_config_python` 指定。manylinux 的构建脚本只把 `pipx` 和 `manylinux-interpreters` 放进 `/usr/local/bin`，没有提供 `python3` 链接，解释器位于 `/opt/python/cp3xx-*`。因此 CI 必须显式设置 `npm_config_python=/opt/python/cp312-cp312/bin/python` 之类的路径。`make` 在 BASE_TOOLS 中。 | [node-gyp README@v12.2.0 L37-L39,L83-L86](https://github.com/nodejs/node-gyp/blob/v12.2.0/README.md#L37-L86)；[find-python.js L46](https://github.com/nodejs/node-gyp/blob/v12.2.0/lib/find-python.js#L46)；[finalize.sh L37-L69](https://github.com/pypa/manylinux/blob/89b4e2b712e83be32ba37c20c37069702620c877/docker/build_scripts/finalize.sh#L37-L69)；[install-runtime-packages.sh L74](https://github.com/pypa/manylinux/blob/89b4e2b712e83be32ba37c20c37069702620c877/docker/build_scripts/install-runtime-packages.sh#L74) |

## 2. gcc-toolset 的 nonshared 机制能否把依赖压在 GCC 8 的 libstdc++ 以内

| 结论 | 依据（本地检查的 RPM） |
| --- | --- |
| gcc-toolset-14 的 `libstdc++.so` 是一个链接脚本：`INPUT ( /usr/lib64/libstdc++.so.6 -lstdc++_nonshared AS_NEEDED (/usr/lib64/libstdc++.so.6) )`。基础系统 libstdc++ 已有的符号会动态链接，较新的符号则从静态归档补进模块。 | [AlmaLinux 8 `gcc-toolset-14-gcc-c++-14.2.1-11.el8_10`](https://repo.almalinux.org/almalinux/8/AppStream/x86_64/os/Packages/gcc-toolset-14-gcc-c%2B%2B-14.2.1-11.el8_10.x86_64.rpm)（sha256 `b611732d…e8bf`）中的 `/opt/rh/gcc-toolset-14/root/usr/lib/gcc/x86_64-redhat-linux/14/libstdc++.so` |
| `libstdc++_nonshared.a` 定义了 1143 个全局符号，其中包括 better-sqlite3 当前唯一引用的 `GLIBCXX_3.4.29` 符号 `_ZSt28__throw_bad_array_new_lengthv`。 | [`gcc-toolset-14-libstdc++-devel-14.2.1-11.el8_10`](https://repo.almalinux.org/almalinux/8/AppStream/x86_64/os/Packages/gcc-toolset-14-libstdc%2B%2B-devel-14.2.1-11.el8_10.x86_64.rpm)（sha256 `a5306cba…a0a1`），用自写的 ar/ELF 符号表解析脚本检查 |
| Anolis 8.10 的 `libstdc++.so.6.0.25` 最高提供 `GLIBCXX_3.4.25` 和 `CXXABI_1.3.11`。rc.2 两个模块需要的 `CXXABI_1.3.9`（`_ZdlPvm`）和 `CXXABI_1.3.8` 都在这个范围内。 | [Anolis `libstdc++-8.5.0-31.0.1.an8`](https://mirrors.openanolis.cn/anolis/8.10/BaseOS/x86_64/os/Packages/libstdc%2B%2B-8.5.0-31.0.1.an8.x86_64.rpm)（sha256 `03a59bc8…fbca`），读取 verdef |
| PyPA 对 manylinux_2_28 的符号白名单更保守：最高到 `GLIBCXX_3.4.24`，`CXXABI_1.3.11`，GLIBC 最高到 2.28。可以直接拿它作为发布闸门的阈值。 | [auditwheel manylinux-policy.json@7e7bcd6](https://github.com/pypa/auditwheel/blob/7e7bcd6aa8d63965eae7e85f3086aafe301c45e0/src/auditwheel/policy/manylinux-policy.json)（`name: manylinux_2_28` 条目） |
| 风险：node-gyp 用 `-shared` 链接 `.node`，没有 `-z defs`。如果某个新符号在基础库和 nonshared 中都找不到，链接不会失败，问题要到运行时加载才暴露。所以每次构建后都要做 ELF 版本审计，并在 glibc 2.28 环境中真正加载一次。容器内 `ensure-sqlite-native.mjs electron` 用 Electron 加载 `better_sqlite3.node`，正好可以承担这项加载测试。 | `scripts/ensure-sqlite-native.mjs:63-80,90-94,156-162`；这一点是对 GNU ld 默认行为的推断，未单独实验 |

Red Hat 官方文档中关于 GCC Toolset 兼容性的页面（docs.redhat.com）返回 HTTP 403，本次没有读到，所以本节只依据 RPM 实物。

## 3. v0.1.47-rc.2 发布包的完整 ELF 审计

方法：用 `gh release download` 下载 [v0.1.47-rc.2](https://github.com/KodaX-AI-dev/KodaX-Space/releases/tag/v0.1.47-rc.2) 的 AppImage 和 deb。AppImage 的 sha256 为 `2cb64b2f…a0d5`，deb 为 `7006853b…af12`，均与 Release API 的 digest 一致。用 7-Zip 解开 SquashFS 和 deb 的 `data.tar.xz`，再用自写的 Python ELF 解析器（`python -I`，不执行任何下载内容）遍历所有文件，读取 `.gnu.version_r`、`DT_NEEDED` 和 `.comment`。AppImage 前 188392 字节的运行时也一并审计。Feishu CLI 归档 `lark-cli.tar.gz`（sha256 `ef0e1979…81ef1`）解包后同样审计。AppImage 与 deb 中所有 ELF 的审计结果相同，两个原生模块的 sha256 也相同。

| 文件 | 最高 GLIBC | GLIBCXX / CXXABI | 编译器（`.comment`） |
| --- | --- | --- | --- |
| AppImage 运行时（type-2，FUSE2） | 2.3.3 | — | GCC 4.4.7 / 5.3.0 |
| `kodax-space`（sha256 `481d576d…6467`） | 2.25 | — | Chromium clang 23 / LLD |
| `chrome-sandbox` | 2.4 | — | 同上 |
| `chrome_crashpad_handler` | 2.17 | — | 同上 |
| `libEGL.so` / `libGLESv2.so` / `libffmpeg.so` / `libvk_swiftshader.so` / `libvulkan.so.1` | 2.16 / 2.17 / 2.17 / 2.17 / 2.16 | — | 同上 |
| `usr/lib/` 下 6 个随包库（libappindicator、libgconf、libindicator、libnotify、libXss、libXtst） | ≤ 2.7 | — | electron-builder FUSE2 工具集 |
| `@kodax-ai/kodax/.../linux-x64/kodax-text-transaction.node` | 2.14 | — | Red Hat GCC 10.2.1 / LLD 22 |
| `@napi-rs/keyring-linux-x64-gnu/keyring.linux-x64-gnu.node` | 2.15 | — | crosstool-NG GCC 4.8.5 / rustc 1.95 |
| `@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node`（rc.2 仍随包） | 2.16 | — | — |
| `clipboardy/fallbacks/linux/xsel` | 2.14 | — | Ubuntu GCC 5.4 |
| `esbuild`（两份）、ASRT `apply-seccomp`（x64/arm64）、`lark-cli`、keyring/canvas musl 版 | 静态链接，无版本需求 | — | — |
| **`better-sqlite3/build/Release/better_sqlite3.node`**（sha256 `addaad40…a23f`） | **2.34** | **GLIBCXX_3.4.29** / CXXABI_1.3.9 | **Debian 12.2.0-14+deb12u1** |
| **`node-pty/build/Release/pty.node`**（sha256 `93added4…467f`） | **2.42** | GLIBCXX_3.4.22 / CXXABI_1.3.9 | **Ubuntu 15.2.0-16ubuntu1** |

超过 2.28 的具体导入如下。
- `better_sqlite3.node`：`exp/log/log2/pow@GLIBC_2.29`、`stat64/fstat64/lstat64@GLIBC_2.33`、`dlopen/dlsym/dlclose/dlerror/pthread_create/pthread_join/pthread_once/pthread_mutex*@GLIBC_2.34`、`_ZSt28__throw_bad_array_new_lengthv@GLIBCXX_3.4.29`。
- `pty.node`：`pthread_sigmask@GLIBC_2.32`、`forkpty/openpty@GLIBC_2.34`、`cfsetispeed/cfsetospeed@GLIBC_2.42`。

结论：除这两个已知模块外，整包没有任何 ELF 超过 GLIBC_2.28，也没有 GLIBCXX 超过 3.4.25。就 ELF 层面而言，“只需处理两个模块”成立。

### 两个模块为什么超出 2.28

- **better-sqlite3 是上游预编译件，不是本仓库编译的。** 发布件与上游 Release 资产 [`better-sqlite3-v12.11.1-electron-v146-linux-x64.tar.gz`](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.11.1)（sha256 `e2021aee…3221`）中的 `build/Release/better_sqlite3.node` 逐字节相同，sha256 都是 `addaad40…a23f`。上游 Electron 39+ 的 Linux x64 预编译件在 `node:20-bookworm` 容器中构建：[build.yml@v12.11.1 L168-L172](https://github.com/WiseLibs/better-sqlite3/blob/v12.11.1/.github/workflows/build.yml#L168-L172)。rc.2 构建日志（run 45299294645，job 138154518202）显示：`executing @electron/rebuild electronVersion=42.5.0 arch=x64 buildFromSource=false`，better-sqlite3 从 preparing 到 finished 只用了 0.4 秒，后面又出现 `[native] better-sqlite3 already matches electron runtime.`。
- **pty.node 是在 CI 宿主上编译的。** rc.2 的 `ubuntu-latest` 实际是 `Image: ubuntu-26.04`（Version 20261116.202.1，见同一日志第 17-18 行），系统 GCC 15.2、glibc ≥ 2.42。glibc 2.34 把 libpthread、libdl、libutil 并入 libc，glibc 2.42 又让 termios 支持任意波特率，因此在新系统头文件下编译出的符号版本会随之升高。[glibc 2.34 NEWS L13-L17](https://sourceware.org/git/?p=glibc.git;a=blob_plain;f=NEWS;hb=refs/tags/glibc-2.34) · [glibc 2.42 NEWS L25-L27](https://sourceware.org/git/?p=glibc.git;a=blob_plain;f=NEWS;hb=refs/tags/glibc-2.42)

### 对“只在容器里用 @electron/rebuild 重编”的直接影响

- @electron/rebuild 4.2.0 在 `buildFromSource` 为假时，会先尝试 prebuildify、prebuild-install 和 node-pre-gyp 下载预编译件，都失败后才调用 node-gyp（本地 `node_modules/@electron/rebuild/lib/module-rebuilder.js:117-124`）。electron-builder 只在配置项 `buildDependenciesFromSource: true` 时才传入 `buildFromSource`（`node_modules/app-builder-lib/out/util/yarn.js:18`）。因此，**只换容器，better-sqlite3 仍会下载同一个 Debian 12 预编译件**，结果仍然需要 GLIBC_2.34。
- 按代码推演（未实跑），只换容器时流程会这样走，最终**构建失败而不是带病发布**。
  1. `npm ci` 的 postinstall（`install-app-deps`）下载预编译件，并写入 `build/Release/.forge-meta`（内容为 `x64--146`）。
  2. `ensure-sqlite-native.mjs electron` 在 glibc 2.28 容器里加载失败，于是回落到 `node-gyp rebuild`，用容器工具链从源码编译。`node-gyp rebuild` 会先执行 clean，删掉整个 `build/` 目录，`.forge-meta` 也随之消失。
  3. 打包阶段 electron-builder 再次调用 @electron/rebuild。由于找不到 `.forge-meta`，它不会跳过，而是重新下载 2.34 预编译件，覆盖源码编译结果。rc.2 日志第 873-874 行显示，这一步在 Ubuntu 上 1 毫秒就结束了，因为 meta 文件存在而直接跳过。
  4. `smoke-pack` 在容器里用打包后的 Electron 加载 SQLite，此时失败。

  依据：`node_modules/@electron/rebuild/lib/rebuild.js:131`、`module-rebuilder.js:25-37`、`node_modules/node-gyp/lib/clean.js:7-11`、`scripts/ensure-sqlite-native.mjs:90-94,153`、`scripts/smoke-pack.mjs:1241-1279`。
- 有一个只改 CI 的强制方式：prebuild-install 7.1.3 读取环境变量 `npm_config_build_from_source`，值等于包名或 `'true'` 时直接 `exit 1`，@electron/rebuild 随即回落到 node-gyp（本地 `node_modules/prebuild-install/rc.js:15,26`、`bin.js:51-53`）。所以要在 `npm ci` 和构建两步都设置 `npm_config_build_from_source=better-sqlite3`。`.github/workflows/release.yml:134` 目前显式设为 `'false'`，必须修改。设为 `'true'` 也可以，此时 node-pty 的 `scripts/prebuild.js` 会删除它自带的 prebuilds，但 Linux 本来就没有 prebuilds。
- 通过 electron-builder 命令行传 `--config.buildDependenciesFromSource` 行不通，因为 `scripts/pack.mjs:108-131` 用白名单过滤参数，`--config.*` 会被告警后忽略。
- `scripts/pack.mjs:154-158` 会运行 `ensure-sqlite-native.mjs electron`，`smoke-pack` 也会用已打包的 Electron（`ELECTRON_RUN_AS_NODE=1`）打开 `:memory:` 并执行查询（`scripts/smoke-pack.mjs:1241-1279`）。这两步都要真正启动 Electron 主 ELF；即使设置了 `ELECTRON_RUN_AS_NODE`，也要先解析全部 `DT_NEEDED`，包括 gtk3、nss、atk、cups-libs、alsa-lib、libgbm、libxkbcommon 等，清单见审计中 `kodax-space` 的 NEEDED。manylinux 镜像不包含这些图形库，所以容器里必须先用 `dnf install` 安装。
- electron-builder 在 Linux 上下载的打包工具在 glibc 2.28 上可用：`fpm-1.17.0-ruby-3.4.3-linux-amd64.7z`（sha256 `44b0ec60…989f`，与 `app-builder-lib/out/toolsets/linux.js:15` 的校验值一致）中的 ELF 最高需要 GLIBC_2.28；`appimage-12.0.1.7z`（sha256 `d12ff7eb…8ec4`）中的 `mksquashfs` 最高需要 2.3.4，`desktop-file-validate` 最高需要 2.7。因此整个 build job 放进容器，至少在 glibc 层面可行。

## 4. Electron 42 / Chromium 148 在 Anolis 8.10 上的运行时条件

| 结论 | 依据 |
| --- | --- |
| Electron 官方只说明 Linux 预编译件构建于 Ubuntu 22.04，并验证过 Ubuntu 18.04+、Fedora 32+、Debian 10+。RHEL 8、Anolis 8 都不在列表中。Debian 10 同样是 glibc 2.28。 | [electron README@v42.5.0 L42-L45](https://github.com/electron/electron/blob/v42.5.0/README.md#L42-L45) |
| 前一份调研已在 QEMU 中实测：Anolis 8.10 x86_64、RHCK 4.18、官方 gtk3 3.24.31、nss 3.112.0、mesa-libgbm 23.1.4、Xvfb，同一个 `kodax-space` 主 ELF（sha256 `481d576d…`）能在 X11 上创建窗口并正确渲染；主 ELF 的 1461 个非弱导入都能解析。该测试没有覆盖显卡硬件加速、原生 Wayland，也没有覆盖 Space 业务代码。 | [前一份调研 L99-L124](kodax-space-anolis-8-compatibility.md)（本次引用其测试记录，未重跑） |
| `libX11-xcb.so.1` 不在主 ELF 的 `DT_NEEDED` 中。Chromium 在初始化 Xlib 时以 `CHECK` 方式动态加载它，缺失时进程直接中止，所以 `ldd -r` 检查不出来。 | [Chromium 148.0.7778.271 `ui/gfx/x/xlib_support.cc` L42-L45](https://chromium.googlesource.com/chromium/src/+/refs/tags/148.0.7778.271/ui/gfx/x/xlib_support.cc#42)；本次审计中 `kodax-space` 的 NEEDED 列表 |
| AppImage 的 `usr/lib` 只带了 6 个库（见第 3 节），不包含 libX11-xcb。electron-builder 26.15.3 为 deb 生成的默认 `Depends` 是 `libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0`，与 rc.2 的 deb `control` 一致。rpm 目标的默认依赖为 `gtk3, libnotify, nss, libXScrnSaver, libXtst, xdg-utils, at-spi2-core, libuuid`。三种产物都没有声明 libX11-xcb。 | `node_modules/app-builder-lib/out/targets/FpmTarget.js:312-327`；rc.2 deb 的 `control.tar.xz/control` |
| Anolis 8.10 官方源提供：libX11-xcb 1.8.12、fuse-libs 2.9.7、libsecret 0.20.4、libxkbcommon 1.0.3、libdrm 2.4.123、at-spi2-core 2.40.3、libXScrnSaver 1.2.3、libXtst 1.2.3、xdg-utils 1.1.3、glib2 2.68.4、bubblewrap 0.4.0、socat 1.7.4.1；gtk3、nss、mesa-libgbm 的版本同上表。BaseOS、AppStream、PowerTools、Plus 中都没有 dpkg。 | [BaseOS 包目录](https://mirrors.openanolis.cn/anolis/8.10/BaseOS/x86_64/os/Packages/) · [AppStream 包目录](https://mirrors.openanolis.cn/anolis/8.10/AppStream/x86_64/os/Packages/) · [PowerTools](https://mirrors.openanolis.cn/anolis/8.10/PowerTools/x86_64/os/Packages/) · [Plus](https://mirrors.openanolis.cn/anolis/8.10/Plus/x86_64/os/Packages/)（2026-11-27 列表） |
| **.deb 与 Anolis 无关**：Anolis 使用 RPM/dnf，官方源没有 dpkg。说法中的“AppImage + deb”在 Anolis 上只剩 AppImage。 | 同上 |
| AppImage 运行时是 FUSE2 类型，会加载 `libfuse.so.2`。挂载失败时提示 “Cannot mount AppImage, please check your FUSE setup”，并支持 `--appimage-extract-and-run` 或 `APPIMAGE_EXTRACT_AND_RUN`。仓库配置特意选用了 FUSE2 工具集。 | 本次检查 AppImage 前 188392 字节运行时的字符串；`electron-builder.yml` 中 `appImage` 段的注释；`app-builder-lib/out/toolsets/linux.js:117-120` |
| Chromium 沙箱：AppRun 用 `unshare -Ur true` 探测非特权用户命名空间，失败就自动加 `--no-sandbox` 启动。缺少用户命名空间时程序仍能运行，但会失去 Chromium 进程沙箱，这属于安全能力的损失。 | rc.2 AppImage 中 `AppRun` 第 46-57 行 |
| GTK 4 不构成风险。Electron 36 起在 GNOME 下默认优先使用 GTK 4，但 Chromium 会先检查 `libgtk-3.so.0` 是否已经加载，已加载就固定使用 GTK 3。`kodax-space` 直接链接了 `libgtk-3.so.0`，所以即使 Anolis 装了 gtk4 4.4.1 也不会切换。 | [electron breaking-changes@v42.5.0 L314-L327](https://github.com/electron/electron/blob/v42.5.0/docs/breaking-changes.md#L314-L327)；[Chromium `ui/gtk/gtk_compat.cc` L134-L143](https://chromium.googlesource.com/chromium/src/+/refs/tags/148.0.7778.271/ui/gtk/gtk_compat.cc#134)；审计中的 NEEDED 列表 |
| Wayland：Electron 38 起，`XDG_SESSION_TYPE=wayland` 时默认以原生 Wayland 方式运行，可以用 `--ozone-platform=x11` 退回 XWayland。Anolis 8 GNOME 的原生 Wayland 路径没有实测。 | [electron breaking-changes@v42.5.0 L164-L171](https://github.com/electron/electron/blob/v42.5.0/docs/breaking-changes.md#L164-L171) |

## 5. 两个模块在 glibc 2.28 上重编后，功能是否等价

| 结论 | 依据 |
| --- | --- |
| node-pty 1.1.0 的 Linux 路径只用到 `forkpty`（链接 `-lutil`）、`openpty`、`pthread_sigmask`、`execvp`，以及 `cfsetispeed/cfsetospeed(term, B38400)`。代码只按 `__linux__`/`__APPLE__` 分支，没有 `__GLIBC_PREREQ`、`close_range`、`closefrom`，也没有任意波特率 API。posix_spawn 路径仅用于 macOS。 | [pty.cc@v1.1.0 L348-L349](https://github.com/microsoft/node-pty/blob/v1.1.0/src/unix/pty.cc#L348-L349)、[L392-L412](https://github.com/microsoft/node-pty/blob/v1.1.0/src/unix/pty.cc#L392-L412)、[L481](https://github.com/microsoft/node-pty/blob/v1.1.0/src/unix/pty.cc#L481)、[L686-L688](https://github.com/microsoft/node-pty/blob/v1.1.0/src/unix/pty.cc#L686-L688)；[binding.gyp@v1.1.0 L80-L82](https://github.com/microsoft/node-pty/blob/v1.1.0/binding.gyp#L80-L82)。本地 npm 包中 `pty.cc` 的 sha256 与 tag v1.1.0 的源码一致 |
| 因此在 2.28 上编译只会改变符号版本，例如 `cfsetospeed@GLIBC_2.2.5` 替代 `@GLIBC_2.42`，`forkpty@GLIBC_2.2.5` 替代 `@GLIBC_2.34`，固定 38400 波特率的语义不变。 | glibc 2.42 NEWS L25-L27（见上）；这一点属于推断，未在 2.28 上实测 |
| better-sqlite3 12.11.1 内置 SQLite 3.53.2，编译选项由 `deps/defines.gypi` 固定，不做 autoconf 探测。sqlite3.c 中唯一的 `__GLIBC__` 分支位于 `SQLITE_MEMDEBUG` 内，发布配置没有开启该选项。`better_sqlite3.cpp` 中没有 glibc 条件分支。Release 配置使用 `-O3`，Linux 还加了 `-Wl,-Bsymbolic -Wl,--exclude-libs,ALL`，与宿主 glibc 无关。 | npm `better-sqlite3-12.11.1.tgz`（shasum `067846ef…0b84`，与 registry 一致）中的 `deps/defines.gypi`、`deps/sqlite3/sqlite3.c:28206-28217`、`deps/common.gypi:56`、`binding.gyp:12,26-27` |
| 结论：重编不会让这两个模块缺少任何功能。区别只在编译器版本：better-sqlite3 从 GCC 12.2 换成 GCC 14，pty.node 从 GCC 15.2 换成 GCC 14。另外 nonshared 会把少量 libstdc++ 代码静态链接进模块。 | 第 2、3 节 |

## 6. 其他会让说法不成立的因素

- KodaX 文本写入：KodaX 0.7.96 在 RHCK 4.18 上会拒绝写入，0.7.97-rc.2 已修复。Space v0.1.47-rc.2 依赖 0.7.97-rc.2，所以只要基于 rc.2 及以后版本发布，就不受影响；基于 v0.1.46 则会受影响。[前一份调研 L55-L60](kodax-space-anolis-8-compatibility.md)
- ASRT shell 沙箱依赖主机上的 bubblewrap、socat、ripgrep，以及非特权用户命名空间策略。Anolis 8.10 源中有 bubblewrap 0.4.0 和 socat 1.7.4.1；BaseOS、AppStream、PowerTools、Plus 中都没有找到 ripgrep。这些依赖与 CI 无关。[前一份调研 L62](kodax-space-anolis-8-compatibility.md)
- 当前 CI 的验收只在 `ubuntu-latest`（26.04）上运行已打包的应用（`.github/workflows/release.yml:224-225`），没有任何步骤在 glibc 2.28 环境中加载产物。改完构建后，如果不加闸门，回归不会被发现。

## 除 CI 之外还必须改或决定的事项

1. **交付形态**：Anolis 只能使用 AppImage。需要决定是否增加 electron-builder `rpm` 目标（改 `electron-builder.yml` 的 `linux.target`，并在 `rpm.depends` 中补上 `libX11-xcb`、`libsecret`、`fuse-libs` 等），还是在文档中写明 Anolis 只支持 AppImage。
2. **目标机前置条件写进用户文档或 `docs/KNOWN_ISSUES.md`**：`dnf install libX11-xcb fuse-libs`（没有 FUSE 时改用 `--appimage-extract-and-run`）；检查 `unshare -Ur true` 或 `sysctl user.max_user_namespaces`，不通过时 Chromium 沙箱会被关闭；在 Wayland 会话出问题时加 `--ozone-platform=x11`。
3. **发布闸门脚本**：在仓库 `scripts/` 下新增 ELF 版本审计，这是仓库代码，不是 workflow。阈值可以取 GLIBC ≤ 2.28、GLIBCXX ≤ 3.4.24（auditwheel）或 ≤ 3.4.25（Anolis 实际值）、CXXABI ≤ 1.3.11。审计范围应覆盖整个 `linux-unpacked`，以防今后新增的第三方 Linux 预编译件（例如 keyring、canvas）越界。
4. **如果 Wayland 实测失败**，需要在桌面文件、AppRun 或主进程中加入 ozone 平台切换，这属于代码或打包配置变更。

只改 CI 的部分（作为说法成立的前提，也一并列出）：job 使用 `container: quay.io/pypa/manylinux_2_28_x86_64`；设置 `npm_config_python`；在容器内 `dnf install` Electron 主 ELF 需要的图形库；`npm ci` 与构建步骤都设置 `npm_config_build_from_source=better-sqlite3`，并替换 `release.yml:134` 中的 `'false'`；调用上面的 ELF 闸门；验收 job 可以保留在 ubuntu 上，另外加一个 Alma 或 Rocky 8 容器，至少测试 `pty.node` 的加载。

## 未证实

- Red Hat 官方对 GCC Toolset 14 “构建产物可在基础 RHEL 8 运行”的文字承诺：docs.redhat.com 返回 403，本文只依据 RPM 中的链接脚本和 nonshared 符号。
- 在 manylinux_2_28 中实际重编后，两个模块的最高符号版本：没有做真实构建。第 2 节只证明了已知的 `GLIBCXX_3.4.29` 符号能被 nonshared 覆盖，GCC 14 是否会引入其他新符号要靠闸门确认。
- “性能无损”：没有基准数据。目前找不到会导致退化的机制，因为编译选项相同，只是编译器版本不同。
- GitHub Actions 的 JavaScript action（例如 checkout、setup-node 依赖的 runner 自带 node）能在 AlmaLinux 8 容器中运行：只是根据 Node 官方的 glibc ≥ 2.28 要求推断，没有引用 GitHub 的文档。
- AlmaLinux 8 容器内需要 `dnf install` 的精确包名清单，只根据主 ELF 的 NEEDED 列表推断，未实跑。
- Anolis 8.10 图形桌面默认是否已安装 `libX11-xcb`、`fuse-libs`，以及 RHCK 和 ANCK 的 `user.max_user_namespaces` 默认值。
- ripgrep 是否可以从 Anolis 的其他官方仓库（例如 EPEL 兼容源）获得。

## 未解问题

1. 目标机内核：请提供 `uname -r`，用来判断是 RHCK 4.18 还是 ANCK 5.10，并确认 KodaX 文本写入路径与用户命名空间的可用性；同时提供 `unshare -Ur true; echo $?` 和 `sysctl user.max_user_namespaces` 的结果。
2. 目标机会话类型与依赖：`echo $XDG_SESSION_TYPE`，以及 `rpm -q gtk3 nss mesa-libgbm libX11-xcb fuse-libs libsecret`。
3. 需要真实运行一次：在 manylinux_2_28 中构建，然后在 Anolis 8.10 实机或虚拟机上验收主窗口、Artifact 目录（SQLite）、内置终端（PTY）、keyring 和 ASRT。硬件 GPU 加速和原生 Wayland 必须在实机上验证。
4. 需要人来决定：是否增加 rpm 目标、是否放弃在 Anolis 上提供 deb、是否把 Anolis 8 列为正式支持平台（Electron 官方不在验证列表中）、以及 GLIBCXX 闸门取 3.4.24 还是 3.4.25。
