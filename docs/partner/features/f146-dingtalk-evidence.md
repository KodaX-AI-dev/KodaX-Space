# F146 钉钉首批只读适配：证据与边界

核实日期：2026-09-01。固定官方 CLI：`DingTalk-Real-AI/dingtalk-workspace-cli` **v1.0.61**。本轮没有安装到应用私有目录或执行真实 dws、登录、授权、读取真实账户；下载官方固定归档后仅做静态解包、摘要与安装器发布验证，测试采用静态协议样本与受控进程替身。另下载官方站点的品牌图片。

## 已实现范围

- `createDingtalkConnector({ root })` 对接宿主 `ReadConnector`，首批仅 macOS arm64。
- 用户确认后才允许下载固定官方 release；归档与 native 字节分别校验固定 SHA-256，然后才执行版本校验。解压只接收精确清单内普通文件及零字节根目录 `./`，不运行安装脚本、npm、共享 Skills 安装或全局 PATH 查找。
- 复用路径和每次命令都重新验证 native 字节。业务命令在异步宿主权限 / 在线身份检查完成后再次校验，紧贴 spawn 的同步检查要求 dev、inode、大小、mode、mtime / ctime 纳秒标记仍一致；不把可伪造的 `--version` 当完整性凭证。
- 官方本地 loopback 浏览器授权；解析 stderr 授权 URL，严格匹配官方 origin/path/scope/loopback 后才交给宿主。
- 每次连接使用全新 `space-UUID` 私有目录，映射官方精确 `corpId:userId` selector。只以在线身份结果验证账号；权限确认后、真正业务 spawn 前再次检查身份和会话授权。
- 只读指定 `dingtalk://document/<nodeId>` 或无 query 的 `https://alidocs.dingtalk.com/i/nodes/<nodeId>`；仅 `ALIDOC/adoc`。无搜索、创建、追加、修改、删除、附件抓取或任意命令入口。`revision: 0` 表示未取得数字版本，不提供乐观写入保证。

## 官方接口证据

| 用途     | 固定命令 / shape                                                                                                                                                                                               | 官方来源                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本     | `dws --version` → `dws version v1.0.61 (commit, build)`；元信息可省略                                                                                                                                          | [root.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/app/root.go), [version.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/app/version.go)                                                                                                                                                                    |
| 授权     | `dws auth login --no-browser --format json`；授权 URL 仍为 stderr 文本；成功 stdout 包含 `success/token_valid/corp_id/user_id`，无 token 原文                                                                  | [auth_command.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/app/auth_command.go), [oauth_provider.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/auth/oauth_provider.go)                                                                                                                                     |
| 授权地址 | `https://login.dingtalk.com/oauth2/auth`；参数 `client_id`, `redirect_uri=http://127.0.0.1:<port>/callback`, `response_type=code`, `scope=openid corpid`, `prompt=consent`，可选 `corpId`                      | [oauth_helpers.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/auth/oauth_helpers.go), [endpoints.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/auth/endpoints.go)                                                                                                                                            |
| 在线身份 | `dws --profile <corpId:userId> contact user get-self --format json` → MCP `get_current_user_profile`；`result[].orgEmployeeModel.{corpId,userId,orgUserName,orgName}`；官方还识别 `userid/orgUserId/name` 别名 | [contact.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/helpers/contact.go), [auth_command.go identity parser](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/app/auth_command.go)                                                                                                                                |
| 元信息   | `dws --profile <exact> doc info --node <nodeId> --format json` → MCP `get_document_info`；核对 `nodeId/contentType/extension` 和标题                                                                           | [doc.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/helpers/doc.go), [doc-info.md](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/skills/mono/references/products/doc/doc-info.md)                                                                                                                                         |
| 正文     | `dws --profile <exact> doc read --node <nodeId> --format json` → MCP `get_document_content`；读取顶层 `markdown` 字符串                                                                                        | [doc.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/helpers/doc.go), [Markdown fixture](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/helpers/doc_command_edges_test.go), [doc-read.md](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/skills/mono/references/products/doc/doc-read.md) |

简单命令的 JSON 输出解析并输出 MCP text payload，不是统一假定 `{ data: ... }`：[helpers.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/helpers/helpers.go)。适配器拒绝未证明的 wrapper、缺失字段、错误 envelope、歧义组织和过大内容，不把 exit 0 当业务成功。

`auth status` 的 authenticated 可以仅表示本地 access/refresh token 时间有效，因此没有将它用作在线身份验证。

## 凭据与授权边界

同时设置宿主生成的私有 `DWS_CONFIG_DIR` 和 `DWS_KEYCHAIN_DIR`。macOS 的 `StorageDir(service)` 实际在后者目录下读写 token 密文，尽管环境变量源码注释提到测试用途。系统 Keychain 的 `dws-cli/dek` 是共享加密密钥，而不是共享 token：仅隔离 token 文件与 profile/config，不声称 DEK 独立。不设置测试 namespace，不关闭系统 Keychain，不读取或切换已有 `~/.dws`，不调用 logout/reset。

来源：[keychain.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/keychain/keychain.go), [keychain_darwin.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/keychain/keychain_darwin.go), [keychain_store.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/auth/keychain_store.go)。Windows 凭据实际保存在 HKCU/DPAPI，`DWS_KEYCHAIN_DIR` 不隔离该凭据存储，因此本批不开放 Windows：[keychain_windows.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/keychain/keychain_windows.go)。

官方 CLI 自行从官方服务发现 CLI client ID；Space 不借用 WorkBuddy 等其他产品的身份。企业需已开启 CLI Access，用户需具备资源权限；Markdown 读取还需要下载权限，跨组织非公开文档可能失败。[官方 README](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/README.md)

缺 PAT 业务权限时，官方 JSON 模式仍可能直接打开服务端返回的 URL。Space 在自己的私有 `config/pat_policy.json` 中固定 `{"default":{"openBrowser":false}}` 并在每次执行前校验；不自动 recommend/approve，不跟随返回 URL。缺权限返回固定错误，用户需在官方界面处理权限后重连。此文件仅控制本地浏览器策略，不授予远端权限：[browser_policy.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/pat/browser_policy.go), [pat_auth_retry.go](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/app/pat_auth_retry.go)。

## 尚未证明 / 人工验收必做

- 未做真实企业的完整授权、CLI Access、PAT、在线身份、文档权限和读取验收。自动测试通过不等于账户端到端通过。
- 元信息字段有官方文档，但完整企业回包外层 shape 未做真实抓取；当前严格只接受顶层 `nodeId/contentType/extension` 和 `title` 或 `name`。不匹配时必须失败并补充脱敏官方样本，不猜 wrapper 或伪造成功。
- 在线身份省略 corpId 时，即使旧上游允许本地历史补齐，本适配器仍拒绝连接，不用缓存补足组织。
- 上游 OAuth URL 没有 state / PKCE 参数，本方案继承官方 callback，不声称 Space 为其增加 state/PKCE 保证。
- 固定 release 已下载并静态验证，且真实 archive 已通过共享安装器的解析 / 摘要 / 临时原子发布检查；macOS 签名/系统弹窗、应用内安装、全新 profile 首次启动尚未执行。静态验证从未启动该 native 文件。
- 取消或断开不撤销已经在官方网页授予的权限，已生成私有凭据可能保留，不清理其他账户。

## 固定资产

- CLI：[v1.0.61 darwin-arm64 tar.gz](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/releases/download/v1.0.61/dws-darwin-arm64.tar.gz)。SHA-256（[官方 release API digest](https://api.github.com/repos/DingTalk-Real-AI/dingtalk-workspace-cli/releases/tags/v1.0.61)）：`9a122f6322983c45e44db7274788dbb5c62d1762268e45d18e0e72ed40d39978`。
- 实际归档为 11,404,413 bytes；认证归档后检查到精确清单：`./`（type 5、零字节目录），`./dws`, `./LICENSE`, `./NOTICE`, `./README.md`, `./CHANGELOG.md`（普通文件）。实际发布包包含 `./` 前缀，不以 [.goreleaser.yaml](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/.goreleaser.yaml) 推测去掉前缀。安装器只落二进制，不保留文档/脚本。
- Native `./dws` 为 32,432,720 bytes，SHA-256：`b41b5d3250fc809dbb80e1471b9a3768e0df3af088e296b457bd381f5e1df3de`。摘要由上述已认证的官方归档计算；静态 native 校验器直接验证官方提取字节返回成功，不需要执行 `--version`。
- Logo 来源页：[钉钉官网](https://www.dingtalk.com/)，该页 HTML 引用的 [200×200 PNG](https://img.alicdn.com/imgextra/i3/O1CN017PqYP51OX3bSJGxQY_!!6000000001714-2-tps-200-200.png)。原图未改绘，保存为 `resources/brands/dingtalk.png`；SHA-256 `64109bb4acc0c87dc6b3e2feed078264401b823954a5d392615ab54c1873a2c4`。仅识别服务，不宣称品牌授权/背书。

## 本地验证

`node --import tsx --test apps/desktop/electron/partner-connectors/dingtalk-connector.test.ts`；测试覆盖安装确认、精确 profile、可信 URL、在线身份、拒绝缓存假成功、会话撤销、PAT 跳转抑制、凭据目录软链、错误回包、错误文档类型及取消后的连接发布。静态样本只验证适配器受控行为。

Native 完整性修复增加三轮 RED → GREEN：伪版本文件 / 等尺寸错误字节在任何命令前零启动、异步权限回调后替换零启动、最终同步 guard 中替换零启动。14 个 adapter 测试通过；本地限定覆盖率行 98.90%、分支 84.50%，Electron TypeScript 与限定文件 ESLint 通过。共享安装器另用真实固定归档验证精确清单与静态 native 摘要，未执行 native；本项仍不是用户账户端到端验收。
