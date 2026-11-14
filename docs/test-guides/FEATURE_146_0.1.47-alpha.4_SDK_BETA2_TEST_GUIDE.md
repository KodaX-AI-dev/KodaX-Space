# SDK beta.2 Space 回归指南

本指南针对当前工作树，公开 alpha.4 安装包仍使用 beta.1。执行结果见 [接入记录](../releases/kodax-beta2-space-adaptation.md) 和 [根因复验](../releases/kodax-beta2-boundary-root-cause.md)。测试须使用独立 profile 和本地 Provider，不读取真实用户凭据。

1. `npm ci`、`npm ls @kodax-ai/kodax`：Root/Desktop 只有 beta.2，打包 Registry 原生资源和 builtin Skill 门禁通过。旧忙碌 Host 拒绝强制替换，保留其他客户端。
2. Coder 首次输入前选择 Agent/Coding/Script；模式与 Provider/权限独立，忙碌或过期 revision 拒绝切换。Partner 显示 Host 实际模式，下一次执行提交 Agent 要求，另一客户端在授权后修改时必须由 Host 原子拒绝。
3. `e2e/beta1-sdk-acceptance.mjs`：16 位专家 persona/默认方法、显式 Skill 仅本轮、消费时采用已提交业务选择、禁用/撤销、promotion 已有/新增/第二客户端观察者、Host 诊断/预热及旧队列完整撤回。
4. `e2e/beta1-cold-queue-acceptance.mjs`：真正的 Main 正常关闭和强制终止，新的 Main PID 保持原 principal 和 inputId，原 Host 不重启，长文只消费一次。不得通过取回再自动重发掩盖失败。
5. `tests/e2e/sdk-ui-contract-acceptance.spec.ts`、`workflow-events.spec.ts`：显式 Workflow 启动、进度、暂停/继续/停止、SDK canonical 最终结果、结果补读与复制、订阅失效恢复。不存在保存/修改/改名/删除/清理/历史重跑管理按钮或 slash 补全；旧命令明确拒绝，旧定义/历史不删，其他 Session 的运行不混入当前面板。
6. `sdk-alpha11-lifecycle.spec.ts`：Script 文件写入部分完成→Stop→Host 冷重启→observe→独立 SDK 历史首读（先于显式 Space 兼容 history，不用 load 修复）；核对探针与 Main 的真实 runtimeId；原结果、工具证据和时间保留，后续副作用未执行、模型请求未重放。长任务报告保持顺序、未知状态和缺失任务 ID。
7. `sdk-beta1-adaptation.spec.ts`、`sdk-work-mode.spec.ts`、`sdk-history-navigation.spec.ts`：界面升级来源、长队列取回、Quick Ask 提升/重载、模式选择、历史双向分页/回最新和原文分页。另测 Partner 缓存 A→B→A 后第二 SDK 客户端修改 idle workMode，界面应接收真实值，下一次 Partner 输入恢复 Agent；快捷任务的模板填入完成后再修改测试正文。受控慢 IPC 分别覆盖后台读在飞与上一次前台读在飞，不能吞掉新前台保留意图。普通提问久等不提交默认答案；明确 Skip 和权限拒绝分开。
8. `npm test`、`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run build:smoke`；源码 Electron E2E 后再打包并执行 `$env:SPACE_E2E_EXECUTABLE=(Resolve-Path 'out/win-unpacked/KodaX Space.exe').Path` 后运行 `npm run e2e:run -- ... --retries=0` 成品专项。核对 CLI packaged 提示、实际 process.execPath、app.isPackaged 与包内 SDK；旧错误变量会明确拒绝，不能计作成品。记录失败/重试/跳过原因，不将 mock 原生通知当作客户 Mac 授权验证。

9. 投影/观察退休：相同首次空队列或恢复的相同非空队列不得推进本地 revision；真实队列变化必须推进。显式前台仅保留一个 Session，切换后释放旧空闲会话；后台历史/Actor 一次读取继续退休。复测 Thinking Stop→下一次工具输入确实到达 Provider，保留真实并发和过期边界的拒绝，不自动重发来掩盖冲突。

CI 源码 runner 先在独立有界步骤准备 Electron 二进制；下载失败属于准备失败，不能扩大单测截止或跳过真实 Electron 验证。已发布 alpha.4 标签和资产保持原样；本地 beta.2 重包不等于一次新的 Space 发布。
