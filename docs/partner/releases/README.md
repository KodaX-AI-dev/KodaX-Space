# Partner 发布记录

本目录只管理 Partner 产品线自己的候选版本、Extension 产物、验收证据与回滚记录。Space 主应用的正式发布记录继续由 [`docs/releases/`](../../releases/) 管理，两条版本线不互相冒充。

## 当前候选

- Partner 产品：`0.1.0`
- Partner 插件库：`0.1.0`
- Space 兼容基线：`0.1.46-alpha.5`
- KodaX：`0.7.96-beta.1`
- Partner Host API：`4`
- 必需宿主能力：`partnerNativeDocumentDeliveryV1`
- 已发布 tag：`partner-v0.1.0`（不使用Space的plain `v0.1.0`）
- 状态：GitHub预发布已公开，macOS arm64与Windows x64附件已上传；完整跨平台CI与真实账号验证仍有已披露限制。

## 版本资料

- [Partner Changelog](../CHANGELOG.md)
- [0.1.0 Release Readiness](v0.1.0-release-readiness.md)
- [0.1.0 人工与发布验收指南](../test-guides/FEATURE_F146_PARTNER_v0.1.0_TEST_GUIDE.md)
- [PF001：Partner Extension & Expert Library](../features/v0.1.0.md#feature-pf001)
- [PF002：Governed Connector Previews & Feishu Platform Expert](../features/v0.1.0.md#feature-pf002)
- [PF003：Receipt-First Delivery & Unified Workspace](../features/v0.1.0.md#feature-pf003)

PF001–PF003 当前均为 `InProgress / Local`，共同映射 Space `F146`。PF002 的连接器必须保持 Preview 口径，直到对应真实账号与真实资源验收完成；fixture 或 Mock 结果不能替代真实服务证据。

只有精确候选提交的自动化、桌面人工、真实服务、安装/替换/回滚和 CI 证据一致后，才可以考虑把 RC 晋级。2026-09-08用户已确认作者允许本次公开发布，现按该授权准备预发布；授权记录与剩余技术限制见发布就绪记录。

- [Windows补充发布与校验记录](v0.1.0-windows-validation.md)
