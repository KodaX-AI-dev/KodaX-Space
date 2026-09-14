# F146 官方办公连接器：Notion、Airtable、Atlassian、Slack、Zoom

核实日期：2026-09-02。实现仅信任官方远程 MCP、官方 OAuth 元数据和宿主固定配置；本轮没有使用真实企业账号做线上业务 E2E，因此不能把本地合约测试表述成真实账号验收。

## 交付状态

| 平台      | 当前状态                    | 官方入口                                     | 首版资源范围                                                                                    |
| --------- | --------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Notion    | 可发起 OAuth 2.1 + DCR/PKCE | `https://mcp.notion.com/mcp`                 | `notion://page/<32位小写十六进制ID>`；固定 `notion-fetch`，`id=self` 只用于身份确认             |
| Airtable  | 可发起 OAuth 2.1 + DCR/PKCE | `https://mcp.airtable.com/mcp`               | `airtable://base/<appId>/table/<tblId>`；固定读取一页、最多 25 条；暂不覆盖 Interface-only 页面 |
| Atlassian | 可发起 OAuth 2.1 + DCR/PKCE | `https://mcp.atlassian.com/v2/mcp`           | 可粘贴授权站点的 Jira 或 Confluence 常规页面 URL；宿主内部映射为 `cloudId`                      |
| Slack     | 配置前置，未伪装可连接      | `https://mcp.slack.com/mcp`                  | 官方服务不支持任意客户端动态注册；需 KodaX 自有且获批的 Slack App                               |
| Zoom      | 配置前置，未伪装可连接      | `https://mcp.zoom.us/mcp/meeting/streamable` | 需 KodaX 自有 Zoom General App、回调配置及相应发布/审核条件                                     |

Notion 当前官方文档明确允许 `notion-fetch({ id: "self" })` 返回 workspace 和已认证用户，用于给连接标注真实账号。Airtable 官方文档给出的只读 scope 为 `data.records:read`、`schema.bases:read`、`data.recordComments:read`、`workspacesAndBases:read`；宿主另用固定的官方 `/v0/meta/whoami` 端点取得稳定 OAuth 用户 ID，workspace 集合只作为权限范围。Atlassian v2 将 Jira、Confluence 读取能力分别放在 `read:jira:agent-interface` 与 `read:confluence:agent-interface` 权限组中，并把 `atlassianUserInfo`、`getAccessibleAtlassianResources`、`getJiraIssue`、`getConfluenceContent` 列为主工具。

来源：

- [Notion MCP 连接说明](https://developers.notion.com/guides/mcp/get-started-with-mcp)；[Notion 支持工具](https://developers.notion.com/guides/mcp/mcp-supported-tools)
- [Airtable MCP 官方说明](https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server)；[Airtable 官方 CLI](https://github.com/Airtable/airtable-mcp-cli)
- [Atlassian v2 支持工具](https://support.atlassian.com/atlassian-ai-gateway/docs/supported-tools/)；[v1 → v2 升级说明](https://support.atlassian.com/atlassian-ai-gateway/docs/how-to-upgrade-from-atlassian-rovo-mcp-v1-to-atlassian-rovo-mcp-v2/)
- [Slack MCP 官方说明](https://docs.slack.dev/ai/slack-mcp-server/)
- [Zoom MCP 官方说明](https://developers.zoom.us/docs/mcp/)；[Zoom 官方 MCP registry](https://github.com/zoom/mcp-registry/blob/main/zoom-meetings/server.json)

## 宿主安全边界

- endpoint、OAuth scope、授权/换 token/注册地址和工具名全部位于 Electron main 的固定 provider 定义；manifest、renderer、独立插件页和模型都不能提供或覆盖这些值。
- OAuth 采用 S256 PKCE、随机 state、临时 `127.0.0.1` 回调、5 分钟页面有效期和端点精确白名单。DCR 返回的 client secret（Atlassian 可能返回）与 access/refresh token 一起写入 Space 的系统保护凭据库；不使用 KodaX SDK 的明文 token 文件。
- 每个 profile 使用独立凭据键与 MCP cache；断开连接会先撤销本地连接、等待在途读取收敛，再删除该 profile 的 OAuth 凭据。Slack/Zoom 遗留记录使用单独的 `forget` 路径：仅允许这两个配置前置适配器，要求界面提交当前 connection revision，并在首次事务中做 CAS；凭据清理与 connect 的最终提交按连接器串行，远程身份验证不占锁，清理前后 generation 变化会拒绝期间启动的连接提交。宿主删除固定的 Slack/Zoom legacy 系统凭据键并复读确认，清理失败就立即发布不可用 revision 并保留记录供重试，成功且 revision 未变化后才从持久层删除。
- 每次调用先在线 `tools/list`，校验固定 capability ID 与已审 schema；任一工具缺失、重名或 schema 漂移都停止。未列入的搜索、写入和删除工具不可调用。
- 业务读取前重新验证 provider 身份和站点范围，在真正 dispatch 前后再次检查会话授权；结果合计超过 128 KiB 时整体拒绝，不把截断内容冒充完整资料。
- 只把用户在当前会话明确加入的规范化资源交给模型；不把 token、授权 URL、原始 provider 日志或任意工具描述投影给 renderer/插件/模型。

## Slack 与 Zoom 为什么没有“先做一个假连接”

两家的官方 MCP 都需要产品方预注册 OAuth 应用。Slack 需要固定 Slack App，并受工作区内部批准或 Marketplace 分发条件约束；Zoom 需要 General App、固定回调地址及对应应用配置。当前仓库没有可合法发布的 KodaX 产品级 client 配置，所以界面只显示缺少的前置条件并禁用连接按钮；IPC 即使被直接调用也会以固定 `configuration_required` 错误关闭。若本地存在旧版本留下的 Slack/Zoom 账号，界面只提供“移除本地账号记录”，并调用受适配器白名单、revision CAS 和凭据删除验证约束的持久化删除接口，不会把旧记录当作有效连接；失败后会刷新为最新不可用 revision，允许再次清理。具备正式应用身份后，应在新的安全评审中补 client 配置、scope、回调、凭据轮换、断开/撤销语义和真实账号验收，而不是复用本次 DCR 路径。

## 验证范围

本地测试覆盖 OAuth discovery/DCR/PKCE/state/回调/刷新/断开/竞态，provider endpoint 与工具白名单，live schema 漂移关闭，账号变化、站点越权、会话撤销、结果大小，资源 schema、服务层断开清理，以及 Slack/Zoom 配置前置状态、stale revision 拒绝、legacy 凭据删除失败与重试、并发重连串行化和持久化删除后重载。Renderer 测试覆盖远程 OAuth 不出现 CLI 安装、Slack/Zoom 禁用且不显示已连接、遗留记录刷新后不复现、品牌与中英文文案。真实账号验收仍需分别使用有权限的 Notion、Airtable、Atlassian 租户完成，并且不得在仓库、日志或截图中保存 token、授权码或私有内容。
