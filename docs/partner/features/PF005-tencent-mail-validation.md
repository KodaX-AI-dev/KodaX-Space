# PF005 腾讯文档与个人邮箱验收记录

日期：2026-09-07。基线：`241a6de` + 原飞书修复/PF004 本地改动。新增代码尚未合入 Space 主线、未发布。原有 37 个改动文件的副本保存在工作任务的 `audits/connectors-tencent-mail/baseline/`，未回滚原功能。

## 已实现首批能力

| 连接器   | 授权与身份                                                                           | 业务能力                                             | 首批边界                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 腾讯文档 | 官方网页授权，用户显式完成后交换 token；系统 Keychain；受保护 MCP 校验、凭据摘要绑定 | 指定文字文档读取、在个人首页从 Markdown 新建文字文档 | 仅 `https://docs.qq.com/doc/<id>`；标题最多 36 Unicode 字符；未实现搜索、编辑既有文档、表格或幻灯片；显示授权连接，不能宣称核验 QQ/微信昵称 |
| 网易邮箱 | `@163.com` 及客户端授权码，固定官方 TLS IMAP                                         | INBOX 搜索/分页、读取纯文本快照、附件名称/类型/大小  | 仅 163，不含 126/yeah/VIP/企业邮箱；无发送、删除、移信、设已读或服务器草稿                                                                  |
| QQ 邮箱  | `@qq.com` 及客户端授权码，固定官方 TLS IMAP                                          | 与 163 共用搜索、读取和 MIME 链路                    | 不含 Foxmail、企业邮箱或别名；无 SMTP                                                                                                       |

三家复用目录、可信连接窗口、账号 revision、会话范围、资料记录与右侧详情。搜索单次最多扫描 500 个 UID 位置、返回 25 封头信息，显式翻页可继续更早范围。邮件读取使用 EXAMINE、UID 与 BODY.PEEK；原始邮件（含附件）最多 2 MiB，快照正文最多 128 KiB。超限拒绝，不将截断正文报告为完整内容。HTML 转纯文本，不执行邮件 HTML、附件或外部图片。

邮件回复沿用现有 `create_artifact`，在会话中生成含收件人、主题、正文与源引用的本地 Markdown 草稿，支持共享 Artifact 预览与修改；不代表保存到邮箱草稿箱或已发送。

腾讯文档沿用共享持久任务、账号/范围/计划模式检查与提交门。相同 run、账号、范围及内容重复调用复用同一任务；提交结果不明保留 `unknown`，不自动重试。成功回执和内容验证分别展示，正文未回读验证时明确显示 `unverified`，真实资源链接仍可在共享右栏打开。

## 来源与实现路径

- 腾讯文档：[官方 MCP](https://docs.qq.com/open/document/mcp/)、[官方 Skill](https://docs.qq.com/open/document/mcp/skill/)、[官方组件包](https://cdn.addon.tencentsuite.com/static/tencent-docs.zip)，本次核验版本 1.0.41。固定 general/doc 两个 MCP 端点与精确工具 `manage.query_file_info`、`get_content`、`create_with_markdown`；不执行 setup.sh、不安装全局 mcporter。授权使用官方流程，Authorization 头为原始 token。
- 邮件协议：[ImapFlow 官方 API](https://imapflow.com/docs/api/imapflow-client/)、[MailParser 官方文档](https://nodemailer.com/extras/mailparser)。生产依赖固定 `imapflow@1.7.8`、`mailparser@3.9.22`、`html-to-text@10.0.1`。网易 `imap.163.com:993`，QQ `imap.qq.com:993`，TLS 服务端证书校验开启。
- 主要实现：`apps/desktop/electron/partner-connectors/{mail-connector,tencent-docs-connector,tencent-docs-protocol}.ts`；接线在同目录 `service.ts`、`runtime.ts`、`connection-tasks.ts` 与 `electron/kodax/partner-connector-runtime.ts`。
- 可信输入只经主 frame 的 `partner.connectors.onboarding.submit`，当前任务所有权与输入类型匹配、一次消费；取消/到期清理等待。凭据不进入 public job、普通连接记录、插件 frame、模型或日志。
- 方法沉淀：Codex `space-connector-builder/references/host-and-cli.md` 更新可信输入、MCP/IMAP、同编号多账号、完整调用链验证和通用创建任务经验。

## 回归验证

重点回归均经历失败→修复→通过，测试对象包含生产组件与真实 service/SDK，模拟提供方网络响应：

- provider 协议：官方授权页面/工具 schema、token、取消与迟到响应、受保护验证、body/receipt 校验；邮件固定域名、域限制、PREAUTH 拒绝、只读 EXAMINE/BODY.PEEK、UIDVALIDITY、窗口与 cursor 绑定、MIME HTML+附件、过大数据和安全错误。
- 可信调用：主 frame 所有权、输入类型/一次提交、公共 job 无凭据；adapter 与真实 service 的权限门顺序；会话、账号与策略撤销阻断迟到结果或提交。
- 新建任务：缺少范围、计划模式、持久提交前后撤权、错误 provider/目录、重复和并发调用、无效/未知回执、重启回执和局部失败。
- 真实 SDK：腾讯文档创建工具仅出现在当前授权 run；工具调用到宿主回执；中途撤权后阻断、下一轮消失、无全局工具注册。
- 组件：12 项目录与独立插件包、邮箱密码型授权码表单、腾讯网页完成按钮、INBOX 保存与查询、页码续查、切会话丢弃响应、读取到共享 source、腾讯创建范围、右栏路由。
- 多账号内部引用：两个 QQ 账号同 UIDVALIDITY/UID 的裸引用不能默认打开首份快照；提示从资料列表选择。显式 sourceId 卡片保持可用。

全量回归通过 **3,991 PASS / 4 平台跳过 / 0 FAIL**（release 66、desktop 3,568、schema 357）。类型检查、全仓 lint、`build:smoke`、Partner 独立插件构建通过。原生邮件协议、提供方→service 与实际 SDK 测试均包含在该次回归。

隔离 macOS arm64 / Electron 42.5.0 打包窗口验证：实际安装最新插件，目录 12 项；两家邮箱打开真实可信输入流程并取消，未提交凭据；临时账号元数据展示 INBOX 范围；三份临时来源经真实 IPC 进入共享资料详情；腾讯创建回执进入右侧网页视图。腾讯域名在该测试中被阻断，仅证明链接/路由，不代表官网内容加载或实际创建成功。测试关闭自有子进程并清理临时配置。初次视觉检查发现域名文案过宽，已限定为实际支持的 163.com / qq.com，补充失败→通过的域名声明回归，重新构建并通过最终桌面复验。

提供方真实账号登录/搜索/读取/写入仍未执行。最终文案修正后的定向 UI **40/40**、插件归档 **3/3**、Renderer 类型与局部 lint 通过；重打包后的隔离 Electron 再次通过，现场断言和截图都确认仅 163.com / qq.com。最终包的飞书 CLI 资源检查仍通过（darwin-arm64、1.0.92）。证据与截图在本地任务 `audits/connectors-tencent-mail/`，初轮错误文案截图保留在 `first-native-before-domain-copy-fix/`。

## 本地产物

- macOS arm64 未签名调试应用：`out/connector-tencent-mail-20260907/mac-arm64/KodaX Space.app`。
- Partner 插件：`out/extensions/kodax.partner-library-0.1.0.space-extension`。
- 使用新连接器需要本轮宿主构建和更新后的插件同时到位；只更新插件不足以给旧宿主增加新 adapter。
- 本轮未替换 `/Applications` 中的应用、未发布、未合并上游。

## 真实账号人工测试步骤

这些步骤尚未执行，不以 fixture、公开端点可访问或模拟截图替代：

1. 使用本轮构建的 Space 和 Partner Library 0.1.0，在 Partner 连接器目录打开腾讯文档；完成官方 QQ/微信授权后回到 Space 点“已完成授权”。确认显示授权连接且没有泄露 token。
2. 在持久会话选择该连接，添加自己有权读取的 `/doc/` 链接并保存；让 Partner 读取，核对正文和右栏快照，再点网页链接核对原文。
3. 为该会话开启新建文档，让 Partner 创建一个短测试文档。核对官网标题/正文、Space 回执与右栏链接；内容验证为未验证时不得当成已逐项核实。
4. 网易 163、QQ 分别先在各邮箱设置开启 IMAP 并获取客户端授权码。在 Space 输入对应邮箱地址和授权码；不要输入网页登录密码。
5. 将该账号的 INBOX 加入会话并保存，搜索已知主题/发件人，显式打开结果。核对中文/HTML 邮件正文、附件信息、日期，观察邮箱已读标记应保持不变；翻页核对扫描范围和游标。
6. 让 Partner 为已读取邮件起草回复，核对本地 Artifact 的收件人/主题/正文；确认邮箱服务器没有收到发送或草稿写入。
7. 切换会话、移除 INBOX/文档范围、断开账号，确认不能继续查询/远端读取；已保存本地资料作为历史快照仍保留。断开仅删除 Space 凭据，邮箱授权码需到邮箱设置自行吊销，腾讯远端授权也需到官网管理。

当前真实账号状态：飞书仍是用户已确认实测的连接器；新增三家均未进行真实授权与业务读写验收。
