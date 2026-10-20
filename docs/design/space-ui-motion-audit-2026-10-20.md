# F147 — actual-client visual and motion audit

Scope: the selected graphite/paper workspace and full settings. Keep every feature,
multi-project execution, language/theme preferences, all three quality levels,
both pets and the protected context/token components. No release/version change.

## Current-run evidence and findings

Baseline: `579e57c89c674eb60311d365badddf8199eb22db`, fresh production build,
isolated Electron 42.5.0, Windows, 1440 × 960. The new visual journey passed before
production edits. Seven saved screenshots were individually opened and inspected.
Files: `artifacts/f147-visual-motion/before/01-…07-….png`.
Conversation content is a deterministic mock/display fixture; this is actual
Electron UI, not proof of real parallel SDK execution. That uses the separate
existing integrated-workspace acceptance case and a local SDK provider.

1. Dark workspace: primary labels and continuous canvas are readable; projects,
   context controls and legacy pet are present. The fixture does not represent
   long-history scrolling or real provider latency.
2. Focused composer: two simultaneous gold focus borders make the textarea look
   like a second box within the glass surface. Use the enclosing focus boundary;
   retain keyboard focus indicators for individual toolbar controls.
3. Model menu: solid material is readable, but opening has little visible motion.
   Use a finite 220ms opacity/transform arrival from its anchor. Escape, selection
   and positioning must remain usable; no blur or permanent transformed ancestor.
4. Dark preferences: single navigation replaces project navigation correctly.
   The three quality previews are static, giving weak material feedback. Add a
   finite hover/focus movement inside the existing material previews.
5. Provider category: content snaps between categories; selected navigation and
   content need a common arrival rhythm. Use a short selection accent and 380ms
   content arrival without remounting panel state. The keychain warning is a fact
   of this isolated environment and must not be concealed for visual polish.
6. Light preferences: contrast and selected state remain readable. Validate the
   same motion path in light mode, plus keyboard/reduced-motion operation.
7. Light workspace: the draft survives settings. Keep text/menus solid and retain
   local glass; no new moving transcript decorations.

## Implementation and acceptance

- Composer: one focus boundary and a bounded, pointer-transparent decorative
  layer. Balanced gets one 620ms edge sweep; Full adds a 1000ms material glint.
  Trigger only on textarea focus, never on each keystroke or streamed delta.
  Clip the decoration alone so popovers and pets cannot be clipped.
- Reuse GlassAurora's Full-quality activity decision to pause the extra glint
  during background/blur, scrolling, dragging, resizing and active output. No
  extra listeners, per-frame timers, layout reads, libraries or WebGL.
- Menus and settings use finite transform/opacity arrivals. Finish with no
  persistent transform or animation fill. Navigation hit targets remain still.
- Minimal and reduced-motion disable the new motion, including body-portal menus.
  Quality is the existing preference; no extra user configuration.
- Public acceptance seams: focus/type/menu/Escape, theme/quality controls,
  settings category switch and draft restoration; actual Electron blur/focus;
  existing real-SDK two-project execution; narrow/settings/files regressions.
- Capture the same seven steps after edits and record the real renderer as WebM.
  Inspect frames before delivery. Screenshot/video inspection cannot certify
  cross-device FPS, screen-reader compliance or all possible product states.

Validation and independent review results are recorded in the F147 test guide.

## 本轮实际效果与逐步结论

新动效接缝已通过三条独立 Electron 验收；既有 integrated-workspace 四条
（含真实 SDK 双项目、设置恢复、文件搜索、Partner/Portal）也通过。
初次守卫测试暴露 CSS shorthand 优先级覆盖暂停状态，已修正并复测通过。
Windows 单窗口 `blur()` 会立即恢复焦点，后台验收改为真实第二窗口接收焦点。

完整桌面套件最终为 138 通过 / 3 条显式实网 opt-in 跳过 / 0 失败。最后增强了浅色
聚焦边界的静态对比，重新构建本地 Windows 包后，真实 SDK 6 条与视觉/降载/菜单边缘
4 条共 10/10 通过，打包完整性与启动 smoke 通过。下面的最终工作区/设置截图和两段
原始录屏均已由该包重录并检查；步骤 07 另有 `07b-composer-light-focus.png`。

| 步骤 | 页面/操作            | 结论                                                 |
| ---- | -------------------- | ---------------------------------------------------- |
| 01   | 深色工作区           | 通过：连续画布、项目与宠物位置保留                   |
| 02   | 输入区聚焦           | 已修复双重边框；录屏抽帧可见掠光移动                 |
| 03   | 模型菜单             | 通过：有锚点入场，内容实色清晰、Escape 可退出        |
| 04   | 深色偏好             | 通过：单一导航；分类选中标记明确                     |
| 05   | 服务商分类           | 操作通过；信息卡片仍较密，保留完整字段与隔离环境警告 |
| 06   | 浅色偏好             | 通过：选择状态与文字清晰，材质反馈遵循质量偏好       |
| 07   | 浅色工作区           | 通过：草稿恢复，玻璃未侵入长正文                     |
| 08   | 真实 SDK 双项目/深色 | 通过：两个项目同时显示运行，装饰光泽按负载暂停       |
| 09   | 双项目运行中进入设置 | 通过：真实活动 Run 继续，设置分类接替项目栏          |
| 10   | 返回浅色工作区       | 通过：拒收入场中的即时帧，稳定后重拍并逐张核对       |

实际截图位于 `artifacts/f147-visual-motion/after/`，文件名前缀对应步骤。
`journey.webm` 为完整中文界面操作，`real-parallel.webm` 使用已发布 SDK 与本机
确定性 HTTP provider，命令名及 SDK_PARTIAL 是测试内容，并非外部模型输出。
`preview.webm` 截取原录屏的中文工作区操作段，便于快速查看动效。

![打包客户端动效实录](../../artifacts/f147-visual-motion/after/preview.webm)

![实际中文工作区](../../artifacts/f147-visual-motion/after/02-composer-focus.png)

![实际中文设置](../../artifacts/f147-visual-motion/after/06-settings-light.png)

补充检查了同轮 `i18n-language-switch` 在 1920×1032 下的空工作区实图，已另存
`after/empty-workspace-light.png`：语言、宠物上沿位置与工作区完整，但没有会话时，
全零统计和热力图仍占据较大的视觉面积。和步骤 05 的服务商信息密度一起，建议作为
下一轮组件改造的两个具体重点；保留全部统计/管理能力，先改善空状态和信息层级。
本轮没有擅自删减它们。

可见性/性能边界：菜单、正文没有新增 backdrop-filter；新增动效仅有限次 transform/
opacity。全特效光泽共享已有窗口与输出负载监听；未改上下文、token 或宠物组件。
这轮本机截图与操作可验证当前布局和降载行为，不能替代不同显卡/DPI 的性能测试、
色觉/读屏器验收。上轮已在基点复现的长对话滚动偏移仍为已有问题，不能据此宣称
全产品 E2E 无缺陷。本轮没有移除任何功能。

## Standards

独立初审发现 1 项 P3：新增测试回调过长。已拆为各自聚焦的短步骤，TypeScript AST
核对新增函数/回调均短于 50 行。原评审者复核修正增量，未发现新增规范违反或可行动
基线 smell。残留 0 项。

## Spec

独立初审发现 1 项 P2：菜单缩放入场可能让既有定位逻辑读到偏小高度。窗口边缘
E2E 曾在旧测量下得到底边 392.5625px（要求不超过 392.5px）。测量改用不受
transform 影响的 `offsetHeight`，沿用原挂载时机，无逐帧测量；原评审者复核无剩余
需求缺失或范围扩张。静态残留 0 项；完整 E2E 结果以测试指南运行记录为准。

每轴初审各 1 项：Standards 最高 P3、Spec 最高 P2；修正后每轴各 0 项残留。
