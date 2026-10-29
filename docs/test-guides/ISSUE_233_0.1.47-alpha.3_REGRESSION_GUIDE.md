# Issue 233 cold history hydration regression

2026-10-28，源码修复，尚未发布新的 Space 版本。SDK 仍为 Registry alpha.10。

本地验证包位于 `out/react185-fixed/win-unpacked/KodaX Space.exe`；原 `out/win-unpacked` 未覆盖，完全退出旧 Space 后再运行此包。

1. 完全退出旧 Space，冷启动验证包。选择包含许多长正文、工具输出和工具输入的已有 Session；等待历史动画结束。首次正文显示及后续全文补读期间均不应出现 React 185、根界面错误或重复报错 Toast。
2. 同时检查正文完整、用户/工具/助手次序保持，补读不丢字、不生成重复消息。同步缓存读取不必等待下一帧；仅界面通知合并。
3. SDK 冷启动延迟时选择 Session，等 Runtime 就绪与历史首次安装。重复三次。用户报告的原 Session 仅在独立数据档副本回放，不能修改或把该用户历史提交为测试夹具。
4. 补读未完成时切换 Session，再回原会话。迟到结果不能覆盖不同身份或新修订；既有删除 Session、历史窗口与当前 view 的缓存回归继续通过。
5. 黄色子任务通知的呈现和历史窗口的向下导航仍为独立待办，本修复不声明它们已完成。

自动回归：

```powershell
node --test --test-force-exit --import tsx apps/desktop/renderer/src/store/productSessionView.browser.test.ts apps/desktop/renderer/src/store/productSessionView.test.ts apps/desktop/renderer/src/lib/productItemContent.test.ts
```

诊断、原始复现与修复边界见[排查记录](../research/renderer-185-agent-notices-and-history-navigation-2026-10-28.md)。
