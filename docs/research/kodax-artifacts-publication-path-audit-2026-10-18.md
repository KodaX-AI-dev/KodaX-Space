# 为什么 @kodax-ai/artifacts 返回 404，已有 Artifact SDK 在发布链的哪里断开？

TL;DR：源码中的独立 Artifact SDK、四个入口、本地打包/安装测试确实存在；但当前正式 Release/npm 脚本只组装和发布根包 `@kodax-ai/kodax`，没有为 `@kodax-ai/artifacts` 生成并发布对应的正式包。根包也没有 Artifact SDK 依赖或替代 subpath。2026-10-18 显式查询官方 npm registry 得到 E404。可以确认的是现有分发路径未覆盖这个独立包；不能据此断言维护者忘记发布、权限失败或从未发布/曾经撤包。[来源：下文正式发布脚本、实际 root tgz、官方 registry 查询]

## 核验边界

- 日期：2026-10-18，Asia/Shanghai；源码固定为 KodaX alpha.7 tag `25fa6399ada6dae0493faa221eb82174eebb9ad6`，当前 HEAD `b0b446ec84fd20f21529025d086813eb5bcb2bd0` 只修改文档，没有修改下文 package/build/release 代码。[来源：`git diff v0.7.97-alpha.7 HEAD`；[HEAD commit](https://github.com/icetomoyo/KodaX/commit/b0b446ec84fd20f21529025d086813eb5bcb2bd0)]
- 只读源码、npm 元数据及 tarball，另执行 `npm pack ./packages/artifacts --ignore-scripts --dry-run --json` 查看已有本地 dist 的候选文件；未运行 publish、未安装/升级 Space 依赖、未改上游源码、发布脚本或 tracker。[来源：本轮执行记录]
- 官方 npm 命令文档也核对了 workspace 语义：未选择 workspace 的 publish 类命令作用于根项目，workspace 是显式命令配置。下面以脚本实际 argv 和真实 tarball 交叉确认，而不是只推断 `workspaces` 字段。[来源：[npm-publish workspaces](https://docs.npmjs.com/cli/v10/commands/npm-publish/#workspaces)、[npm-pack](https://docs.npmjs.com/cli/v10/commands/npm-pack/)]

## 1. 独立包已实现和可本地打包：这部分没有凭空缺失

`packages/artifacts/package.json` 名字是 `@kodax-ai/artifacts`，版本 `0.7.97-alpha.7`，Node `>=20.16`。它定义了四个正式入口：根入口、`/client`、`/kodax`、`/runtime`；files 为 `dist`、`skills`、`LICENSE`。KodaX 是 optional peer，说明该包按现有设计可独立安装，而不是根包的强制组成部分。[来源：[packages/artifacts/package.json:1](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/packages/artifacts/package.json#L1)、[exports:9](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/packages/artifacts/package.json#L9)、[peerDependencies:48](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/packages/artifacts/package.json#L48)]

正式文档明确它是 optional、独立安装的 ESM 包；根入口有纯类型/validation/SDK dispatch；`/runtime` 拥有 Node 文件和浏览器工作；`/kodax` 向既有 Host 注册工具；`/client` 绑定既有 Product Client。因此 Space 要接入已有 SDK，不需要新造 Product Client 域、Host RPC 或常驻 renderer。[来源：[docs/ARTIFACT_SDK.md:3](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#L3)、[existing shared Host:68](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#L68)、[accepted boundary](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ADR.md#unified-artifact-execution-and-evidence-boundary)]

build 链也包含它：`tsconfig.build.json` references 指向 `packages/artifacts`，root `build:packages` 显式运行其 `build:browser`；因此 root build 成功可以产生 Artifact 的 workspace dist，但 build 不等于 registry publish。[来源：[tsconfig.build.json:7](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/tsconfig.build.json#L7)、[package.json:94](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/package.json#L94)]

已有 `tests/packed-artifacts.test.mjs` 从源码路径 `packages/artifacts` 执行本地 `npm pack`，把生成的 tgz 安装进干净临时消费者，测试没有 KodaX 的独立运行、PNG render/readEvidence、capabilities 和无 Node ambient declarations 的根类型。这解释了“以前补齐并通过 packed 验收”为何可以与今天 npm 404 同时成立：它验证的是**本地 tgz 消费**。[来源：[tests/packed-artifacts.test.mjs:12](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/tests/packed-artifacts.test.mjs#L12)]

本轮 dry-run 使用当前已有本地 dist 得到候选包 `kodax-ai-artifacts-0.7.97-alpha.7.tgz`，71 entries、282,966 packed bytes、1,005,838 unpacked bytes，含 `dist/index.js/.d.ts`、`client.js/.d.ts`、`kodax.js`、`runtime.js`、`docx.browser.js`、package.json 和 LICENSE；没有发布任何包。这个结果证明当前工作树可列出独立候选内容，不能代替正式 CI 构建、安装验收或发布。[来源：本轮 `npm pack ./packages/artifacts --ignore-scripts --dry-run --json`]

## 2. 确定的正式发布链：只覆盖 root tgz

| 环节             | 实际代码                                                                                                                                            | 结论                                                                                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| release 设计     | `scripts/release.mjs:2-9` 明确 single-bundle root release，旧 multi-package `release-npm.mjs` 已删除。                                              | 这套流程本来围绕 `@kodax-ai/kodax` 设计。[source](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/release.mjs#L2)                                                                                                                                                            |
| build            | `.github/workflows/release.yml:357-361` 构建 packages、root bundle、root dts。                                                                      | workspace 被编译，不自动成为独立发布物。[source](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/.github/workflows/release.yml#L357)                                                                                                                                                 |
| pack             | workflow `:363-364` 只调用 `release.mjs --skip-build --pack-only`。                                                                                 | 只进入 root pack 分支。[source](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/.github/workflows/release.yml#L363)                                                                                                                                                                  |
| pack 的目标      | `release.mjs:466-468` 文件名固定 `kodax-ai-kodax-${version}.tgz`；`:490-495` 仅修改 root private，然后执行 `npm pack`；`runCmd` cwd 固定 repoRoot。 | 没有 pack `packages/artifacts`，没有 `--workspace` / `--workspaces`。[source:cwd](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/release.mjs#L91)、[source:pack](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/release.mjs#L466) |
| CI asset         | workflow `:369-379` hash/upload `kodax-ai-kodax-*.tgz` 与其 checksum。                                                                              | 没有独立 `kodax-ai-artifacts-*.tgz` 的生成和上传步骤。[source](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/.github/workflows/release.yml#L369)                                                                                                                                   |
| GitHub Release   | workflow `:383-459` 聚合上述 assets 并使用 action 创建 GitHub Release。                                                                             | 这是 GitHub Release，不执行 npm registry publish。[source](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/.github/workflows/release.yml#L383)                                                                                                                                       |
| 人工 npm publish | `release.mjs:523-558` 下载并校验 CI root tgz，再执行 `npm publish <root tarball> --registry=https://registry.npmjs.org/`。                          | 只发布 tarball 中的 root 名字；不会递归发布 workspaces。[source](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/release.mjs#L523)、[npm semantics](https://docs.npmjs.com/cli/v10/commands/npm-publish/#workspaces)                                                         |
| lockstep guard   | `release.mjs:311-326` 检查所有 workspace lock entry 的版本与 root 一致。                                                                            | 版本同步 guard 不会 pack/publish workspace。[source](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/release.mjs#L311)                                                                                                                                                       |

所以，对“独立包是否被现有 release 流程遗漏”的技术答案是：**当前受检查的正式流程没有覆盖这个独立包的分发动作**。机制证据充分；“维护者是否忘记、是否本来安排另一路人工发布”不由源码证明。[来源：上述完整 pack/publish 路径；本轮对 `.github/workflows`、`scripts` 全部 npm pack/publish 引用检索]

`scripts/patch-publish-fields.mjs` 只是 workspace manifest 修改器：补 files/publishConfig、规范内部 dependency spec，未执行 pack/publish，而且注释仍指向已删除的 `release-npm.mjs`。它存在不构成独立包已进入当前发布链的证据。`scripts/prepare-publish.mjs` 在本次工作树不存在。[来源：[patch-publish-fields.mjs:26](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/patch-publish-fields.mjs#L26)、[:42](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/patch-publish-fields.mjs#L42)、[:57](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/patch-publish-fields.mjs#L57)；本轮文件清单]

独立 manifest 目前没有显式 `publishConfig` 或 `private` 字段。可以将显式 public registry/access 与正式发布验收列为发布配置检查项，但**不能据此认定 404 是 access 默认值或权限失败导致**；没有运行过这个包的 publish，也没有维护者发布日志。[来源：[完整 artifacts package.json](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/packages/artifacts/package.json)；[npm publish access](https://docs.npmjs.com/cli/v10/commands/npm-publish/#access)]

## 3. root npm 包中没有可替代的 Artifact SDK 分发入口

对官方 [`@kodax-ai/kodax@0.7.97-alpha.7` tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz) 的全部 1,006 个文件与 package.json 检查得到：[来源：本轮 Python tarfile 文件清单/manifest 读取；安装一致性另见 [全量更新审计](kodax-alpha7-upstream-change-inventory-2026-10-18.md)]

- `exports` 为根、`/agent`、`/llm`、`/coding`、`/media`、`/repl`、`/skills`、`/mcp`、`/session`、`/client`、`/runtime`、`/sandbox`、`/a2a`、`/experimental-memory`、`/package.json`；没有 `/artifacts`。[来源：实际 tgz `package/package.json`；[root package.json:29](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/package.json#L29)]
- dependencies 没有 `@kodax-ai/artifacts`；没有 `packages/artifacts`、`sdk-artifacts`、任何路径段 `/artifacts/`，甚至没有文件名含 `artifact` 的条目。[来源：实际 tgz 的全路径清单与 manifest]
- root `files` 列表选择自己的 `dist`/配置/docs/scripts，没有包含 `packages/artifacts`；root SDK bundle entry list 与 dts entry map 也都没有 artifacts。[来源：[package.json:217](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/package.json#L217)、[build-bundle.mjs:466](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/build-bundle.mjs#L466)、[build-dts.mjs:85](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/scripts/build-dts.mjs#L85)]
- 在 Space 当前正式安装包执行 `import.meta.resolve('@kodax-ai/kodax/artifacts')` 返回 **`ERR_PACKAGE_PATH_NOT_EXPORTED`**。这不是可替代安装名。[来源：本轮 Node 只解析、不执行 import 的检查]

源码与正式文档支持的名字是 `@kodax-ai/artifacts`；未发现为同一 SDK 声明的其他 package name/subpath。不能由有限源码检索排除 registry 中一切未知别名，但没有 primary source 支持让 Space 猜一个新名字来接入。[来源：独立 manifest、Artifact SDK 文档、root exports/build maps]

## 4. 官方 registry 的当前观测及不可归因范围

本轮显式运行：

```powershell
npm view @kodax-ai/artifacts --registry=https://registry.npmjs.org name version dist --json
```

返回 `code=E404`、`Not Found - GET https://registry.npmjs.org/@kodax-ai%2fartifacts`。显式官方 registry 排除了仓库 `.npmrc` 默认镜像的影响；root 包 alpha.7 的正式 tarball 可取得且已核对。[来源：2026-10-18 本轮 npm view 输出；同轮主审计保存的 [registry 原始复核 JSON](kodax-artifacts-publication-recheck-2026-10-18.json)；[官方 registry endpoint](https://registry.npmjs.org/@kodax-ai%2fartifacts)、[root alpha.7 tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.7.tgz)、[repo .npmrc:1](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/.npmrc#L1)]

这个观测只证明**该查询上下文当时不能从公共 registry 获取这个包**。它不证明包从未发布、为何未公开、是否私有不可见、维护者是否遇过权限/OTP/namespace 问题、是否撤包；这些需要发布账户/日志或维护者说明。没有读取或探测发布凭据。[来源：查询结果能支持的范围；本轮没有发布记录或账户状态证据]

## 对需求方向的证据约束

合理的最小目标是：**让现有 Artifact SDK 形成一个与文档一致、可获取、可安装、可验证的正式交付物**。现有设计就是独立包，所以优先完善这一个包的发布与消费者验收，与 root 现有审计包共存；无需先建设通用 multi-package 发布框架，也无需为绕过 404 增加重复 `/artifacts` API、Product Client 域、Host RPC、渲染服务或 Space 自己复制源码。[依据：上文现有独立包设计、既有 root 单包发布边界；这是基于 primary sources 的工程判断]

发布验收应以非工作树消费者为准：官方 registry 能查询确定版本与 dist；干净目录安装正式交付物后四个入口可解析；最小 PNG 的 open/render/readEvidence 可返回真实像素；Product Client/Host 路径沿用现有 `/client`、`/kodax` 和 attachment-read seam；缺浏览器/不支持后端继续明确失败。已有 packed test 是可复用基础，registry 可用性应单独验证，避免再次把本地 pack 当成正式发布。[依据：[packed-artifacts.test.mjs:12](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/tests/packed-artifacts.test.mjs#L12)、[F301 guide:7](https://github.com/icetomoyo/KodaX/blob/25fa6399ada6dae0493faa221eb82174eebb9ad6/docs/test-guides/FEATURE_301_v0.7.97_TEST_GUIDE.md#L7)、[Artifact SDK](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md)]

发布链修复应与既有 Artifact 工具 locator schema、模型闭环、DOCX fidelity 等后续问题分开验收；“包能安装”不会自动解决那些问题，当前发布需求也不应借机扩大为新视觉架构。[依据：[正式记录的 Artifact integration gaps](https://github.com/icetomoyo/KodaX/blob/b0b446ec84fd20f21529025d086813eb5bcb2bd0/docs/ARTIFACT_SDK.md#integration-gaps-recorded-on-2026-10-13)]

## 未证实

- 未证明维护者忘记发布、发布失败、撤包、scope 权限或私有状态；没有相关原始发布日志/账户证据。
- 未检查维护者在本仓库之外是否有单独人工发布过程；当前仓库的正式脚本没有这一步。
- 未将已有本地 dist 的 dry-run 候选当成 CI/release 级审计产物，也未重新执行 packed test 或真实模型视觉闭环。
- 未找到有官方契约支持的替代包名；不把全网未知别名视为已被穷尽排除。

以上未证实项均与已确定的当前代码路径、root tgz 形态和官方 E404 观测分开。

## 未解问题

1. 上游是否有正式但未记录的独立发布计划、私有 registry 或历史发布失败？需维护者给发布记录，不能靠源码猜动机。
2. 上游准备以哪个明确版本交付既有独立 SDK？应由上游确定，不在 Space 自行宣称 alpha.7 的独立包已存在。
3. 上游现有发布账户对独立包的 namespace/access 是否满足？需要实际发布责任方检查；本轮不触碰凭据、不试 publish。
