# OpenAI-compatible 的 reasoning 扩展应该通用兼容，还是单独设 Provider？

结论摘要：建议复用 Chat Completions 传输和通用响应解析，并按接口方言生成请求、保存及回传推理数据；仅为 thinking 字段增设用户可见 Provider 类别没有必要。此句是设计建议，以下是依据。

核查日期：2026-09-17。本文限定 Chat Completions，引用的是当日官方在线文档及源码，不推定任意模型或部署版本的能力。

## 官方接口中的真实例子

| 接口 | 请求控制 | 响应及后续请求 | 官方依据 |
| --- | --- | --- | --- |
| OpenRouter | `reasoning` 对象支持 `effort`、`enabled`、`exclude`、`max_tokens`；也接受顶层 `reasoning_effort` | 文本为 `reasoning`；结构化 `reasoning_details` 位于非流式 `message` 或流式 `delta` 中 | [控制参数](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#controlling-reasoning-tokens)、[顶层 effort](https://openrouter.ai/docs/api_reference/parameters#reasoning-effort)、[响应结构](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#reasoning-details-api-shape) |
| DeepSeek | `thinking.type` 控制开关，`reasoning_effort` 控制强度；OpenAI Python SDK 通过 `extra_body` 传 `thinking` | 返回 `reasoning_content`；携带 `tools` 时后续请求须完整回传历史推理内容，即使某轮没有实际调用工具 | [开关和强度](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/#思考模式开关与思考强度控制)、[输入输出](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/#输入输出参数)、[工具调用](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/#工具调用) |
| vLLM | 请求可用 `chat_template_kwargs.enable_thinking`，覆盖服务端模板默认值；具体模板也可能使用 `thinking` | 当前文档使用 `reasoning`，并明确说明它由 `reasoning_content` 更名而来，旧客户端可能静默读空 | [请求覆盖](https://docs.vllm.ai/en/latest/features/reasoning_outputs/#request-level-override)、[模型及模板差异](https://docs.vllm.ai/en/latest/features/reasoning_outputs/#supported-models)、[字段更名说明](https://docs.vllm.ai/en/latest/features/reasoning_outputs/#reasoning-outputs) |

`reasoning` 不是 OpenRouter 独有字段；vLLM 也使用它。另一方面，OpenAI 官方 Python SDK 当前 `ChatCompletionMessage` 类型没有声明 `reasoning`、`reasoning_content` 或 `reasoning_details`。因此，这些是兼容接口生态中的扩展，不能仅凭“OpenAI-compatible”推定其支持情况。[vLLM](https://docs.vllm.ai/en/latest/features/reasoning_outputs/#reasoning-outputs)、[OpenAI 官方类型，第 49–84 行](https://github.com/openai/openai-python/blob/main/src/openai/types/chat/chat_completion_message.py#L49-L84)

## 开启、强度、显示是不同控制

- OpenRouter 将启用、强度和响应排除分别表示为 `enabled`、`effort` 和 `exclude`；推理可能已启用而不返回文本。其模型目录还能提供允许的 effort 和默认启用状态。[参数](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#controlling-reasoning-tokens)、[能力发现](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#discovering-per-model-reasoning-options)
- DeepSeek 当前文档说明默认开启且默认 effort 为 `high`；这只是该接口的默认值，不是整个兼容协议的默认值。[默认行为](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/#思考模式开关与思考强度控制)
- vLLM 当前文档说明：设置部分 `reasoning_effort` 值会自动注入 `enable_thinking`，没有 effort 则不注入；显式模板参数优先。因此“省略参数”还会受模型模板与服务端设置影响。[自动启用](https://docs.vllm.ai/en/latest/features/reasoning_outputs/#automatic-enable_thinking-activation)

## 设计建议（非协议事实）

1. 通用解析器兼容 `reasoning_content` 和 `reasoning` 文本，并处理两者同时出现时的重复显示。
2. 结构化推理不要一律转换成字符串。OpenRouter 的 `reasoning_details` 包含文本、摘要和加密数据，且要求回传时保留原始顺序及结构；显示层只取可显示内容，传输层保留必要原始数据。[结构类型](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#reasoning-detail-types)、[回传约束](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens#preserving-reasoning)
3. 保留一个自定义 OpenAI-compatible 入口；优先用已有 `reasoningProfile` 承载方言映射，为已知接口提供小型请求/回传适配。不要向所有端点同时塞入 OpenRouter、DeepSeek、vLLM 的控制字段，也不要仅凭响应字段反推完整请求能力。
4. 若以后需要 OpenRouter 专属的模型目录或路由设置，可提供 OpenRouter 预设；这与底层是否共用传输实现是两项独立决策。
5. 产品的“自动”和多档回退必须明确自身语义：自动究竟表示跟随服务端默认，还是主动开启但不指定强度；降档是选择声明支持值，还是遇到明确参数拒绝后重新请求。这些都不能从兼容接口标签自动得出。

## 本地验证（2026-09-17）

本节记录主任务完成的代码核查和 SDK 注入测试，与上述官方接口事实分开。

- Space 对未声明能力的模型硬编码 `auto/low/medium/high` 菜单回退；SDK 在没有 reasoning profile 时将 wire effort 解析为 `undefined`。[Space effortLadder.ts:5](../../apps/desktop/renderer/src/shell/effortLadder.ts#L5)、[SDK wire-effort.ts:60](../../../KodaX/packages/llm/src/wire-effort.ts#L60)
- 主任务对 packaged SDK `0.7.96-rc.6` 和 workspace SDK `0.7.96-rc.7` 的请求注入验证结果一致：未声明 reasoning 时，`auto/low/medium/high` 最终请求均没有 reasoning/thinking 相关字段；不仅没有 effort，也没有启用标记。直接向 `provider.stream` 传 `xhigh/max`，会在请求发送前被 `validateExplicitReasoningEffort` 拒绝，请求次数为 0。[SDK base.ts:655](../../../KodaX/packages/llm/src/providers/base.ts#L655)、[SDK openai.ts:883](../../../KodaX/packages/llm/src/providers/openai.ts#L883)
- 用户本次明确期望“自动 + 低/中/高/更高/最高”，即自动加五档强度；现有菜单和 SDK 未声明能力的处理均与该期望不符。因此修复需要覆盖 UI 和 SDK，仅扩充菜单不足。五档是产品意图表达，不能保证每个上游模型都有五种不同的实际推理强度。该需求依据为本任务 2026-09-17 用户消息；实现证据见以上文件。

## 未证实

- 本文未验证 `stealth/union-alpha` 是否支持可见推理、是否执行指定 effort，或某次请求没有 thinking 的根因。
- 本文未验证 Space 当前版本是否保存及回传结构化推理；该问题需要 SDK 和会话链路证据。
- 官方在线文档会更新；本文对 vLLM 的描述不能直接套用于任意旧版本部署。

## 未解问题

- 产品的“自动”是否要求主动开启推理？这是产品约定，而非统一协议规则。
- 未声明能力时的默认请求方言、试探起始档位、降档顺序和拒绝缓存规则应如何定义？
- 对仅接受参数但静默忽略的端点，如何区分“请求被接受”与“思考强度已生效”？
