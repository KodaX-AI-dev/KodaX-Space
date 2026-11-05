# Issues 236–238 客户反馈回归

日期：2026-11-04。客户报告版本为 0.1.47-alpha.4；本工作区版本仍为 0.1.47-alpha.3 / Registry SDK 0.7.97-alpha.11。以下是源码修复，未发布新安装包。客户 Word 文档和两张截图仅作为现象证据。

## 236 连续历史与阅读位置

原问题：上翻加载更早内容时整页替换，较新的正文被移除，滚动条突然变长并落在底部。首次 view → history 切换时消息 ID 不同，原定位锚点失效。工具折叠后很短的对话同样可能跨多个 SDK 历史页。

修复：只累积同一修订的 SDK 历史页，按 opaque 历史 ID 保留唯一显示项；不拼接 live view。优先通过唯一的 SDK 消息身份恢复位置，无法唯一匹配时保留后缀中的相对位置。下滚不自动替换历史窗口；底部按钮显式回到最新。过期、失败、会话切换后的请求仍受生命周期隔离保护。

1. 打开超过两页的历史会话，缓慢上翻并记录当前可见的一句话。
2. 加载更早内容后，该句话应留在原阅读位置；下面的回答仍可向下连续阅读。
3. 连续跨两页、反向滚动、拖动滚动条，不能出现整段正文被换走。
4. 打开只有一轮问题但含大量折叠工具调用的会话，上翻到问题，再下翻；最终回答必须一直保留。
5. 加载旧页期间点底部箭头，应回到最新；随后返回的旧请求不能改变内容或弹出过期失败通知。
6. 切换会话、刷新、遇到历史修订失效时，不得混入其他会话或其他修订的正文。

## 237 重命名与右键

原问题：任务/项目名称在失焦时被取消；客户端仅检查 IPC envelope，忽略 `session.setTitle` 的业务 `ok:false`，导致失败时仍显示新名称。菜单 Escape 退出后焦点未返回原行。

1. 任务右键 → 重命名，分别用 Enter、Tab、点击其他位置提交；列表和标题应更新。刷新后仍显示新名称。
2. Esc 取消、空白或未修改名称不应发送保存请求；中文输入法的 Enter 选词不能提前提交。
3. Enter 紧接着失焦只发送一次保存。拒绝或失败时保留原名称并显示错误反馈。
4. 项目右键重命名按相同方式保存；验证置顶、标记未读，方向键选择、Escape 关闭后焦点返回。
5. 聊天里的文件路径、文件链接、文件搜索结果右键：打开预览、Diff、插入路径、复制相对路径、文件管理器入口可见；菜单不越出屏幕边缘，键盘导航和焦点恢复正常。外部 URL、证据链接和不支持的路径不冒充本地文件菜单。

## 238 用户问题辨识度

用户消息保留左侧文档布局和四行预览，新增常驻“你的消息”/“You”标签、淡蓝底色与左侧色条，与助手正文和思考/工具回执分开。检查深浅主题、短消息、长文本、带附件消息；展开/收起、复制与附件入口仍可使用。

## 自动验证

```powershell
node --test --import tsx apps/desktop/electron/test/session-history-paging.test.ts apps/desktop/renderer/src/store/productSessionView.test.ts apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts apps/desktop/renderer/src/shell/sidebarContextActions.browser.test.ts apps/desktop/renderer/src/features/session/messages/userBubble.test.tsx
npm run build:smoke
npm run e2e:run -- sdk-history-navigation.spec.ts user-query-collapse.spec.ts markdown-file-actions.spec.ts
npm run typecheck
npm run lint
```

已验证 83 项相关 Node/Chromium 测试及 4 项隔离 Electron E2E。真实 SDK 测试覆盖 260 轮历史、单轮 160 个工具调用、重命名持久化以及跨 view/history 身份定位。未使用客户实际历史数据，也未宣称复现客户环境里的所有可能原因。

构建、typecheck、全仓 lint 通过。对两个分页状态模块定向采集 V8 覆盖率：`sessionHistoryPaging.ts` 行覆盖 97.15%、分支 82.13%；`productSessionView.ts` 行覆盖 94.38%、分支 88.24%。这是这两个模块的覆盖率，不是全仓覆盖率。
