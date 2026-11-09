# 历史分支恢复与清理：第三、四步

## 范围与实现

用户已确认：历史连续浏览与用户提问视觉强调在第三步恢复；在线文档共享预览、Whisper 听写、F144 拆分继续暂缓，相关分支保留。第一步与[第二步](branch-recovery-step2-2026-11-09.md)已完成。本轮基线 `a26a73d2`，运行时代码 `d5b7c0e7`，应用内帮助补齐于 `0ee42f7d`。SDK 继续锁定 Registry `0.7.97-beta.4`，Space 版本不变。

- **连续保存历史**：同一 revision/sourceRevision 内前插较早页、后接较新页，保留已读内容与两端未读游标。仅按 SDK opaque ID 消除页间重叠，不按文字去重；已读全文仍可用。普通向下滚动经过已读内容，不再重复读取或自动选择实时 view。
- **来源与位置**：当前 view 继续单独选择。跨来源衔接仍沿用唯一 SDK 身份验证，无法证明时显式打开；底部箭头显式返回实时末尾。搜索 around 创建独立阅读窗口，返回恢复原集合和位置。失败保留内容；修订、来源和失效 epoch 变化不混入新页，提示重新定位。已有 beta.4 v2 Fork/回退目标原样传递。
- **界面**：用户消息添加常驻本地化标签、浅色底与左侧强调边，保留长提问折叠、图片、全文复制和轮次操作。复制不含发送者标签。
- **清理**：旧诊断和已提取分支先归档再删除；四份研究原文明确标注历史状态后恢复。详见[完整分支归档清单](branch-cleanup-archive-2026-11-09.md)。不修改 `codex/alpha4-release-final`、其他现有工作树或 `design-demos/`。

## 红绿与行为回归

旧分页的公开生命周期用例先复现只剩 `oldest`，而期望同时保留 `oldest/middle/newest`；修复后通过。用户气泡先缺少固定标签，修复后通过。日志为忽略目录 `artifacts/diagnostics/step3-continuous-{red,green}.log` 与 `step3-query-{red,green}.log`。

公开分页层共 77 项通过，新增覆盖同修订双向扩展、两端游标、重叠 ID、已补齐正文、定位恢复和四种修订失效。真实 ConversationStreamV2 浏览器验证包括键盘/触摸/滚动条未读相邻页、已读反向免请求、原生鼠标按住跨两页、快速/稳定布局恢复、搜索与过期响应。一个旧测试的固定滚轮距离不足以滚过现在保留的三页，已改为按实际内容高度滚动；未延长超时或添加重试。

## 最终集成验收

| 检查             | 执行结果                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| 静态检查         | typecheck、lint、改动文件 Prettier、git diff --check 通过；帮助主题和最终 E2E 增量另做针对性检查           |
| 完整 npm test    | 4,747 通过、20 条件跳过、0 失败；Desktop 4,221/13 跳过，Schema 373，发布脚本 153/7 跳过                    |
| 生产构建         | npm run build:smoke 通过                                                                                   |
| 源码 Electron    | 20 个不同场景均通过，无重试；首次批次 19 通过，提问用例经下述测量修正后独立通过                            |
| Windows 目录包   | `node scripts/pack.mjs --win --dir` 通过；Registry、原生资源、asar Worker、SQLite、Host 协商完整性全部通过 |
| Windows 成品界面 | 同组 20 场景通过：打包内置真实 SDK/退出 7/7，额外历史/输出/恢复/提问 13/13，全部首次尝试通过               |

源码场景命令：

```powershell
npm run e2e:run -- tests/e2e/sdk-history-navigation.spec.ts tests/e2e/user-query-collapse.spec.ts tests/e2e/sdk-product-output.spec.ts tests/e2e/sdk-restored-history.spec.ts tests/e2e/sdk-unified-contract.spec.ts --retries=0
```

提问测试的两处新断言先暴露测量假设：Chromium 在桌面缩放下把声明 3px 的强调边计算为 2.4px（普通边 0.8px），以及 Windows 剪贴板返回 CRLF。独立 Chromium zoom=1.25 探针复现了边框取整。最终真实 SDK 用例检查强调边超过普通边两倍（气泡单测仍约束 3px 声明），复制仅归一化 CRLF 后逐字核对全文；没有放宽内容或增加重试。旧 Mock 用例换成真实 SDK 与本地 Provider，先观察实际请求与空闲，再检查可见提问和复制。

最终提问用例独立通过（10.7 秒）。浅、深主题截图已实际查看，标签、边框、正文、折叠入口和既有轮次操作均清晰可见；图保存在 `artifacts/diagnostics/step3-query-visual/`。最终测试增量提交 `914fa364`，两轴补审均无发现。运行时代码未因测量修正改变，不为 E2E 断言调整重复运行无关的完整 Node 套件。

日志：`artifacts/diagnostics/step3-{typecheck,lint,full-tests,build,e2e-source-initial,query-e2e-final,pack}.log`。额外成品日志为 `artifacts/diagnostics/step3-e2e-packaged.log`。冷启动 Renderer 5,094 ms 就绪，Runtime 在确定性延迟后 26,479 ms 就绪，122 条历史子进程记录保留。所有场景使用隔离桌面、临时资料与本地 Provider，没有真实连接器账号或远端文档操作，也未做本轮 macOS/Linux 实机验收。

## 清理结果

已删除 10 个本地、21 个远端过时分支；18 个远端归档标签均核对完整 SHA，四份研究原文保留。main 已快进接入全部验收代码；本轮临时开发分支已删除，提交由 main 保持可达。清理不改写 main 历史。

保留的本地分支为 main、dev、codex/alpha4-release-final、codex/ci-release-optimization、codex/queue-history-recovery；远端保留 main、dev、两条工作树分支及 feature/partner-maintenance-20260917。保护分支和三个现有工作树的 HEAD 与初始记录一致。工作区原有 design-demos/ 仍未提交。

## Standards

初审发现应用内 sessions 帮助主题未同步（CONTRIBUTING.md 文档条款），已在 `0ee42f7d` 补齐，11 项主题测试通过。独立复核剩余规范问题 0，坏味道发现 0，最高严重项无。只读审查范围 `a26a73d2...d5b7c0e7` 加帮助文档补充；不替代自动化验收。

## Spec

独立审查发现 0，最高严重项无。同修订双向保留、两端未读游标、SDK ID 身份、全文缓存、定位返回、来源隔离、修订保护与显式返回实时符合当前历史设计及回归指南。用户标签不进入复制文本，既有折叠、图片与轮次操作保持，未混入暂缓范围。实际锚点与平台结果以最终验收表为准。

## 留待讨论的问题

| 事项             | 当前事实                                                                                           | 建议下一步                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 在线文档共享预览 | 原始提交 `72042411`，在 `origin/feature/partner-maintenance-20260917`；现有外部打开行为保持        | 单独设计窗口、IPC、导航与预览组件的集成，不整分支恢复                                     |
| Whisper 听写     | 原始提交 `0902cc52`，同一维护分支；本轮未启用                                                      | 按完整新功能评估模型安装、支持平台和录音体验                                              |
| F144 长会话规模  | `dev` / `origin/dev` 的设计与任务拆分保留；主线仍为后续规划。连续保存页的 DOM 与缓存随已读范围增长 | 先测真实长会话；若瓶颈在布局/DOM，再按万行挂载 ≤500、稳定锚点漂移 ≤2px 的既定目标做虚拟化 |
| 既有 Issue 225   | 间歇冷启动超时仍为 needs-info；本轮正常启动不能证明原始延迟根因已消除                              | 复现时收集现有 stage_timing 与 daemon 启动时间线，不调整安全期限或删除历史                |
| 既有 Issue 238   | AgentModeSelector 浏览器用例此前偶发超时，根因未确认                                               | 单独定位焦点与异步确认状态；一次通过不关闭问题                                            |
| dev 跟踪关系     | 本地 dev 与 origin/dev 同为 `947e004f`，但本地 upstream 仍指向 origin/main，本轮保留原配置         | 后续明确 dev 工作流后决定是否改为跟踪 origin/dev；不因落后数量直接合入旧设计              |
| 平台与外部账号   | 本轮环境为 Windows；本地模拟 Provider/隔离资料不等同于 macOS/Linux 实机或真实连接器账号验收        | 发布前补相应平台 CI/实机与真实授权场景                                                    |

以上不表示仓库其他既有问题全部关闭。本轮不发布 Release 或安装器。
