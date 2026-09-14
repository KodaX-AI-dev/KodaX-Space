# PF012 默认冷启动首页

2026-09-08，Completed / Local。用户希望参考 WorkBuddy 设计默认首页。本机 WorkBuddy 画面读取返回系统捕捉错误，参考了此前用户提供的专家截图，以及 [WorkBuddy 官方新建任务首页说明](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Buddy-App)。官方将任务输入、场景入口与专家结合，本次转化为符合 Partner 已有能力的首页。

## 页面与交互

- 欢迎语“今天，想一起完成什么？”和居中的真实输入框。
- 六个起步示例：调研、数据分析、文案、会议纪要、邮件、工作汇报。调用既有草稿插入事件，不发送、不自动绑定专家；输入中的选区仍遵循原有插入规则。
- “找一位专家”打开现有专家目录，“添加工作资料”打开现有资料选择入口；无项目时资料按钮禁用，并显示打开目录提示。
- 冷启动默认不显示空任务卡片，标题栏仍可主动打开。会话开始后遵循已有任务栏偏好。
- 同一个 BottomBar 保持挂载，使用现有会话创建、专家绑定与权限逻辑。六个示例不是新增专家或预设技能执行器。

## 效果与产物

- [桌面首页](</Users/samharadelijiang/Documents/kodax Space/audits/partner-home-20260908/home-desktop.png>)
- [窄窗口及专家引用](</Users/samharadelijiang/Documents/kodax Space/audits/partner-home-20260908/home-compact.png>)
- [首次发送后的会话](</Users/samharadelijiang/Documents/kodax Space/audits/partner-home-20260908/home-to-session.png>)
- 已构建应用：`out/mac-arm64/KodaX Space.app`。未替换正在运行的用户应用，未创建发布安装器。

## 验证与边界

审计目录：`/Users/samharadelijiang/Documents/kodax Space/audits/partner-home-20260908/`。

- `electron-home.mts` / `electron.log`：真实打包Electron、真实IPC、隔离用户目录。六示例保留已有草稿；未发送前保留冷启动页；专家入口、选择与头像解码、返回后的草稿保留；手动任务栏开关及无箭头；资料入口；820px窗口无横向溢出；首次发送进入会话且专家继续绑定。业务回复用mock，没有远端写入。
- `typecheck.log`、`lint.log`、`build.log`：类型、改动文件lint、前端构建通过。
- `tests.log`：相关8项测试中7项通过。`PartnerWorkspace.test.tsx` 的SSR可达性用例报无效元素类型；`workspace-baseline.log` 在恢复改动前Workspace后也同样失败，属于既有测试问题。真实桌面中的入口已另行验证，不将该失败计作通过。
- `package.log`：macOS arm64应用打包完成；包装脚本忽略自定义输出路径，实际输出到默认 `out/mac-arm64`。之后安装器存在性检查失败，因为本次选择 `--dir`，没有生成当前版本安装器。实际应用已用于上述Electron验证，不能宣称发布检查全部通过。
- 已按 React 检查清单核对状态、组件身份、事件复用与可访问按钮；未添加网络请求、额外权限或独立输入框状态。

同时包含前两次已授权界面修正的构建：引用专家显示头像，任务卡片去掉箭头并在标题下完整列出内容。

## 2026-09-08 任务与专家关联

按用户确认，六个任务卡片现在分别关联深度研究、数据分析及可视化、营销文案、会议纪要与行动项、邮件编辑、工作汇报。通过已启用 Partner 插件的真实目录获取专家当前revision、首个starterTask和交付说明；卡片展示实际专家头像、名称和交付内容。点击先调用现有binding.select并启用默认方法，成功后才把专家模板插入草稿，不发送消息。不再使用首页另外维护的六条提示词作为执行模板。

目录不可用、专家退役或缺少方法/模板时禁用入口；加载和绑定过程有状态，错误可见。防止重复点击；组件离开或异步期间切换项目后不向新草稿插入旧模板。沿原有插入位置规则保留非选区草稿。连接器仍按用户当前授权和本会话开关提供，选择任务不自动增加连接器授权。

`PartnerStarterTasks.test.ts` 使用真实Provider、binding和浏览器，通过模拟宿主验证六个映射的revision/useSkill、绑定后插入、原草稿保留、错误、并发禁用与项目切换隔离；无session.create/send调用。该测试证明交互接线，不代表重新评价六位专家的业务产出质量。既有“六示例不绑定专家”的验收描述由本节覆盖。
