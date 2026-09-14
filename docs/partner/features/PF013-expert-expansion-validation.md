# PF013 专家扩充验收

日期：2026-09-08。状态：Completed / Local，本机开发版已更新，未提交、发布或集成 Space 主线。

## 新增能力

| 专家 | 类型 | 默认方法 | 主要交付 |
| --- | --- | --- | --- |
| 销售拜访顾问 | 岗位 | call-prep | 客户背景、议程、发现问题、异议回应与内部核实项 |
| 招聘面试设计 | 岗位 | interview-prep | 岗位能力问题、时间安排、行为锚点与空白证据记录 |
| 新员工入职 | 任务 | onboarding | 入职准备、首周计划、阶段目标及依赖 |
| 演示文稿制作 | 任务 | frontend-slides | HTML 演示、逐页讲稿及来源说明 |

当前16位可选专家（7岗位、9任务）；另保留5个退役定义兼容历史。原有17个定义及13个连接器与本轮基线一致。4个原有储备头像全部复用，详情、真实任务示例、输入、交付物和检查标准齐备。沿现有同一 Agent 的持久会话绑定、方法开关与恢复接缝，没有新增执行引擎。

## 来源与适配

前三份方法复用 [Anthropic knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins/tree/1f517b9de47e827c80cd933ed364e16838072239)，固定提交 `1f517b9de47e827c80cd933ed364e16838072239`，分别来自 sales/skills/call-prep、human-resources/skills/interview-prep、human-resources/skills/onboarding。保留 Apache-2.0 LICENSE；根许可 SHA256 为 a6946284993aeec75c7d75906064b66210c46051e562077efb30eb6dcfe72e26。

source/patch/lock 沿现有同步器维护。适配移除了无效相对引用、位置参数和默认外部操作假设。演示直接复用既有 frontend-slides，不重复复制。当前18份随包方法。

## 自动与桌面验证

- 先增加归档期望专家ID，确认缺失失败，再实现。
- SDK运行恢复与首页关联回归33项通过；归档3项通过，共36项不同测试。最终面试、入职及演示约束调整后额外定向复测通过。
- 类型检查、改动测试文件lint、skills:check、build:smoke、macOS arm64目录打包通过。
- 隔离的真实Electron及IPC：新增4位专家的头像、详情、选择、默认方法开关、重载恢复、会话隔离和移除通过。模型为控制模型，实际方法注入另由SDK测试证明。最初全目录桌面循环途中退出，不能作为16位完整桌面验收。
- 用户配置的插件目录已备份再更新。新版前端已启动，真实UI显示专家16、岗位7、任务9、连接器13；用户草稿未发送。

## 真实模型样板与局限

使用实际专家定义和方法正文调用 DeepSeek 的 SDK provider，未提供工具或连接器写权限。销售样板提供了30分钟议程、6个关键问题，并保留价格与交期未批准边界。面试样板曾虚构面试形式和决策流程，已加强方法与提示约束；复测将其标为假设/建议，没有候选人回答时评分留空。

入职样板曾把FAQ可用写成员工已读完及已产出分类，已加强资料状态与任务状态分离；复测改为建议或待执行。演示样板曾补造用户反馈、失败原因及耗时，已加强逐页事实清单检查；复测移除了这些测量结果，并标出未来样本量为待批建议。

这些是局部真实样板，不是专业质量保证：最终演示仍有将试点用户描述为内部用户、将完成率解释为初步可行的措辞，入职输出用“满一个月”表达30天目标，仍需人工复核事实口径和日期。高推理模式的两个样板达到输出额度却没有正文，普通模式复测有完整结果；未修改用户模型偏好。

模型返回的HTML由验收脚本保存，四页在浏览器离线状态可用方向键切换，无页面溢出，无远程资源依赖（仅本地favicon 404）。不能据此声称专家真实工具创建文件已验收，也未验证PPTX导出或外部账号操作。HTML演示不承诺原生PPTX。

## 可复核证据

证据目录：`/Users/samharadelijiang/Documents/kodax Space/audits/expert-expansion-pf013`。

- `regression.log`、`archive-test-last.log`、`sdk-last.log`、`sdk-interview-final.log`。
- `electron-new.log`与`electron-*.png`：4位新专家真实桌面流程。
- `model-samples.json`销售；`model-final.json`面试最终及入职/演示失败样板；`model-onboarding-final.json`与`model-presentation-final.json`最终复测。
- `presentation-sample.html`与`slide-1.png`至`slide-4.png`：真实模型演示样板及渲染。
- `library-update.json`：安装结果与用户扩展备份位置。

人工复核：进入“找一位专家”，查看销售/招聘详情；切到任务专家查看入职/演示；选择后检查输入框头像与持续使用提示，发送包含真实资料的任务，核对交付物及引用来源；涉及外部动作时确认实际授权和回执。
