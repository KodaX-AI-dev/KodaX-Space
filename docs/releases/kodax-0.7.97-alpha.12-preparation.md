# alpha.12 候选 SDK 的 Space 适配

2026-11-02。用户授权在 SDK 正式发布前准备 Space 源码，发布通知后再安装正式包并闭环。SDK 基线 `f24a922c117e0ece5d26224a133a69973b313ab6`；本地候选 tarball 仅在隔离工作区测试。根/Desktop manifests 与正式 lockfile 仍保留原 Registry alpha.11，不能据候选验证宣布 Registry 升级完成。

采用现有 typed IPC、可信 Main 的单一 RuntimeHostAdapter 和 SDK Product/Runtime 公开边界。Partner 使用通用 Agent；不再按 surface 身份禁止 shell、写文件或子 Agent。权限模式、实际审批、工作区、沙箱、显式管理员/连接器策略仍决定操作是否可执行。

凭证基础复用独立 `codex/provider-credentials-space@7b37e1c8`（含 065cc39c/437cac7d/da531f0a），保留历史验收记录，合并后的结果另记。原主工作区的 fixture 和 research 文件保持原样。

## 逐项接入与验收

| SDK 变化                | Space 工作及公共验证边界                                                                                  | 当前状态             |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | -------------------- |
| 统一共享 Host           | 撤下 embedded 设置/owner 控制；Coder/Partner 创建、执行、历史、变更和恢复同属 Host；不增加 Session writer | 待实施               |
| Main 授权               | provider_probe 单独收窄；完整传递 identity/createExecutionProfile；profile 可信构建，Host 换代重绑 lease  | 待实施               |
| Partner persona/工具    | Agent 默认、保留专家/连接器/Artifact 业务绑定，移除身份硬禁 shell；实际权限不放宽                         | 待实施               |
| 实际执行配置            | IPC/UI 保留 Run workMode/effectiveConfig；缺失保持未知，不从 Session 补造事实                             | 待实施               |
| Provider/凭证           | 合入账号来源固定与 CAS/墓碑/旧备份；初始化保护文件后开放执行；broker 使用实际连接证明和 Host 身份         | 已合入，组合验证待做 |
| OAuth/云与 preset       | 保留原账号与配置，认证和配置/在线验证分开；SDK scope 获取，不重放失败生成                                 | 已有基础，需核实补齐 |
| canonical/nativeHistory | Fork/Retry/Rewind 交 Host；仍需复制/转换的持久消息保留完整原生字段；编辑后失效绑定                        | 待核实               |
| Effort                  | 选项与 activity.reasoning 实际 requested/sent 分开；主请求身份过滤，未知/verified:false 如实呈现          | 待实施               |
| 图片/费用/统计          | 模型级 multimodalSupport；cost null/已知小计/未知及nominal计数；partial/cursor conflict 不冒充完整        | 待实施               |
| 工具/Skill/MCP          | Host registry/目录、原文公开分页、完整审批计划；保留既有等待/任务报告语义                                 | 既有接入，需组合回归 |
| 配置/错误               | application 生效边界、损坏配置诊断及重试；不重置或换默认账号                                              | 待实施               |
| 维护/生命周期/分发      | 修复个人退出与Host停止证据混用；可信sandbox激活；完整worker/native资源、性能与Peer保护                    | 待实施               |
| 独立 LLM 操作           | SDK 新操作不自动变成模型工具；按现有产品需要接入，不为覆盖SDK导出逐一新增入口                             | 核对范围             |
| GC/修复                 | 不增加TTL删除、前台扫盘或自动确认存储修复；继续保留未知效果与原件                                         | 保留                 |

测试沿已有 Session/Provider IPC、Host adapter/settings、canonical历史及实际 Electron UI 接缝逐项先红后绿；候选测试使用独立 profile/本地 Provider，不读写用户凭证或真实会话。正式包发布后另核对完整分发字节、实际Host能力、安装包和客户历史回归。

## SDK 协作边界

当前候选的 Product input 没有可信的“专家默认方法 Skill”声明，profile builder 只承接 persona/验证/工具限制；原 Space 在派发时选最新专家的方法和排队角色时点需核对，不以拼接 Skill 名或私有执行路径冒充等价。若缺少公开接缝，将以最小复现和明确需求记录，Space 可独立工作继续推进。

## 验证记录

实施与检查进行中。源码、候选安装、Registry正式升级和产品已启用分别记录，不把早期独立分支的通过数字当作本次组合验收。
