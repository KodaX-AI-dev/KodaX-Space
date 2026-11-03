# 旧排队输入完整取回与丢响应恢复

Space 接入 beta.1 时发现一个旧队列接缝：公开 `getInput`/view 只返回裁剪预览，`withdrawInput` 首次成功才返回完整原输入，而再次撤回已 withdrawn 的输入会 conflict；旧版本 Space 未持久保存完整提交意图，因此 Host→Main 或 Main→Renderer 撤回成功响应丢失后，可能只剩预览，长文本和附件原引用无法再次取回。请在既有 Host/Product 契约中补充原 principal 可调用的完整排队输入读取，或同一 Session/inputId 幂等的撤回回执读取；全文、delivery/target 与附件引用均由 Host 原样返回，禁止从 preview 重建或在 Space 直读内部文件。读取/撤回须验证原 principal 和 Session 权限，不能让其他客户端取走原输入，确认成功后才从 UI 移除待处理状态，断连和冷 Host 恢复仍可按原操作身份查询。验收覆盖 alpha.12 遗留队列、超过 4096 字符的文本、图片/文件引用、撤回提交前后及两段链路丢响应、Main/Host 重启、重复撤回和外部 principal 拒绝；原文与附件不丢失、不产生第二次模型调用、不把未知结果当成功。Space 已为新提交输入保存私有完整恢复记录并实现幂等取回；对没有完整证明的旧队列保留原输入并事实拒绝，未以裁剪预览冒充全文。

补充组合崩溃窗口：新输入即使有 Main 完整意图，Host 已撤回、Main 尚未持久确认回执便崩溃，随后 Host 换代丢失 getInput 事实时，也不能证明已经撤回或仍在排队。此窗口仍需 SDK 的 durable 撤回回执/原文读取；Space 保留完整材料并事实拒绝，不能自动重提或报成功。
