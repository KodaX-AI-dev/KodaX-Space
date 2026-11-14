# alpha.4 外部 Qwen 测试历史记录

更正：本记录自行选择了 OpenRouter 的 Qwen3-VL，没有使用用户当前配置的 `zai-coding / glm-5.3-flash`。该测试选择偏离了验收场景，以下结果不能代表 Space 已配置模型的自动检查能力。保留原始事实供追溯，正式验收见 [Space 已配置模型 E2E](kodax-0.7.97-alpha.4-visual-review-live-e2e.md)。原测试代理已从当前测试入口移除。

日期：2026-10-13。SDK 为 Registry `0.7.97-alpha.4`，Space 当前源码为 `0.1.47-alpha.1`；Windows 隔离 Desktop、临时 profile、生产 Main/preload/Renderer，通过真实 UI 发送任务。真实模型为 OpenRouter `qwen/qwen3-vl-235b-a22b-instruct`。

## 结论

本轮没有通过“普通视觉任务会自动检查”的验收。AMA 和 SA 各两次普通图表修改任务，共四次，均没有加载 `visual-review`，也没有读取成品 PNG 或把图像发送给模型。Run 显示 completed，并不证明质量检查完成。

自动视觉检查指令、`visual-review` 描述和 `skill` 工具均已出现在真实模型请求中。已排除本轮 Space 没有下发这些内容的解释。当前实现依靠模型遵守指令，不能把“技能可用”或“任务结束”当作自动视觉检查已发生的证明。该结论限于本模型和本组任务，不推断所有模型均失败。

显式检查对照中，模型实际读取 `report.png`，下一次请求携带的图像 SHA-256 与当前 PNG 字节完全一致，并正确指出图中 Q1/Q2/Q3 全为 0，而 `data.json` 应为 42/57/68。它仍未调用/加载 `visual-review`，却用“根据技能检查结果”描述自己的回答。因此“读取了实际图像”和“执行了技能”分别核验，回答中的自述不作为调用证据。

## 测试方法

普通任务只要求把 `report.html` 改成 `data.json` 的数值、保留布局和配色、交付 HTML/PNG；不出现技能名或显式检查要求。工作区提供已安装的 Chromium/Playwright 和一个可运行的渲染脚本。SDK 原有系统指令决定是否检查，测试不添加强制检查 hook、模拟模型决定或修改实际模型请求。

本地代理透明转发真实请求/响应，只记录指令/技能/工具是否出现、模型选择的工具调用、图像字节摘要和回答。凭据只留在 Node/Electron Main 的环境和 HTTP 授权头中，不进入 Renderer、报告或截图。普通用例保持严格失败，不能通过删掉自动检查断言来变绿。

显式对照使用预先渲染的 PNG，只要求检查、不修改文件。它用于证明真实图像读取和识别链路可执行，不能计为自动触发成功。

测试入口：`tests/e2e/sdk-visual-review-live.spec.ts`；代理：`tests/e2e/visual-review-live-provider.ts`。默认跳过，防止常规 E2E 自动花费模型调用；用户明确要求的本轮执行已启用。复现：

```powershell
$env:SPACE_LIVE_VISUAL_REVIEW_E2E = '1'
# 已有 OPENROUTER_API_KEY，仅由测试进程读取，不打印值。
npm run e2e:run -- tests/e2e/sdk-visual-review-live.spec.ts
```

也可只执行对照：`npm run e2e:run -- tests/e2e/sdk-visual-review-live.spec.ts --grep 'explicit control'`。模型、报告目录可用测试环境变量覆盖；不改变产品设置。

## 范围与运行记录

- 首次 Google `gemini-2.5-flash` 返回地区限制 403；没有进入任务执行，不计入自动检查结论。现有 `stealth/union-alpha` 已退役，返回 404。后续用可调用的 Qwen 视觉模型完成测试。
- 第一轮 Qwen：AMA/SA 两次任务均 completed，但自动检查严格断言失败，图像请求数为 0。
- 修正测试渲染脚本的 CJS 导入方式后再次执行：AMA/SA 两次任务均 completed，指令/技能说明/工具均下发，仍没有技能加载或图像读取。SA 过程中另有三次 Provider 429，最终完成；原始记录保留此事实。
- 显式对照正确识别像素和数据差异。最初把技能加载也作为对照条件，因模型没有加载技能而失败；随后对照仅验收实际像素读取与差异识别，技能未加载仍如实记录。普通自动检查条件没有放宽。
- 加强显式对照的逐季数值断言后，两次回答分别使用分段列表和文件名先于季度的句子，曾因格式识别过窄而误判失败；真实图像摘要和正确数值均保留。修正仅涉及这两种回答格式，仍要求三个季度的来源数值与图片数值都正确，并检查 PNG 未被修改。机器证据区分测试状态与实际观察，不把这两次误判写成产品失败。
- 最后严格显式对照通过真实 Electron E2E（38.0 秒）。随后增加的否定回答与季度混用防护在本地重放四份真实回答和四份错误对照，正确回答通过，错误回答被拒绝；本地重放不计为新的模型调用。新增 E2E 的严格类型检查、ESLint 通过，默认入口三个用例全部跳过付费调用。

详细请求、工具顺序、回答与图片摘要见 [历史机器证据](kodax-0.7.97-alpha.4-visual-review-external-qwen-evidence.json)。其中 harness 摘要表示当时执行的文件，不表示当前测试代码；原始本地产物保存在 `artifacts/visual-review-live-*`。

本轮新增测试和验收记录，没有修改 SDK 字节、提示词或生产完成条件来制造通过。先前迁移的离线契约测试通过，不能替代这里的真实模型自动行为验收。
