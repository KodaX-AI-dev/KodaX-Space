# F146：Partner 多连接器接入清单

核实日期：2026-09-01。状态：用户已确认按核实路线先落地可行项；**首批企业微信、钉钉、腾讯会议的授权与指定资源只读实现、自动验证及 Electron 卡片检查已完成，真实账号授权/读取待用户验收；其余六家仍待后续实施或外部前提**。

延续 [Partner 插件库计划](v0.1.61-partner-plugin-library.md) 与 [已实现飞书向导](f146-feishu-onboarding.md)，不新建执行引擎、不修改 Coder / Partner 共享 Skill。Space / SDK 版本保持不变，独立插件库本批更新到 0.6.0。当前飞书连接继续保留；既有自动测试和飞书授权不能作为新提供方已经接通的证据。

## 1. 用户要求与已确认事项

用户要求新增：企业微信、钉钉、网易邮箱、QQ 邮箱、腾讯会议、腾讯文档、百度网盘、金山文档、Notion。

统一产品体验：飞书同款横向品牌卡片、官方图标、Space 视觉、可信宿主连接弹窗、连接后管理 / 去试试、输入框本会话开关。安装 / 授权 / 验证按提供方的真实能力执行，不把所有产品都写成同一种 OAuth。

依 `space-connector-builder`，下列偏离原“官方 CLI + 网页授权自动完成”的决策已向用户说明：

1. 腾讯文档采用官方 MCP；Notion 优先评估官方 MCP 的产品化 OAuth，不借用其他客户端身份。
2. 网易与个人 QQ 邮箱采用客户端授权码 + IMAP/SMTP，不采集网页登录密码。首版网易暂限定已核实的 163；126 / yeah / VIP / 企业邮箱须另核实参数。
3. 百度网盘接受官方 CLI 的网页授权码回填，且明确只操作 `/apps/bdpan/`，不承诺全盘访问。
4. 金山文档默认理解为个人版；其自有应用与服务端前提未就绪前暂缓实现。WPS 365 不是静默替代品；若用户指企业版，需另行明确命名与范围。

用户回复“可以，就按照这个，先把能落地的落地了”，已确认上述路线。无须用户现在提供任何 secret、授权码或真实文档；登录与授权由用户在实际验收时自行完成。首批限定三家 CLI 的授权和指定资源只读；远端创建、发信、追加、上传等写操作仍单独分批，不把本批读取能力标为完整产品能力。

## 2. 九家官方路线矩阵

| 服务 | 已核实路线 | 必须如实表达的边界 |
| --- | --- | --- |
| 企业微信 | 官方 `wecom-cli`，官方网页扫码并轮询 | 机器人及授权人身份，不是飞书式用户 OAuth；不能保证读取用户全部既有文档。[官方源码](https://github.com/WecomTeam/wecom-cli) |
| 钉钉 | 官方 `dws`，浏览器 OAuth / device flow | 企业需开启 CLI Access；登录 scopes 与业务 PAT / 对象权限分离。[官方仓库](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) |
| 网易邮箱 | 个人邮箱客户端授权码 + IMAP/SMTP | 未找到可验证的第三方个人邮箱官方 CLI / 通用网页 OAuth；授权码不是 OAuth。[官方协议设置](https://help.mail.163.com/faqDetail.do?code=d7a5dc8471cd0c0e8b4b8f4f8e49998b374173cfe9171305fa1ce630d7f67ac2a5feb28b66796d3b) |
| QQ 邮箱 | 个人邮箱客户端授权码 + IMAP/SMTP | 官方 Agent Mail 与个人邮箱隔离，不可替代个人存量邮件。[官方授权码说明](https://help.mail.qq.com/detail/0/985)、[Agent Mail](https://agent.qq.com/) |
| 腾讯会议 | 官方 `tmeet`，官方网页授权并轮询 | 个人 / 专业版开放，商业 / 企业版按当前官方灰度资格；会议、录制与纪要不是通用文档库。[官方仓库](https://github.com/TencentCloud/tencentmeeting-cli)、[官方支持](https://meeting.tencent.com/support/topic/2236/index.html) |
| 腾讯文档 | 官方 MCP + 官方网页授权辅助协议 | 官方 helper 不是独立业务 CLI；当前流程要求用户确认授权完成后取 token，不能称已验证自动回调。[官方 MCP](https://docs.qq.com/open/document/mcp/)、[官方 Skill 文档](https://docs.qq.com/open/document/mcp/skill/) |
| 百度网盘 | 官方 `bdpan`，网页授权后手工回填授权码 | 操作限制在 `/apps/bdpan/`；未核实无回填的系统浏览器自动完成流程。[官方认证说明](https://github.com/baidu-netdisk/bdpan-storage/blob/main/skills/baidu-drive/reference/authentication.md) |
| 金山文档 | 个人版开放平台 OAuth / API | 服务商入驻、自有应用、服务端换 token / 调 API；不能把 app_key 放桌面包。[入驻前提](https://developer.kdocs.cn/isp/access/access-open-kdocs.html)、[Web OAuth](https://developer.kdocs.cn/common/authorization/web.html) |
| Notion | 官方 `ntn` CLI 与官方远程 MCP 均存在 | CLI 受 workspace 成员 / PAT 策略限制；产品化拟优先 MCP，但正式桌面回调支持还需验证。[CLI](https://developers.notion.com/cli/get-started/overview)、[MCP client](https://developers.notion.com/guides/mcp/build-mcp-client) |

没有找到某条官方路线，不等于断言该产品永远没有该能力。实施时重新核验固定版本、官方 schema、下载完整性与平台，不能依据本表推断账号已获得资格或授权。

## 3. 提供方适配要点

### 企业微信、钉钉、腾讯会议

- 企业微信当前 npm `@wecom/cli` 1.2.0；`auth init --noninteractive --no-browser` 进入官方 `work.weixin.qq.com` 授权。`auth show --status` 只是本地状态；需用 `identity whoami` 的实际 schema 校验机器人 / 授权人，再验证所选对象能力。`WECOM_CLI_CONFIG_DIR` 与 Keyring 路径摘要支持隔离，但当前源码也写 `.encryption_key`，不宣称仅系统 Keychain 保存密钥。[授权源码](https://github.com/WecomTeam/wecom-cli/blob/main/crates/wecom-cli/src/cmd/auth.rs)、[存储实现](https://github.com/WecomTeam/wecom-cli/blob/main/crates/wecom-cli/src/auth/crypto/keystore.rs)
- 钉钉核实稳定版 v1.0.61：`auth login --format json --no-browser` 或 `--device`。默认 OAuth scopes 为 `openid corpid`；不要自动使用批量扩权选项。`auth status --profile <corpId:userId> --format json` 不提供完整业务授权证明；每次调用锁定 profile。`DWS_CONFIG_DIR` 不隔离全局 `dws-cli` Keychain，测试专用 namespace 不可当生产隔离方案。[固定版本授权实现](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/app/auth_command.go)、[PAT 说明](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/skills/mono/references/products/pat.md)
- 腾讯会议核实 v1.0.15：`auth login --no-browser` 使用官方 `meeting.tencent.com` 页面并轮询。`auth status` 在线读取用户名失败仍可能显示 Logged in，不能据 exit 0 判成功。本批只返回指定会议的基本信息；列表、录制/纪要导出及写能力均不包含。macOS / Linux 配置目录可指定，Windows 凭据仍有固定注册表边界，未经验证不声称跨平台账号隔离。[授权源码](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/internal/auth/auth.go)、[状态实现](https://github.com/TencentCloud/tencentmeeting-cli/blob/v1.0.15/cmd/auth/status.go)

三家均不能直接复用飞书的 user identity + 三个文档 scopes 判断式。未核实的业务字段在固定版本受控测试和用户授权验收前保持未知，不以本地配置存在替代联网验证。

### 腾讯文档

官方当前 [下载包](https://cdn.addon.tencentsuite.com/static/tencent-docs.zip) 静态核实为 1.0.41，归档 SHA-256 为 `c8c8e6c05fe36cbfc4de7577e00975c1bae4fe2d08c939d6bbffab2fc1a9e2ef`。这是本次证据快照，不是自动执行许可。

- helper 的 `tdoc_check_and_start_auth` 返回官方授权页；用户明确完成后 `tdoc_fetch_token` 取回 token。旧 `tdoc_wait_auth` 资料不作为当前依据。
- 不直接执行原 `setup.sh`：它会全局安装第三方 mcporter、写 home MCP 配置、使用共享临时授权文件，且存在输出 token 的 DEBUG 行。若获准采用这条路线，只在可信宿主实现受限协议与单次任务状态。
- 四个官方端点为 `/openapi/mcp`、`/api/v6/doc/mcp`、`/api/v6/sheet/mcp`、`/api/v6/slide/mcp`，域名 `docs.qq.com`。当前包使用 `Authorization: <token>`，不能擅加 Bearer 或记录其值。
- `manage.search_file` / `manage.recent_online_file`、`get_content` 等 schema 实施时以官方 tools/list 再核实。当前资料没有可靠 whoami 证明；工具枚举成功、token 非空均不能表示账号身份已确认。最低应有受保护只读探针，账户显示信息须有真实来源。
- 首版拟支持指定文档读取与受审新建；不同文件类型的编辑需分别支持，不提供任意远程工具调用。用户账号现有文档权限、会员权益、会话对象范围和宿主审核保持分离。

### 网易与 QQ 个人邮箱

用户已接受授权码路线，邮箱适配仍待下一批实施。163 官方参数为 `imap.163.com:993` / `smtp.163.com:465`；QQ 为 `imap.qq.com:993` / `smtp.qq.com:465`，均使用 TLS。[网易官方参数图](https://nos.netease.com/help/5c47f311d6bfeafe1e07d52205f860f2.jpg)、[QQ 官方配置](https://help.mail.qq.com/detail/108/1089)

- 授权码由可信宿主专属凭据界面接收并安全存储，不进入插件 frame、模型消息、普通连接记录或日志。不得要求网页登录密码。
- 拟先做只读目录 / 搜索 / 读取，IMAP 使用不改变已读状态的策略；登录和能力验证不发送测试邮件。
- 可先制作本地待审核草稿；SMTP 发送是独立受审写操作。服务端草稿只有验证 IMAP 文件夹映射与 APPEND 后才能承诺，不能把本地草稿标为已同步。
- SMTP 投递超时可能已送达，必须保留 unknown / 对账状态，不自动重发；收件人、抄送、密送、正文与附件均属于不可变审核内容。
- QQ 密码修改会使客户端授权码失效；相关错误应引导重连，不降级为密码登录。[QQ 授权码安全说明](https://help.mail.qq.com/detail/0/1091)

### 百度网盘

[官方 login.sh](https://github.com/baidu-netdisk/bdpan-storage/blob/main/skills/baidu-drive/scripts/login.sh) 走授权 URL + `--set-code-stdin` + `whoami`；不把含授权值的原始输出暴露给模型或日志。由用户在可信宿主输入一次性授权码的方案已获确认，适配尚未实施。

- `BDPAN_CONFIG_PATH` / `BDPAN_CONFIG_DIR` 可指定账号配置，但加密实现与平台状态仍需验证；不读取真实凭据文件到工具输出。
- `/apps/bdpan/` 内列表 / 搜索 / 下载是候选只读范围。分享 URL 的 download 会先转存，属于写操作，不可当作纯读取。
- 首版写能力拟只做受审上传；移动、删除、分享均不默认开放。异步 submitted 不等于完成。
- README 的 Windows 支持说明与当前 3.8.4 安装脚本不一致，暂不承诺原生 Windows 可用。[官方命令说明](https://github.com/baidu-netdisk/bdpan-storage/blob/main/skills/baidu-drive/reference/bdpan-commands.md)

### 金山文档与 Notion

- 个人金山文档需要企业服务商条件、自有 app_id / app_key 与服务端。最低拟 user_basic 身份、应用文件夹搜索与指定文件下载；不默认申请删除权限。若需建设托管服务，须另行明确部署主体、域名与凭据管理，本请求不授权部署或注册外部应用。[权限表](https://developer.kdocs.cn/server/guide/permission.html)、[应用文件夹搜索](https://developer.kdocs.cn/server/personal/files-search-name.html)
- [WPS 365 CLI](https://github.com/wps365-open/cli) v0.3.4 确实存在，但它是另一个企业产品，需要应用身份；管理员审批与商业权益取决于应用类型及所用能力。若用户改选，重新验证其多账号隔离；不要把文档中的旧 `kso.file.search` 当有效 scope，当前 changelog 更正为 `kso.file_search.readwrite`。
- Notion 的 `ntn` CLI 有网页登录，但受成员 / PAT 管控；官方 PAT 文档不建议用来认证面向多用户的产品。`NOTION_HOME` 不能隔离同 workspace 的系统 Keychain，logout 清理范围的两份官方文档还有冲突，不能直接映射为解绑某条连接。[CLI 认证](https://developers.notion.com/cli/get-started/authentication)、[PAT 适用范围](https://developers.notion.com/guides/get-started/personal-access-tokens)
- 因此拟使用官方 MCP `https://mcp.notion.com/mcp`，KodaX 自行 DCR 注册、PKCE + state、严格回调与安全 refresh。**正式桌面 loopback 回调是否被允许尚待验证**；若需 HTTPS 服务端，要先明确基础设施，不能借用别的客户端身份。身份探针是 `notion-fetch` 的 `id: "self"`，不是 `notion://self`。[MCP client 文档](https://developers.notion.com/guides/mcp/build-mcp-client)、[支持工具](https://developers.notion.com/guides/mcp/mcp-supported-tools)

## 4. 延用接缝与拟定批次

首批按下述接缝落地最小分派；未完成的路线不注册占位连接器。不预造任意脚本注册或通用插件执行框架。

| 接缝 | 实施约束 |
| --- | --- |
| Extension manifest / bridge | 声明 adapter / 品牌 / 业务类别；宿主按 allowlist 校验，不接受包内命令、可执行路径、任意 URL 或 client secret |
| Onboarding / account | 提供方专属授权、身份和真实能力验证；取消 / 过期 / 迟到提交隔离；敏感挑战仅可信宿主使用；解绑不影响用户其他 CLI 账号 |
| Session binding / schema | 将飞书 URL / profile 的硬编码分支改为已实现提供方的判别类型；文档、会议、邮件、网盘范围不能伪装成 Feishu docx；兼容旧飞书记录 |
| Run-scoped tool | 原 Partner 执行引擎中的受限 read / propose；只有支持并获会话范围的操作才进入本轮，不向 Coder 或全局 MCP 添加工具 |
| Proposal / receipt | 复用三卡片与不可变审核；按服务区分创建文档、发送邮件、创建会议、上传文件；拒绝、撤权、冲突、unknown 不写假成功 |
| Brand / interaction | 复用飞书横向卡片、官方本地图标、Space 主题、keyboard / focus；iframe 按品牌嵌入对应资源，不扩大无网络 CSP |

拟定顺序：

1. 企业微信垂直切片：品牌 → 私有 CLI 确认 → 官方授权 / 在线身份 → 指定文档范围 → 读取 → Electron；同时证明飞书升级兼容。远端写入未在本批开放。
2. 钉钉、腾讯会议：复用最小分派，但独立实现业务身份、权限与资源类型，不强求“文档追加”统一所有服务。首批仅 macOS Apple Silicon，钉钉限定 ALIDOC/adoc，腾讯会议限定基本信息，不导出录制、纪要和人员名单。
3. 腾讯文档、Notion：获准官方 MCP 路线并确认桌面授权条件后实施；安全凭据 / refresh 与现有 MCP 传输能力复用，不写全局 MCP 配置。
4. 网易 163、个人 QQ：获准授权码路线后实施邮件读取，再单独完成受审发送；不混入 Agent Mail。
5. 百度网盘：获准授权码回填与应用目录边界后实施。
6. 个人金山文档：自有应用 / 服务端方案确认且外部前提就绪后实施；此前不放可点击但无实际能力的连接入口。

每批先写 schema / 任务 / adapter / 会话 / UI / 审核失败测试，再实现最小闭环；交付时各自记录“代码、夹具、实际 CLI、网页打开、用户授权、指定对象读写”的验证层级。通过前一层不等于完成后一层。

## 5. 研究轮记录（历史，授权决策已在第 1 节更新）

- 已完成九家官方来源与现有飞书耦合点的只读核查，保存本清单。
- 未实现或注册新连接器；没有新增九张占位卡片，没有更改 manifest、宿主或共享 Skill。
- 未安装 CLI、执行授权脚本、读取真实账号配置、登录 / 授权或读写第三方资源；官方腾讯文档归档仅下载静态检查。
- 未变更现有飞书连接，未重启 Electron，未提交、推送、升级版本或部署服务。
- 待用户确认第 1 节的偏离路线后，按上述批次继续。整项 F146 保持 InProgress。

## 6. 首批实现与验证边界

- 宿主注册三个固定只读 adapter，独立包声明四家已实现连接器（含既有飞书），所有品牌图标离线嵌入。没有新增六家不可用的占位卡片。
- 复用会话绑定与 Partner run-scoped read 工具；新提供方无写入工具，混合飞书会话也不能借用飞书写入操作。默认旧记录为飞书，旧范围摘要与飞书审核流程保持兼容。
- 官方 CLI 由用户在可信弹窗确认后下载固定版本，校验完整性、隔离私有配置、禁止 shell/全局安装/自选 executable；授权挑战只存在宿主任务，不进入 iframe 或聊天消息。
- 三家均要求受保护的在线身份探针；资源必须由用户明确加入当前会话。企业微信按机器人身份，钉钉按 corp/user，腾讯会议按 OpenId，不能跨提供方冒用身份。
- 提供方证据和未验收项：[企业微信](f146-wecom-evidence.md)、[钉钉](f146-dingtalk-evidence.md)、[腾讯会议](f146-tmeet-evidence.md)。夹具测试、构建或卡片显示不代表真实账号授权及业务读取已成功。
- 当前没有代用户创建第三方账号、授权、批量扩权、读写真实第三方资源、部署回调服务。

### 最终验证（2026-09-01）

- 全量回归：3591 通过、4 条件跳过、0 失败；TypeScript、ESLint、renderer/main 构建、0.6.0 独立包构建均通过。
- macOS arm64 目录打包及 `smoke-pack` 通过，锁定公开 SDK 0.7.95；Space 仍为 0.1.45。
- 使用原隔离 Electron profile 将插件从 0.5.1 更新并启用至 0.6.0。真实 Electron 显示四家官方品牌卡片、飞书已连接及原 10 个专家；连接记录与用户专家文件在升级前后摘要一致。保留旧 0.5.1 归档可回退。
- 新弹窗与会话切换由组件/宿主测试覆盖。Computer Use 将真实窗口中的“连接”点击判为可能触发安装/授权而阻止，本轮未绕过该限制，未在真实窗口验证三个新弹窗及后续官方授权流程。由用户继续执行 TC-027/028。
- [双轴评审与修复记录](F146-multi-connectors-review.md)、[人工验收指导 TC-027–033](../test-guides/FEATURE_146_v0.1.61_TEST_GUIDE.md)。九家整体 F146 仍 InProgress。
