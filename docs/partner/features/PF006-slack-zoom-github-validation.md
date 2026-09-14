# PF006 Slack、Zoom、GitHub 首版接入

2026-09-07；Partner `v0.1.0`，library `0.1.0`。基于 `integration/partner-upstream-20260904-v0.1.0@241a6de` 加已有 PF004/PF005 工作区，保留原有修改。本文记录本地实现，不代表真实服务验收或 Space 主线集成。

## 已实现能力

| 服务   | 官方授权前提                                                                                                                            | 首片读取范围                                                                                         | 右栏                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Slack  | 自有且已安装的 Slack App 的 Bot/User OAuth Token，相关 `*:history` 权限；Bot 需在频道内                                                 | 精确选定的单条消息文本；不含线程回复、附件正文、交互块、搜索或发送                                   | 已保存快照；选定 HTTPS permalink 可打开网页                           |
| Zoom   | 管理员创建、启用 Server-to-Server OAuth App，Account ID、Client ID、Client Secret，`meeting:read:meeting:admin` 或 `meeting:read:admin` | 指定会议 ID 的主题、议程、时间与时长；无录制、转录、参会人、创建会议                                 | 已保存快照；无 query 的 `/j/<ID>` 网页链接可打开。内部 ref 不猜测地址 |
| GitHub | PAT，建议限选定仓库的 Fine-grained Token，Contents、Issues、Pull requests 按需只读；组织可能需批准                                      | 仓库基本说明及默认分支 README、精确 Issue/PR 正文及状态；无评论、diff、全库索引或写入，仅 GitHub.com | 已保存快照和选定 HTTPS 网页                                           |

目录共 13 项有基础能力实现。Slack/Zoom 保留旧 adapter ID `slack-mcp` / `zoom-mcp`，实际走固定官方 Web API；GitHub 为 `github-api`。没有借用第三方客户端凭据，没有声称无需自建应用的一键 OAuth。普通网页登录状态与连接器凭据独立。

## 官方依据

- [Slack MCP 授权与客户端前提](https://docs.slack.dev/ai/slack-mcp-server/)、[auth.test 身份](https://docs.slack.dev/reference/methods/auth.test/)、[单条消息读取和历史权限](https://docs.slack.dev/reference/methods/conversations.history/)：使用官方 Web API 的受限方法，无任意 MCP tool 转发；未加入的频道或缺 scope 由官方响应拒绝。
- [Zoom S2S OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/)、[Meeting API](https://developers.zoom.us/docs/api/meetings/)：固定账户凭据交换、只验证已授予的管理员读取 scope，再 GET 指定 meeting。access token 只在调用内存存活，持久化的是用户自有应用凭据。
- [GitHub REST 身份](https://docs.github.com/en/rest/users/users?apiVersion=2026-03-10)、[README](https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10)、[PR](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2026-03-10)、[限流](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)：API version 固定 `2026-03-10`；不访问任意 download_url，README base64 完整解码并校验 size，403 带限流头按节流处理。
- [GitHub 官方品牌](https://brand.github.com/foundations/logo)：原始 SVG 本地存储，目录内嵌相同 bytes。Slack 延续已有通用图标，不重画商标。

## 宿主与资料契约

- 凭据只通过主 frame 的临时 `onboarding.submit` 输入；任务公开状态不含 secret。密码字段提交前清空，关闭/切换时销毁。身份验证成功后才写凭据存储，取消发生在持久化期间会删除新凭据；断连检查删除结果并清理旧 OAuth key。
- HTTP 固定官方主机、拒绝重定向、30 秒超时、1 MiB 流式响应上限；无自动重试。资料正文仍限 128 KiB，超限不保存截断正文。
- 每次业务请求重过 service 的异步授权与同步分派 guard。GitHub 仓库与 README 是两次受控读取，前一步后撤销会阻止后一步。身份变化、错误 ts/meeting ID/repository/issue number、迟到结果都拒绝。
- Zoom 主持链接、密码和带密码的 join_url 不进入资料或模型。资源 schema 禁止 query、fragment、外部主机与路径越界。
- 对话中的已保存来源先开快照；未保存的 HTTPS 可开浏览器。提供方链接在本地 records 加载期间保留点击意图，加载完成后只在原上下文解析；新点击或会话切换取消旧意图。只打开详情不会发起远端读取。

## 验证证据

审计目录：`/Users/samharadelijiang/Documents/kodax Space/audits/connectors-slack-zoom-github/`。

- `baseline/` 保存本轮开始前 75 个已有修改文件与差异，便于区分 PF004/PF005 和本轮内容。
- 资源 schema/共享能力测试先失败后通过，保留 strict resource 与主 frame 输入约束。
- `api-connectors.test.ts`：固定官方请求、权限、身份、精确资料结果、有界响应、错误脱敏、取消时清理凭据、删除失败、GitHub README 的二次 guard 与限流错误。
- `api-connector-service.test.ts`：真实 onboarding Tasks、Service、adapter、Store 与 run-scoped runtime；三家均读取成功，重启恢复、他会话隔离、分派前后撤销、身份变化和断连通过。只替换 HTTP 和凭据后端，不用宽松 adapter 回调假装 service 成功。
- 浏览器组件：新表单字段/秘密清理、13 项目录配置、新旧服务回归、资料页→快照→网页、聊天→同一快照；没有远端读写。共享浏览器保留隐藏 tab，按可见 panel 验证。
- 独立 forward-test：`independent/REPORT.md`、`forward-ui.mjs`、`forward-host.mjs`。独立验证复现“records pending 时跳过快照”的 P2，修复后作者增加正常加载、新点击和切会话回归。
- 最终全量 `NODE_OPTIONS=--no-experimental-webstorage npm test`：**4,011 PASS / 4 平台跳过 / 0 FAIL**（release 66、desktop 3,586、schema 359）。`full-tests-final.log` 保留完整结果。首次失败包括旧占位断言与新增 fixture 的可见 tab/资料页选择器，修正测试后全量通过。
- `typecheck.log`、`lint.log`、`build.log`、`plugin-build.log`：类型、lint、build:smoke 与独立插件构建通过。首次 lint 与 release 的临时目录清理并发冲突，待 release 完成后重跑通过，没有修改 lint 规则。
- `api-coverage-final.log`：12 项宿主/transport 定向测试通过，新增 API 文件行覆盖 96.43%、分支 86.32%、函数 97.50%。覆盖率不代表真实服务可用率。
- 独立复测 `independent/ui-retest-results.json`：10/10 通过；三家 pending 记录后自动打开快照，新普通网页、新会话、连续多次点击均保持最后一次有效意图。首次失败证据保留。
- `electron-smoke.mts` / `electron-smoke.log`：实际新打包的 macOS arm64 app、隔离测试 profile、真实主进程与 IPC。13 张目录卡；Slack/GitHub 密码令牌表单、Zoom 三字段表单显示正确并可取消；三家已保存资料在右栏显示，再进入各自网页 tab。已人工查看原始桌面截图。无真实凭据提交或连接器远端调用，网页 DNS 被隔离阻断，仅验证导航。
- 首次 native harness 使用英语按钮定位，而隔离应用实际采用中文，因此超时；保留 `first-native-harness-locale/`，将 harness 改为双语定位后完整通过，产品无需修改。所有临时 profile 已清理；Node SQLite ABI 已恢复，原运行应用未关闭。飞书打包组件资源校验通过（darwin-arm64 / 1.0.92）。

## 本地产物

- 桌面：`out/connector-slack-zoom-github-20260907/mac-arm64/KodaX Space.app`（本地未签名构建，未替换 `/Applications`）。
- 插件：`out/extensions/kodax.partner-library-0.1.0.space-extension`。
- 截图：审计目录 `electron-thirteen-connector-cards.png`、`electron-{slack,zoom,github}-credentials.png`、`electron-{slack,zoom,github}-snapshot.png` 与 `electron-{slack,zoom,github}-web-sidebar.png`。
- 开发方法：Codex `space-connector-builder` 的 `references/host-and-cli.md` 与 `references/interface.md` 已补上自有应用输入、固定 API、多请求 guard、敏感返回字段舍弃和加载期间链接重放经验。

## 真实账号验收步骤（尚未执行）

1. 在本地构建的 Partner 目录选择服务，查看对应前提后连接。真实凭据由用户直接输入宿主弹窗，勿发到模型对话。
2. 完成官方验证后，在原会话开启连接并设置资源范围：Slack 官方消息 permalink（去掉 query/fragment）、Zoom `/j/<ID>`（不要粘贴 `pwd`）或 `zoom://meeting/<ID>`；GitHub 仓库根链接或 `/issues/N`、`/pull/N`。
3. 点击读取，确认正文与目标一致；在资料和对话里打开同一快照，再点击“打开网页”。页面登录独立完成，不把网页可见当成 API 读取通过。
4. 验证一个无权目标和一个范围外目标确实拒绝；停用本会话后无法再读取，历史快照仍可查看。断开账号只删除 Space 本地凭据，不远程撤销自有 App/PAT。

三家没有真实账号验收证据；只有用户先前明确确认飞书实际使用过。未发布、推送、替换 `/Applications` 或合并 Space。
