# PF004 共享连接器能力验收

日期：2026-09-07。范围与状态见 [PF004 设计](v0.1.0.md#feature-pf004) 和 [Partner 台账](../FEATURE_LIST.md)。

## 实现边界

- 固定能力登记与资源投影由 `space-ipc-schema` 导出，Details/Composer 按已实现操作显示。飞书支持读取、追加、新建文档与 Base；其他六个已实现读取 adapter 保持只读；Slack/Zoom 不因旧绑定出现读取入口。
- 资料使用 `remoteSource/sourceId`，统一显示宿主保存的快照；内部引用不再作为网页载入。已有来源在账号断开后仍可查看，实际远端调用仍重新授权。
- Markdown 的链接发送在 `partnerLinkEvents.ts`；Shell 的会话检查、资料匹配和右栏打开在 `partnerLinkDetails.ts`。发送模块不加载资料 Provider。Coder 与明确外部打开保持原行为。
- 新文档、Base、追加提案仍复用已有任务、审核与回执；不添加万能命令、通用 invoke 或数据库迁移。网页去重适用于独立 browser 标签；资料快照和 Base 创建任务仍保留各自标签身份，未将任务生命周期合并为普通网页。
- Codex 的 `$space-connector-builder` 已更新：公共能力模式、真实提供方证据、现有代码接缝、资源/操作契约、分层测试与独立 forward-test。它属于开发环境，不安装进 Space 共享 Skill 库。

## 回归依据

1. 原资料路由将 Feishu/Notion/Airtable 引用全部作为 browser target；三种来源的任务卡→指定快照测试首先失败，随后通过。
2. 原 Markdown 将 HTTP 链接交给系统浏览器；用旧实现替换当前发送入口时，真实 Markdown→右栏回归失败，当前实现通过。
3. 原 Composer 对旧 Slack 可用绑定显示读取入口，且非法 file 引用成为可选目标；能力与资源投影接入后均被过滤。
4. 整体类型检查发现 Markdown 引入订阅 hook 后拖入 Provider 的依赖；将无 Provider 的事件发送独立后，Electron 类型检查通过。
5. 独立审查发现成果卡和聊天打开同一网页时标签重复；以规范网页地址统一去重，并检查打开请求被消费。
6. 受控 guest 回归覆盖网页内部跳转后重新打开原资源；显式导航递增 frame revision，避免只更新地址字段而不触发 guest 导航。真实 Electron 的旧包未复现该条件，复现证据来自生产组件的受控 guest fixture。
7. 资料总览的查看入口也使用同一个 `remoteSource` 详情目标，与任务卡、聊天保持一致。

## 验证记录

| 验证层级                | 结果                                                                    | 边界                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 完整测试基线            | 3,918 PASS，0 FAIL，4 平台跳过，共 3,922                                | `NODE_OPTIONS=--no-experimental-webstorage npm test`；收尾改动由下一行复验                                                            |
| 最终定向回归            | 54/54 PASS，0 跳过                                                      | 共享能力、配置/Composer、资料页/任务卡/聊天→详情、原追加审核、错误/迟到结果、标签去重和导航历史                                       |
| 最终工程检查            | typecheck、lint、build:smoke PASS                                       | 含 Electron 与 renderer 类型边界                                                                                                      |
| 独立 Extension          | build:partner-extension PASS                                            | library 仍为 `0.1.0`，未发布                                                                                                          |
| 本机 macOS arm64        | 最终 dir 产物与真实 Electron 流程 PASS；CLI 锁定资源/完整性/许可证 PASS | 独立测试档案，真实 IPC、本地合法 source 种子与 mock 会话；三来源正文、实际网页内容及内部跳转后重开验证通过；0 真实连接器调用/远端写入 |
| 开发 Skill              | 原版 quick_validate PASS；74 个引用存在                                 | 未安装进应用共享 Skill 库                                                                                                             |
| 独立 Skill forward-test | 两份可交接说明；定向 25/25 PASS                                         | 无真实账号/远端操作，识别分页与旧快照入模边界                                                                                         |

本机原始证据位于 `/Users/samharadelijiang/Documents/kodax Space/audits/connector-foundation/`，其中 `logs/` 保存测试与构建日志，`forward-test/` 保存独立试用和审查。测试脚本为同目录 `electron-smoke.mts`，仅使用隔离 profile 与本地 HTTP 页面。

## 独立审查与修正

- 能力/资源契约及其 UI 消费：独立审查无可行动发现；实现未改变宿主执行授权。
- 公共交互：成果/聊天重复 browser 标签已修复；受控 guest 重新打开回归已修复。修正后的独立审查无待处理发现。
- Base 任务页与普通 browser 标签合并建议保持在本次范围外：Base 任务生命周期及其已有展示行为保留；本次未宣称所有任务类型都合并为一个网页标签。
- Skill forward-test 发现事件模块路径正在变动，现已同步；并补充说明旧快照不会自动进入模型、跨会话、分页与来源关联须检查实际实现。
- 已保存本轮之前的工作区基线；13 个不在本次改动交集内的旧修复文件逐字节一致，其余交集通过原有回归验证。

## 桌面复核步骤

使用隔离测试档案，创建一个 Partner 会话并在本地连接器 store 放入三条格式合法的 Feishu 文档、Notion 页面、Airtable 表快照。逐项点击任务区资料，检查标题、来源、revision 与正文；内部引用不得创建 webview。切换会话、模拟加载失败与重试的细节由生产组件 fixture 覆盖。

在同一测试会话发送带普通网页链接的本地 mock 消息，点击渲染后的链接，确认右侧出现网页标签且地址一致。对成果卡与聊天相同地址的正反向点击，检查始终只有一个网页标签、原标签身份保留且请求已消费。

这些步骤不需要真实第三方账号。不要把本地快照种子、mock 模型或组件 fixture 当作 Notion/Airtable 的账号及远端读取验收。没有执行真实跨服务写入。

## 本地交付

- PF004 为 `Completed / Local`，未创建发布、PR 或 Space 集成事实。之前的飞书修复保留。
- 桌面产物：`out/connector-foundation-20260907/mac-arm64/KodaX Space.app`；未替换系统已安装应用。
- 截图：本机证据目录的 `electron-source-1.png`、`electron-source-2.png`、`electron-source-3.png`、`electron-chat-web-link.png`、`electron-webpage-reopened.png`。
- 本次未对 Notion、Airtable 或其他服务执行真实登录、远端读取/写入，也未声明跨服务旧快照自动入模或完整分页已经实现。
