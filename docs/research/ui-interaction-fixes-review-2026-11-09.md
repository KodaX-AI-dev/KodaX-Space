# 交互修复双轴评审

基线 `ffeb9ed7`；评审以待提交的暂存补丁为固定产物，覆盖业务改动、相邻 UI 回归与手册。两名新上下文 Agent 分别评审 Standards 与 Spec，报告保持分离；发现由实施者修复后再次复核。

## Standards

硬违反：0。已逐文件、逐 hunk 对照 AGENTS.md、CONTRIBUTING.md、CONTEXT.md 和 ADR-004/010；新增请求明确由 Shell 持有，按会话/项目失效并消费，搜索异步操作有取消与过期保护，失败可见。

判断题：0。未发现可行动的基线坏味道、新增超长生产函数或无用抽象。既有长组件不计入本轮新增问题；工具强制项未重复评审。

## Spec

首轮发现 1 项 P1：RightSidebar 消费新 artifact 请求后，挂载时又恢复旧 File Viewer，覆盖目标。实测“打开文件 → 关闭侧栏 → 单击成果”仍展示旧文件，artifact.read 为空。违反成果打开方案中的“一次操作展示目标内容”和关闭重开目标约定。

实施者新增真实 Shell 回归，在暂存旧实现上验证 RED；最小修复为先恢复缓存文件，再应用本次显式请求。用例同时验证随后真正的新 File Viewer 请求仍能切换。Spec 再次实跑和复核：P1 已清零，新增 finding 为 0。E2E 适配保持单击直达并保留显式原文读取验证，未发现需求偏差。

Standards：0 finding；Spec：初始 1 项 P1，修复复核后 0 项未解决。执行过的验证与平台限制见[实施验收](ui-interaction-fixes-validation-2026-11-09.md)。
