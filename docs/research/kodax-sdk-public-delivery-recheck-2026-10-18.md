# KodaX SDK 与独立 Artifact SDK 当前实际公开交付了什么？

TL;DR：截至 **2026-10-18 17:27–17:31 Asia/Shanghai（UTC+08:00）**，官方 npm `alpha` 仍为 `@kodax-ai/kodax@0.7.97-alpha.7`，`latest` 仍为 `0.7.96`。Space 根、Desktop 和 installed 均为 alpha.7，安装内容通过官方 tarball 对照。独立 `@kodax-ai/artifacts` 源码存在，但确切 Registry 名称仍返回 404；主包 exports、依赖、tarball 和 installed 均未提供其 API。未发现改名、改主包子路径或内嵌交付的证据。**此研究子任务仅写入本笔记**；主线 Registry/完整性结果另存为同名 JSON 证据。本轮未修改生产代码、依赖或锁文件。[Registry](https://registry.npmjs.org/@kodax-ai%2fkodax)、[独立包 endpoint](https://registry.npmjs.org/@kodax-ai%2fartifacts)、[alpha.7 tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz)、[本轮发布门禁结果](kodax-sdk-public-delivery-recheck-2026-10-18.json)

## 证据口径

- **发布事实以 Registry metadata、实际 tarball 和 installed 为准**；源码存在、workspace build 或本地 `npm pack` 测试只能证明实现/本地打包路径存在。[主包 tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz)、[本地 pack 测试源码](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/tests/packed-artifacts.test.mjs#L12-L30)
- 相邻 SDK HEAD 为 `b0b446ec84fd20f21529025d086813eb5bcb2bd0`，本地 `v0.7.97-alpha.7` tag 为 `25fa6399ada6dae0493faa221eb82174eebb9ad6`；只读命令 `git diff --name-only v0.7.97-alpha.7..b0b446ec -- src packages scripts package.json package-lock.json` 无输出。没有可据此认定为新版执行代码的变化。[tag commit](https://github.com/icetomoyo/KodaX/commit/25fa6399ada6dae0493faa221eb82174eebb9ad6)、[HEAD](https://github.com/icetomoyo/KodaX/commit/b0b446ec84fd20f21529025d086813eb5bcb2bd0)
- alpha.7 npm metadata 无 `gitHead`，因此不把本地 tag 与 npm 构建之间未提供的完整溯源关系当作已验证；包内容用 tarball 哈希识别。[固定版本 metadata](https://registry.npmjs.org/@kodax-ai%2fkodax/0.7.97-alpha.7)
- 本轮仅做只读查询、内存中 tarball 解压和模块路径解析；没有安装、构建、启动 Host/模型、渲染或发布。

## 当前版本与安装完整性

| 项目 | 本轮观察 | Primary source |
| --- | --- | --- |
| Registry，17:27:03 +08:00 | `alpha=0.7.97-alpha.7`、`latest=0.7.96`；alpha.7 发布于 2026-10-18 08:15:48.759 +08:00 | [npm metadata](https://registry.npmjs.org/@kodax-ai%2fkodax) |
| Space 声明和 installed | 根 `package.json:59`、Desktop `package.json:16` 均固定 alpha.7；installed manifest 第 3 行也是 alpha.7 | [根声明](C:/Works/GitProj/KodaX-AI/KodaX-Space/package.json:59)、[Desktop 声明](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/package.json:16)、[installed](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/package.json:3) |
| tarball，17:27:31 +08:00 | 11,322,997 bytes、1,006 个文件；SHA-1 `81fcb14af3d7fbc945360b336298ee04d7b44613` 与 Registry 一致 | [官方 tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz)、[dist metadata](https://registry.npmjs.org/@kodax-ai%2fkodax/0.7.97-alpha.7) |
| 独立对照 installed | tarball 全部 JS/DTS/JSON 共 **454 个文件**与 installed 逐一比较 SHA-256，无缺失、无差异 | [同一官方 tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz)、[installed 目录](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/package.json:3) |
| 主线发布门禁，本次结果于17:31读取 | `assertKodaxReleaseDependencyState` 重新验证 Registry tarball/SRI/installed/native，返回 `version=0.7.97-alpha.7`、`source=registry`、官方 alpha.7 resolved URL；不是仅比较 manifest | [门禁函数:230](C:/Works/GitProj/KodaX-AI/KodaX-Space/scripts/kodax-runtime-release-gate.mjs:230)、[本次结果](kodax-sdk-public-delivery-recheck-2026-10-18.json) |
| GitHub Release，17:28:08 +08:00 | alpha.7 prerelease 发布于 2026-10-18 01:00:23 +08:00；13 个资产为主包 tgz/校验、5 平台二进制/校验、SHA256SUMS，无独立 Artifact 包资产 | [官方 Release](https://github.com/icetomoyo/KodaX/releases/tag/v0.7.97-alpha.7)、[官方 Release API](https://api.github.com/repos/icetomoyo/KodaX/releases/tags/v0.7.97-alpha.7) |

发布门禁结果中的 SHA-512 为 `sha512-whrhfZDI7k6YH5FGwEuscyV2tE8XuFjM/LAkVV2tO9mizHqrAT7IidrqnZC21e5zsVUVtZBsvAj3rYBjdkQO7Q==`，与官方 alpha.7 metadata 一致。主线 17:26:43–44 +08:00 的无缓存 Registry 响应与本轮观察一致。[门禁结果](kodax-sdk-public-delivery-recheck-2026-10-18.json)、[官方 metadata](https://registry.npmjs.org/@kodax-ai%2fkodax/0.7.97-alpha.7)、[主线无缓存快照](kodax-sdk-public-delivery-recheck-2026-10-18.json)

## Artifact 是否改名、改子路径或进入主包

| 假设 | 观察及结论边界 | Primary source |
| --- | --- | --- |
| 独立包改名 | 当前源码名称仍是 `@kodax-ai/artifacts@0.7.97-alpha.7`；17:27:03 对确切名称重新请求仍 HTTP 404，正文 `{"error":"Not found"}` | [源码 manifest:2–24](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/artifacts/package.json#L2-L24)、[Registry endpoint](https://registry.npmjs.org/@kodax-ai%2fartifacts) |
| 其他官方名称 | npm `text=kodax` 搜索 total=3，仅 `@kodax-ai/kodax`、旧 `@kodax-ai/kodax-cli`、`@kodax-ai/omdsh`，无另一个 Artifact 包。不能排除完全不同名称、未被此查询命中的包 | [官方 Registry 搜索](https://registry.npmjs.org/-/v1/search?text=kodax&size=250) |
| 主包子路径 | 完整 exports 没有 `./artifact`、`./artifacts` 或通配符；`import.meta.resolve('@kodax-ai/kodax/artifacts')` 得到 `ERR_PACKAGE_PATH_NOT_EXPORTED` | [官方 alpha.7 metadata](https://registry.npmjs.org/@kodax-ai%2fkodax/0.7.97-alpha.7)、[installed exports:29](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/package.json:29) |
| 主包自动带入依赖 | 主包 dependencies 无 `@kodax-ai/artifacts`，也无独立包所需 `pptxgenjs/docx-renderer/pdfjs-dist/playwright-core/pngjs/jszip`；bundleDependencies 仅 sandbox runtime。独立源码包反向列主包为 optional peer | [tarball package.json](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz)、[独立 manifest:38–55](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/artifacts/package.json#L38-L55) |
| 直接内嵌文件/API | tarball 无 `package/packages/` 文件、文件名无 `artifact`；全部 JS/DTS/JSON 均无 `createArtifactSdk/validateVisualEvidence/decodeArtifactRequest`。installed `dist` 进一步检查 `createNodeArtifactPort/createKodaXArtifactPort/registerArtifactTools/artifact_render/artifact_read_evidence` 也无命中 | [官方 tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz)、[installed](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/package.json:3) |
| workspace build 即发布 | 主包 build 会构建 Artifact workspace，但 files 白名单不含 `packages/artifacts`，JS/DTS SDK 入口列表不含独立 Artifact 入口；本轮实物 tarball 符合此边界 | [build:94](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/package.json#L94)、[files:217–243](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/package.json#L217-L243)、[JS 入口:466](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/scripts/build-bundle.mjs#L466)、[DTS 入口:85–100](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/scripts/build-dts.mjs#L85-L100) |

installed 无 `node_modules/@kodax-ai/artifacts/package.json`；无副作用解析独立根包得到 `ERR_MODULE_NOT_FOUND`。`@kodax-ai/kodax/client` 则正确解析到 installed `dist/sdk-client.js`。因此独立 Artifact 不可用的判断同时检查了发布包名、入口、依赖和内容，不只依赖旧 404。[installed manifest](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/package.json:29)、[官方 tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz)

## 现有 Artifact/预览基础能力与独立 API 的区别

| 能力 | 当前实际边界 | Primary source |
| --- | --- | --- |
| 主包媒体输入 | `/media` 已提供 `createImageArtifactFromPath/createFileArtifactFromPath/createVideoArtifactFromPath` 等结构化附件辅助 API | [installed sdk-media.d.ts:68–72](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-media.d.ts:68) |
| Runtime 文件引用 | `/runtime` 的 `artifacts.create/get/delete` 管理 `image/file/video` 路径和元信息；没有 `open/render/capture/readEvidence` 签名 | [installed sdk-runtime.d.ts:1770–1796](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts:1770) |
| 内建图片读取 | `read` 可把 PNG/JPG/JPEG/GIF/WebP 作为 image 块交付；PDF 分支要求另行启用 `read_pdf` 扩展。这不提供文档页面渲染器 | [内建定义:209–217](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/coding/src/tools/tool-definitions.ts#L209-L217)、[实现:334–370](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/coding/src/tools/read.ts#L334-L370) |
| Product Client 附件/预览图片承载 | 已有 `sessions.readItem` 与 `ClientImageAttachmentContent`；可以读取 Host 已有附件，不能据此推导独立 Artifact 渲染服务 | [Client 契约:145](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/coding/src/client-contract.ts#L145)、[图片类型:584–610](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/coding/src/client-contract.ts#L584-L610)、[installed 类型导出](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-client.d.ts:1) |
| 独立 Artifact SDK/工具 | 源码有根 API `createArtifactSdk`、`/client` 的 `createKodaXArtifactPort`、`/runtime` 的 `createNodeArtifactPort`、`/kodax` 的 `registerArtifactTools`；工具是**显式注册**的 `artifact_create/open/edit/export/render/capture/capabilities/prepare/read_evidence`。当前公开主包未交付这些独立入口/函数 | [独立 manifest](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/artifacts/package.json#L9-L25)、[注册源码:16–44](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/artifacts/src/kodax.ts#L16-L44)、[官方主包 tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz) |

源码文档写 “shipped in v0.7.97-alpha.5”，但同页说明 optional package 和显式 Host 注册；本地测试先 `npm pack <本地 packages/artifacts>`，或从 `packages/artifacts/dist` 导入并手动注册 extension。它们能证明代码进入源码版本及本地测试路径，**不能替代独立 npm 包公开可安装的证据**。交付判断优先采用 Registry/tarball。[源码文档:3–8](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#L3-L8)、[Host 要求:68–100](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#L68-L100)、[本地 pack 测试](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/tests/packed-artifacts.test.mjs#L12-L30)、[手动注册测试](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/tests/bundled-artifacts.test.mjs#L12-L48)

独立源码的文档/PPT 渲染和证据准备也不等于视觉质量通过；DOCX 的 Word/WPS 保真度及自然任务完整修复/重评审仍有明确验证边界。Space 既有预览 UI、其他扩展产生的像素或用户 Host 中的工具，不构成该独立包已公开发布的证明；本轮没有对这些 UI/Host 行为重新验收。[一方能力与限制](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#L14-L28)、[一方集成限制](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#L104-L141)

## 未证实

- **更新的公开 SDK 版本**：本轮 Registry 仍为 alpha.7/latest0.7.96，未得到更晚版本的可核对发布物；本地文档 HEAD 不代表新发布。[Registry](https://registry.npmjs.org/@kodax-ai%2fkodax)、[源码 HEAD](https://github.com/icetomoyo/KodaX/commit/b0b446ec84fd20f21529025d086813eb5bcb2bd0)
- **其他 Registry、私有渠道、完全不同名称或所有历史版本的独立 Artifact 发布情况**：本轮查询不足以排除，当前 404 不应推广为“历史上从未发布”。[本轮确切 endpoint](https://registry.npmjs.org/@kodax-ai%2fartifacts)、[当前源码包名](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/artifacts/package.json#L2)
- **任意实际用户 Host 默认有 Artifact 工具、自然任务渲染/修复闭环或 Space UI 当前行为**：本轮未运行相应验收，源码要求显式 Host 注册并保留验收限制。[一方 Host/验收说明](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#L68-L137)

## 未解问题

维护者计划独立发布 `@kodax-ai/artifacts`，还是改变主包交付方式，现有 primary sources 不能回答。若之后要求 Space 接入该独立 API，应先提供确切公开版本/Registry tarball 和显式 Host 运行时准备方式；当前证据不足以据源码 workspace 存在就做新依赖适配。[当前独立 manifest](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/packages/artifacts/package.json)、[当前 Registry](https://registry.npmjs.org/@kodax-ai%2fartifacts)、[源码 Host 注册要求](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#L68-L100)
