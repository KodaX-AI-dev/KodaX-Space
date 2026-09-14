# F146 企业微信只读连接器证据

核验日期：2026-09-01。该文件记录公开官方源码与固定资产，不代表完成真实账号验收。开发期间没有登录、扫码授权、读取真实企业内容或执行远端写入。

## 已实现边界

- 官方 `@wecom/cli` 1.2.0；首批仅 macOS arm64。
- 宿主随机 `space-UUID` profile，独立 config/work/tmp；不采用全局 CLI、全局账号或 PATH 查找。
- 用户输入只接受 `wecom://document/<id>` 内部引用或无 query 的 `https://doc.weixin.qq.com/doc/<id>`，不是搜索、知识库枚举、智能文档或通用命令代理。内部引用不冒充网页 URL；仅验证官方响应时兼容 `scode` 参数。
- 文档 ID 暂限宿主安全字符集 `[A-Za-z0-9_-]{1,128}`；`a1_` / `b1_` 智能文档明确排除。此字符限制是本产品边界，不宣称是官方完整 ID grammar。机器人 ID 限 160 字符，与宿主身份契约对齐。宿主 UI 的资源输入暂不收 query：完整分享链接须去掉 `?scode=...`，或使用内部引用；adapter 仅在官方响应验证中兼容 scode。
- 默认只读。唯一业务命令是 `doc contents get --json`，宿主构造 `docid` 与固定 `content_type: markdown`。本实现没有远端写入方法。

## 官方来源与固定资产

[官方仓库](https://github.com/WecomTeam/wecom-cli)，核验源码固定到 [78c514b2afee7c0d3d7be715628478421f37ee63](https://github.com/WecomTeam/wecom-cli/tree/78c514b2afee7c0d3d7be715628478421f37ee63)。版本发布于 npm，没有依赖第三方同名项目。

[npm 固定版本元数据](https://registry.npmjs.org/@wecom%2fcli-darwin-arm64/1.2.0)；[官方 tarball](https://registry.npmjs.org/@wecom/cli-darwin-arm64/-/cli-darwin-arm64-1.2.0.tgz)。发布包只包含 `package/LICENSE`、`package/bin/wecom-cli`、`package/package.json`、`package/README.md` 四个 regular 文件。

```text
archive SHA-512 (base64): fI5ii3F84NzsoIH8/WSLlSuNbcYeitwfOjAL7ktUSi6QtOyFK6yqXcWde5u67p9ZZj57tEFOqsgS4bOZdQIEUw==
native SHA-256: 6c8d6b7e9fd8c23d39f24cf954e2e96cd26ed2eb01aa3375ba33d2ecbc207ebd
native path: package/bin/wecom-cli
native size: 7,221,312 bytes
```

宿主只有收到安装确认才下载固定 URL。先验证 archive 摘要，拒绝越界/链接/重复/未知成员，仅将已知二进制字节写入私有 staging，校验 native 摘要后原子发布；不执行 npm、postinstall 或包内脚本。复用时再次验证 native 摘要与版本。公开资产已下载流式核验，未为此次开发安装或运行真实 CLI。

[版本格式源码](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom/src/constants.rs) 表明 distribution 编译变量缺失时为 `unknown`，不能因 npm 分发就断言版本输出含 `npm`。宿主兼容该明确默认值；原始 native 静态字符串确认版本 `1.2.0`、commit `78c514b`、构建时间 `2026-08-25T10:23:42Z`，不把源码提交时间误当构建时间。安全信任来自上述固定 native 摘要，不依赖 distribution 自报字符串。

## 授权与身份

[auth 源码](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom-cli/src/cmd/auth.rs) 明确支持 `auth init --noninteractive --no-browser`。stdout 中独立一行输出官方页面；CLI 自行每三秒轮询，超时五分钟，没有本地 HTTP callback。宿主只接受 [qrcode.rs](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom-cli/src/auth/qrcode.rs) 中的 `https://work.weixin.qq.com/ai/qc/gen?source=wecom_cli_external&scode=...`，严格核验 scheme/host/path/query，交由可信弹窗打开系统浏览器。

`auth show --status` **没有身份字段**，仅返回 authorized/unauthorized。`auth show` 才返回本地 `Bot ID`。宿主先读此 ID，再执行官方 `identity whoami`，最后再读 ID，要求一致；绑定身份为 authority=`wecom-bot`、subject=该 ID、label=`企业微信机器人`。不猜测 whoami 内部用户、企业或机器人名称字段。

whoami 命令来自 [官方 shared skill](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/skills/wecomcli-shared/SKILL.md)。在线成功判定依据 [catalog.rs](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom-cli/src/transport/catalog.rs) 的 RequireAuth、[envelope.rs](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom-cli/src/transport/envelope.rs) 的统一错误校验和 [main.rs](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom-cli/src/main.rs) 的错误非零退出。宿主仍要求 exit 0、非空 JSON object，任何异常失败关闭。连接完成后和每次读取前均在线验证；临发起业务子进程前再次验证账号与会话开关。

## 权限、私有凭据与读取 schema

此扫码路径绑定**企业微信机器人**，不是飞书的用户 OAuth，也没有可复用的 OAuth scope 参数。无需由 Space 收集 client ID/secret；用户仍须拥有官方页面允许接入的机器人及相应企业资格、资源权限。企业/管理员的具体资格规则与开通条件以官方授权页面为准，本实现不硬编码人数门槛、不声称可访问所有企业文档。官方授权可能赋予机器人更宽能力；Space 的只读策略不等同于官方只读 OAuth grant。

[config.rs](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom-cli/src/config.rs) 支持 `WECOM_CLI_CONFIG_DIR` 与 `WECOM_CLI_TMP_DIR`。宿主固定自己的目录及空 config，剥离外部环境里的 endpoint/header/token 注入，以空 cwd `.env` 阻断 dotenv 向上搜寻。凭据由官方 CLI 的 `credentials.enc` 管理；[keystore.rs](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom-cli/src/auth/crypto/keystore.rs) 使用配置路径隔离 keyring 项目，并会写私有 `.encryption_key`，不是“绝不落盘”。宿主不读取或输出凭据内容。已有 profile 不重授权覆盖；取消/本地解绑不等于撤销官方权限。

[logging.rs](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/crates/wecom-cli/src/logging.rs) 支持 `WECOM_CLI_LOG_LEVEL=off`，但文件日志没有独立 off 参数且可能有编译时默认目录。宿主将 `WECOM_CLI_LOG_DIR` 指向已验证的私有空 `.env` **文件**（不是目录），使用官方明确的文件日志初始化失败后禁用逻辑，确保不落盘 debug 日志或写入编译默认位置。官方会在 stderr 输出初始化警告，宿主不会向 UI 透传。

[官方 doc skill](https://github.com/WecomTeam/wecom-cli/blob/78c514b2afee7c0d3d7be715628478421f37ee63/skills/wecomcli-doc/SKILL.md) 明确返回 `url/name/content/file_path/document/version`。宿主只接受匹配请求 ID 的官方 URL、字符串 name、整数 version，以及 inline content 或私有 tmp 内的 UTF-8 文件；文件读取拒绝 symlink/hardlink/越界并限 1 MiB。

## 品牌来源

`resources/brands/wecom.png` 是 [企业微信官网](https://work.weixin.qq.com/) 声明的[原始官方 PNG favicon](https://wwcdn.weixin.qq.com/node/wwnl/wwnl/style/images/independent/favicon/favicon_48h$c976bd14.png)，48×48。未重绘或生成品牌标志。

## 验证记录与待验收

- TDD：共享 process、installer、WeCom 首先各出现 missing-module RED，再最小实现 GREEN；私有 config 在 whoami 后被替换的回归测试先失败，再补齐逐命令复验，现已通过。
- 20 个邻接测试通过（包含共享进程与安装器），覆盖官方 URL 分片、whoami 失败/不合法响应、前后 bot 不一致、读取 guard 撤销、路径逃逸、恶意 tar/digest/redirect、原子安装失败清理、超时与取消、既有目录权限放宽、日志隔离和官方版本默认渠道。
- 组合契约回归：先得到 `assertRead` 早于 `beforeRead` 的 RED，去除过早同步 guard 后，又准确得到官方输入 URL 被内部引用替换的 RED；保留已校验的 `input.documentUrl` 后 GREEN。真正业务 spawn 仍经过异步权限 + 在线身份复验，随后紧贴 spawn 的同步会话 guard；读取后也再次检查身份和会话。
- `tsc -p apps/desktop/electron --noEmit` 通过。最终格式化后覆盖率：共同源码行 96.03%、分支 80.72%。限定文件 ESLint 通过。最终整体构建和整合测试由主任务汇总。
- **未验收**：真实企业扫码、实际机器人资格和文档访问权限、服务端动态 schema 的线上返回。没有以 fixture 代替真实端到端成功宣称。若官方服务改变字段或命令，adapter 会返回固定安全错误。

## 共享安装器：钉钉发布包兼容性回归

2026-09-01 进一步审计确认 [DingTalk 官方 v1.0.61 macOS arm64 发布包](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases/download/v1.0.61/dws-darwin-arm64.tar.gz) 包含 `./`（type 5、size 0）以及 regular 文件 `./dws`、`./README.md`、`./NOTICE`、`./LICENSE`、`./CHANGELOG.md`。原共享安装器拒绝所有目录头，会阻止此真实资产安装。

以这份**准确 inventory** 编写 public installer fixture 得到 RED，然后增加 host-owned `allowedDirectories?: readonly string[]`，仅接受 exact literal、type 5、size 0 的显式清单项。目录只参与归档验证，不落盘；不 normalize 路径，不接受硬链接、软链接、重复项、非零目录或未声明目录。原来的固定摘要、目录/文件数、大小、校验和与唯一 native 字节发布边界保持不变。含八种目录负例的 7 个 installer 测试 GREEN。

真实归档随后通过同一 `createProviderCliInstaller` 的下载输入 seam 在新建临时目录完成解析与原子发布，`verifyBinary` **只读取并计算静态摘要，不执行 native**：

```text
archive bytes: 11,404,413
archive SHA-256: 9a122f6322983c45e44db7274788dbb5c62d1762268e45d18e0e72ed40d39978
native bytes: 32,432,720
native SHA-256: b41b5d3250fc809dbb80e1471b9a3768e0df3af088e296b457bd381f5e1df3de
published files: dws only
native executed: false
```

本次临时发布副本已清理；未修改应用真实安装、账号或 profile，未登录、授权、远端读写。提供核验材料的原始下载归档保留供其他审查者复核。该验证补上真实 archive → bytes → 原子发布，不代表 CLI 运行、网页登录或权限验收。

## 企业微信最终 native 分派复验

独立时序复核发现仅在 `installed()` 校验摘要不能覆盖后续异步权限检查期间的 native 替换。因此新增 `wecom-native.ts`：固定 7,221,312 字节、上述官方 SHA-256，拒绝 symlink/hardlink，使用 `O_NOFOLLOW` 打开并分块读取，校验打开前后文件身份及读后元数据。

每条命令（包括首次 `--version`）遵循：共享进程准备私有 cwd → 原 `beforeSpawn`（读取时含权限与在线账号复验）→ 固定 native 摘要验证及稳定元数据记录 → 原同步会话 guard → 同步 `dev/ino/size/mode/mtimeNs/ctimeNs` 复验 → `spawn`。同步 guard 后至 `spawn` 之间无 `await`。不将此检查夸大为操作系统级原子 `fexecve` 保证。

两个竞态回归分别先 RED 后 GREEN：异步权限检查中替换 native 后，零后续命令分派；最后同步 guard 中替换 native 后，零业务分派。另验证相同大小但摘要错误的文件在首次版本检查前被拒绝。13 个 WeCom 测试、限定 ESLint、Electron TypeScript 检查通过；WeCom 源码行覆盖率 96.71%。保留统一 `checkReadConnectorDocument` 的正文与标题大小边界。

真实官方 npm archive 经共享安装器下载、摘要验证与临时发布后，新 `verifyWecomBinary` 返回 true，前后元数据记录一致，native 字节数与 SHA-256 再次吻合；验证全程 `executedNative=false`，本次临时副本已清理。没有执行企业微信 CLI、登录、授权或读取真实账号。
