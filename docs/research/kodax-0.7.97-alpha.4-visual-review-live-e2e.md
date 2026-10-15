# alpha.4 自动视觉检查：Space 已配置模型 E2E

日期：2026-10-13。已发布 SDK 为 `0.7.97-alpha.4`，Space 为 `0.1.47-alpha.1`。

先前外部 Qwen 测试没有使用用户当前配置的 Provider/模型，不能作为本次验收结论；原始记录保留在 [历史报告](kodax-0.7.97-alpha.4-visual-review-external-qwen.md)。

当前测试从现有 KodaX 用户配置读取 `provider` 和 `model`，本轮为 `zai-coding / glm-5.3-flash`。通过 Space 公共 `provider.list` 验证它是已配置的内置 Provider，模型存在于产品目录；通过 `session.create` 创建真实会话，再从 Renderer 输入框发送普通图表修改任务。测试不创建自定义 Provider、不代理 HTTP、不更改 endpoint 或用户配置、不模拟模型回答。

每个测试使用隔离 Windows Desktop/profile。保留实际工具输入与结果、最终回答、公共执行统计中的 Provider/模型、SDK 会话中的图像工具结果及 HTML/PNG/UI 截图。会话 completed、技能加载、实际图像读取分别验收；公共 Provider 请求事实不包含 HTTP 图像字节，因此不宣称取得 wire payload 哈希。

入口：`tests/e2e/sdk-visual-review-live.spec.ts`。默认跳过真实调用。运行时先在 Space 中选好实际 Provider/模型，然后执行：

```powershell
$env:SPACE_LIVE_VISUAL_REVIEW_E2E = '1'
npm run e2e:run -- tests/e2e/sdk-visual-review-live.spec.ts
```

## 最终验收结果

| 用例                             | SDK 技能加载 | 当前 PNG 读取                 | 结果             |
| -------------------------------- | ------------ | ----------------------------- | ---------------- |
| AMA 普通图表修改，不指定检查技能 | 自动加载     | 精确成品路径、匹配图像 toolId | passed，232.2 秒 |
| SA 普通图表修改，不指定检查技能  | 自动加载     | 精确成品路径、匹配图像 toolId | passed，143.5 秒 |
| SA 像素识别对照，显式检查        | 已加载       | 从图片识别与源数据不同的数值  | passed，42.8 秒  |

普通任务 E2E：2 passed（6.3 分钟）；独立像素对照 E2E：1 passed（43.4 秒）。所有实际请求均为已配置的内置 `zai-coding / glm-5.3-flash`，无 fallback；没有新建外部 Provider。结论：本组 Space 普通任务已验证自动触发。普通任务与显式对照分别计数。

像素对照预先渲染的图片显示 Q1/Q2/Q3 为 13/26/39，JSON 源数据为 42/57/68。测试移除 HTML 源文件，提示不透露图片数值，模型仅调用技能并读取 JSON/PNG，正确返回全部六个数值和 `matches:false`；PNG 字节摘要在检查前后不变。该对照证明当前 Provider/模型的像素识别能力，不计为自动触发用例。

最终 AMA 中有一次失败的 Provider 请求后重试成功，SA 和像素对照均完成；机器证据保留请求状态，不把自动检查通过描述成每一次网络尝试都成功。

完整取证与原始报告摘要见 [机器证据](kodax-0.7.97-alpha.4-visual-review-live-e2e-evidence.json)。成品保存在 `artifacts/visual-review-live-space-glm-final/`。新增测试的 strict typecheck、ESLint、格式检查通过；默认入口三个用例跳过真实调用。

## 已观察到的行为

第二轮真实 `glm-5.3-flash` 会话中，AMA 与 SA 均 completed，均主动调用 `skill(visual-review)` 并取得技能正文，再读取生成的 `report.png`，最终回答给出图表数值、条形高度、配色、裁切与布局的检查反馈。普通任务没有提出技能名或显式检查要求。所有公共请求事实中的 Provider/模型均为 `zai-coding / glm-5.3-flash`，没有 fallback。

这已复现当前配置下的自动触发，不能沿用先前外部 Qwen 的“不触发”结论。它证明本组任务中的行为，不作为所有任务、所有模型和全部视觉质量的保证。

## 测试取证修正

初次 AMA 进入技能加载与图片读取后，触及旧的 240 秒等待上限，尚未终态；不能把该超时分类为未触发。初次 SA 已结束，但测试使用 512 的 facts 页参数，超过 SDK 上限 500，导致取证失败。随后一轮两种模式均完成自动检查，但测试用 CJS resolver 解析 import-only 的 SDK 子路径，导致图片记录读取失败。

以上均为测试 harness 问题，原始失败报告保留，不改写为 E2E passed。现已将等待上限改为 480 秒、页参数改为 500，图片读取改为 fresh Node 中的公共 SDK ESM import，并在真实 SA profile 上验证。取证先保存 HTML/PNG/UI，再读取 facts/transcript；接口错误保留失败原因。自动验收仍要求实际加载技能、读取工作区成品的精确路径和产生匹配 toolId 的图像结果；读取同名的其他目录图片不能通过。

最终回归保留上述自动检查断言与失败判定；修正测试取证不会改变 SDK 的执行指令、Provider 序列化或生产触发规则。

## 对照参考实现

Codex 的 [completion audit](C:/Works/PubProj/codex/codex-rs/ext/goal/templates/goals/continuation.md:35) 要求主 Agent 从实际当前状态、渲染产物和运行结果核验完成条件。ZCode 的 [web-gui-tester](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/browser-use-plugin/skills/web-gui-tester/SKILL.md:100) 要求保存到文件的截图被实际读取，捕获本身不算观察；[control-browser](C:/Works/PubProj/ZCode/apps/zcode-cli/packages/browser-use-plugin/skills/control-browser/SKILL.md:135) 则要求截图显式返回图像。

KodaX 的 [execution guidance](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/prompts/execution-guidance.ts:18) 将该责任放在 AMA/SA 共同的主 Agent 指令中，要求视觉任务在交付前使用技能与真实渲染证据。本轮 GLM 会话已观察到对应工具顺序，未复现用户当前模型“不触发”的问题，因此没有更改生产触发规则或另加 verifier。

## Standards

独立规范轴复核测试路径、取证失败处理、模型来源与像素对照，0 项残留发现。函数均少于 50 行。

## Spec

独立需求轴核对现有 Space Provider/模型、普通自动触发、显式像素对照及历史失败记录，0 项残留发现；机器证据、原始记录和成品摘要吻合。
