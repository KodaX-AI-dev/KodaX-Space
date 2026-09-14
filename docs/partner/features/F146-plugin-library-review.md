# F146 P1–P3 独立代码评审

日期：2026-08-31。固定点：`53ffa34188b4194b64197f69c14c228cc0a57f5f`；范围为本次工作区 diff 与新增文件，需求来源为 [Partner 插件库计划](v0.1.61-partner-plugin-library.md)。

两轴独立审查，修复后分别复核。排除先前用户修改的 `ChipBar.tsx`、`shellChromeProjection.ts`、`shellChromeProjection.test.ts` 及构建图标 `resources/icon.png`。

## Standards

1. 已关闭 P2：`electron/space-extensions/experts.ts` 的读取曾绕过写入队列，在 Windows 原子替换空窗中误报专家消失。公开目录/解析/可用性检查现共用同一队列；真实 EPERM → link 延迟夹具验证提交前等待、提交后新版可见，旧会话快照仍可用。
2. 已关闭 P2：`electron/ipc/session.ts` 的选择校验曾在持久化队列之外，早发慢选择可覆盖已确认的后发移除。现按会话将验证和提交串行，提交后的慢可用性查询不占队列；真实 IPC、Host、磁盘与前端绑定回归均保持最终移除结果。

已独立补审新对话统一动作、frame 限制、Coder 分类和内存凭据隔离。稳定范围 174 项定向测试通过；最后新对话 delta 的 50 项 UI 测试、7 文件 lint 与 diff 检查通过。没有新增开放项。

## Spec

1. 已关闭 P2：菜单、快捷键、命令面板和项目行的新对话曾只设置空会话，遗留专家草稿并接受旧创建响应。五个实际入口现统一同步失效专家草稿、关闭库视图、拒绝旧 ACK，同时保留正文；SDK 新对话动作亦接入统一入口。
2. 已关闭 P2：合法 2 MiB 原始 HTML 加安全封装后超过 bootstrap 的同一限制，页面会空白。原始字节限制与传输字符预算现分开；真实 wrapper 与 bootstrap 的精确边界正向回归通过，越界消息仍拒绝。

最终覆盖 82 个范围文件；独立运行 33 项后端聚焦测试及 6 项浏览器入口测试通过、无跳过。会话串行化、Partner-only 分类和内存后端隔离未引入需求偏离。

汇总：Standards 历史 2 项 P2、当前开放 0；Spec 历史 2 项 P2、当前开放 0。评审不替代真实 Electron、打包启动和第三方服务验收；P4/P5 未完成，F146 保持 InProgress。
