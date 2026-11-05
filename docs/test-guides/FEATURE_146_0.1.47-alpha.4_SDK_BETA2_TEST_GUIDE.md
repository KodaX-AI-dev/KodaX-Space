# SDK beta.2 Space 回归指南

本指南针对当前工作树，公开 alpha.4 安装包仍使用 beta.1。执行结果见 [接入记录](../releases/kodax-beta2-space-adaptation.md)。测试须使用独立 profile 和本地 Provider，不读取真实用户凭据。

1. `npm ci`、`npm ls @kodax-ai/kodax`：Root/Desktop 只有 beta.2，打包 Registry 原生资源和 builtin Skill 门禁通过。旧忙碌 Host 拒绝强制替换，保留其他客户端。
2. Coder 首次输入前选择 Agent/Coding/Script；模式与 Provider/权限独立，忙碌或过期 revision 拒绝切换。Partner 显示 Host 实际模式，下一次执行提交 Agent 要求，另一客户端在授权后修改时必须由 Host 原子拒绝。
3. `e2e/beta1-sdk-acceptance.mjs`：16 位专家 persona/默认方法、显式 Skill 仅本轮、消费时采用已提交业务选择、禁用/撤销、promotion 已有/新增/第二客户端观察者、Host 诊断/预热及旧队列完整撤回。
4. `e2e/beta1-cold-queue-acceptance.mjs`：真正的 Main 正常关闭和强制终止，新的 Main PID 保持原 principal 和 inputId，原 Host 不重启，长文只消费一次。不得通过取回再自动重发掩盖失败。
5. `tests/e2e/sdk-ui-contract-acceptance.spec.ts`、`workflow-events.spec.ts`：显式 Workflow 启动、进度、暂停/继续/停止、SDK canonical 最终结果、结果补读与复制、订阅失效恢复。不存在保存/修改/改名/删除/清理/历史重跑管理按钮或 slash 补全；旧命令明确拒绝，旧定义/历史不删，其他 Session 的运行不混入当前面板。
6. `sdk-alpha11-lifecycle.spec.ts`：Script 文件写入部分完成→Stop→Host 冷重启→observe→直接 SDK 历史首读（不用 load 修复）；原结果、工具证据和时间保留，后续副作用未执行、模型请求未重放。长任务报告保持顺序、未知状态和缺失任务 ID。
7. `sdk-beta1-adaptation.spec.ts`、`sdk-work-mode.spec.ts`、`sdk-history-navigation.spec.ts`：界面升级来源、长队列取回、Quick Ask 提升/重载、模式选择、历史双向分页/回最新和原文分页。普通提问久等不提交默认答案；明确 Skip 和权限拒绝分开。
8. `npm test`、`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run build:smoke`；源码 Electron E2E 后再打包并执行 `SPACE_E2E_PACKAGED_EXECUTABLE` 成品专项。记录失败/重试/跳过原因，不将 mock 原生通知当作客户 Mac 授权验证。
