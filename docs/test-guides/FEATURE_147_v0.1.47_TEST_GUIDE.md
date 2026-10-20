# F147 — 连续工作区与完整设置页面回归

## 2026-10-20 实际客户端视觉与动效审查

- 范围及逐步截图发现：[本轮审查](../design/space-ui-motion-audit-2026-10-20.md)。
- 当前运行基点：`579e57c89c674eb60311d365badddf8199eb22db`；Windows、Electron 42.5.0。
  使用隔离 profile/桌面，没有使用用户真实数据。证据在本机 `artifacts/f147-visual-motion/`。
- 新增 `workspace-visual-motion.spec.ts`：中文 1440×960 深浅色工作区、模型菜单、完整设置与分类；
  聚焦掠光的有限时长/次数、三档质量、reduced-motion、真实窗口失焦和滚动暂停；
  已发布 SDK + 本机 HTTP provider 双项目同时运行时的暂停/恢复与草稿保持；
  1000×400 窗口的会话菜单边缘定位、End/Escape。
- RED：原界面缺少新聚焦反馈；初版暂停规则被 CSS shorthand 优先级覆盖；旧菜单测量也曾
  在动画结束后超过预期底边。分别增加装饰层、修正暂停规则优先级、改用 `offsetHeight`。
- 完整桌面 E2E：138 通过 / 3 条显式实网 opt-in 用例跳过 / 0 失败（20.4 分钟），含新增
  四条视觉/降载/菜单边缘用例。步骤 10 已在稳定后重拍、打开核对，文本与草稿正常。
  上轮偶发的活动流式滚动偏移在此次通过，保留上轮记录，不宣称已经根治。
- 完整套件后仅增强输入区聚焦边界颜色，改用既有 `accent-ink` 保证浅色模式下更易辨认，
  不改变布局或交互。重新构建 renderer 后，另以本轮本地包复验并录制最终交付效果。
- 本地 Windows 安装版/便携版和独立 `win-unpacked` 均已生成在
  `artifacts/f147-visual-motion/package/`；SDK Registry 完整性门禁、`smoke:pack`、
  `smoke:boot` 全部通过。打包版真实 SDK 6 条 + 本轮视觉/降载/边缘 4 条共 10/10 通过。
  最终截图、`journey.webm`、`real-parallel.webm` 均已由打包版重录，逐张打开核对。
  `preview.webm` 是从原录屏截取的约 8 秒中文操作段，保留实际界面内容。
- 最终类型/lint/构建通过，后续测试补充的定向 lint 也通过。版本、SDK、依赖和锁文件未改，
  本地包没有发布。当前树存在其他并行任务的文档与 E2E 日志路径改动，本轮提交只收录
  明确列出的 UI、验收和手册文件；不将其他变更算作本轮实现。
- `npm test`：4,412 通过 / 20 条条件跳过 / 0 失败。随后菜单测量修正的布局模型单测另跑
  3/3 通过。初次类型、lint、生产构建通过；菜单修正后最终生产构建再次通过。
- 独立 Standards：初审 1 项 P3（测试回调长度），已修正；Spec：初审 1 项 P2（缩放测量），
  已修正。两轴复核均 0 残留。完整报告在审查文档的两个独立章节。

范围：当前源码，未发布、不改版本与 SDK。功能对应见 [保留清单](../design/space-ui-integration.md)。所有原能力默认保留，现有权限、平台与 capability gate 仍生效。

## 自动验证

- `npm test`：release、Desktop、IPC 全套回归。
- `npm run typecheck`、`npm run lint`、`npm run build:smoke`。
- `npm run e2e:run -- integrated-workspace.spec.ts`：实际 Electron 设置页；单一设置导航接替项目栏、原导航挂载隐藏、返回后恢复宽度和草稿；六分类、全部主题/质量、窄窗、reduced-motion、Portal 暂停/恢复、Shift+Tab、Provider 定向入口；本机 HTTP fixture 驱动已发布 SDK，在两个不同项目保持真实活动 Run，打开设置不停止它们，结束一个不影响另一个；成果/专注/设置往返保持原状态。另覆盖文件搜索、Partner 工作面与侧栏菜单的隐藏/恢复。没有调用外部模型。
- `npm run e2e:run -- i18n-language-switch.spec.ts`：中文/英文即时切换、重载后保留个人语言、恢复跟随真实系统语言、六分类与外观选项翻译；保存提示使用切换后的语言。测试夹具显式选择英文便于固定选择器，产品默认仍跟随系统。中文深浅色设置与工作区截图保存在测试输出目录。
- Workflow 入口降级：`npm run e2e:run -- workflow-events.spec.ts external-agent-reference.spec.ts right-sidebar-popouts.spec.ts`。验证无运行及运行中左栏均无 Workflow 卡片；顶部活动视图菜单可打开管理面、恢复历史及完整结果、选择外部 Agent；右侧进度/结果及工作面切换保留。
- 既有 settings、i18n、左右侧栏、弹出工作面、Coder/Partner 布局、输入模式/模型、文件/产物与通知回归仍适用。设置的六类 tab ID 保留；测试用命名 region / `settings-workspace`，不再将设置视为 modal。
- `partnerShellLayout.test.ts` 覆盖 600/900/1440 宽度、关闭详情、隐藏导航和无效保存宽度；覆盖率命令：`node --test --experimental-test-coverage --test-coverage-include=apps/desktop/renderer/src/shell/partnerShellLayout.ts --test-coverage-lines=80 --test-coverage-branches=80 --import tsx apps/desktop/renderer/src/shell/partnerShellLayout.test.ts`。

## 人工体验检查

1. 打开至少三个项目，分别保留运行、等待用户、已完成会话。展开/折叠、筛选、更多/全部、拖排和项目/会话菜单均应正常；不得把后台完成自动变成当前会话。
2. 在各项目留不同草稿和附件，开关设置、成果、审查、文件树、终端与专注后返回，确认草稿和运行状态保持。终端在设置打开时不销毁；返回仍可接续。
3. 依次检查偏好、Providers、Runtime、Extensions、License、Diagnostics。原功能清单里的每项仍有入口；Provider 编辑失败、Key 编辑 Escape、Runtime 安全重启与安装确认维持旧边界。
4. 打开 Partner 引用详情或资料选择器，再进入设置。Escape 退出设置，不能关闭隐藏的引用详情；返回后可继续原详情。实际可见确认框/编辑器仍优先消费 Escape。
5. 成果/审查进入专注，再用菜单或 `Ctrl+,` 进入设置。设置分类独占导航区，原项目/文件导航隐藏；设置内 `Ctrl+\` 不改变后台专注。返回后仍是原专注状态，明确退出即可恢复侧栏。文件模式的搜索/展开及导航滚动不应因进入设置重置。
6. 深浅/系统主题分别检查三档效果：极简无背景模糊、均衡静态柔光、全特效局部玻璃与缓慢环境光。无正文透字，长代码/表格不加全局窄宽度限制；键盘焦点可见。
7. 全特效时流式输出、恢复历史、滚动/拖动、切后台；观察环境动画暂停及输入响应。系统 reduced-motion 禁止装饰动画。不同显卡/屏幕缩放的主观流畅度需要目标机器体验，不把本机通过当作跨设备性能保证。
8. 左栏仅保留既有其他入口与项目/会话导航；Workflow 从顶部活动视图菜单打开。当前会话有运行时可在右侧查看进度和控制，结束后最近结果仍可查看；运行不会重新生成左栏常驻卡片。
9. 检查主标签、辅助时间、设置标题的字号比例；确认项目/会话菜单、模型/effort、权限和 Agent 模式、附件菜单、工具折叠、消息复制/分叉/回退、重试倒计时及失败详情仍可操作。上下文液态仪表和 token 统计保留原外观/交互；正文及菜单无背景采样。中文深浅色实图与参考截图放在本机 `artifacts/f147-refinement/`。

## 验证记录

- 初始 RED：原实现没有命名 Settings region，新增操作测试失败。
- 全量单测：4,367 通过，20 项条件跳过，0 失败（随后新增布局边界测试另行通过）。
- 布局接缝：6 项通过，行/分支/函数覆盖率均 100%。最后改动后的手册、floating surface、history 与布局定向单测另跑 35 项，全部通过。

### Standards

残留 0 项。逐 hunk 评审未发现成文规范违反或需处理的基线 smell；最终可见性守卫的六处调用、rootRef 绑定与生命周期复核无新增问题。

### Spec

残留 0 项。CSS 优先级、隐藏模态 Escape、专注导航和隐藏工作区热键均已修正；六类设置、Coder/Partner、并行状态与 Portal 暂停恢复未发现功能删除或未经要求的行为扩展。

- 完整 Electron E2E：112 项通过、3 项按条件跳过、0 失败；三个跳过项需要显式启用真实外部模型视觉检查。最终 typecheck、lint、build:smoke 与改动文件格式检查通过；实际深浅色工作区和设置截图保存在本机 `artifacts/f147/`。
- 中文截图补验发现保存提示捕获了异步切换前的翻译函数；先添加提示语言断言并确认 RED，再将成功通知移到新语言渲染后的 effect。语言解析与设置存储定向单测 33 项通过、1 项因 Windows 符号链接权限跳过。
- 修复后重跑 i18n 与完整工作区定向 E2E，3 项通过；中英保存提示、语言重载保持、系统跟随、工作区状态与双项目运行均通过。typecheck、renderer 构建、改动文件 lint/格式检查通过；中文实图已补齐。
- 2026-10-17 Workflow 入口降级：先用现有历史恢复 E2E 验证左栏卡片缺席并确认 RED（原实现仍有 1 个入口）；移除卡片专用代码后，相关单测 47/47、四个相关 spec 的 Electron E2E 8/8 通过。顶部菜单、外部 Agent 选择、运行时暂停/停止按钮、进度与完成结果、历史磁盘恢复和完整工作面切换均通过；typecheck、renderer 构建、改动文件 lint/格式及 diff 检查通过。中文实图：本机 `artifacts/f147/workspace-zh-without-workflow.png`。

## 2026-10-20 字号、单列设置导航和组件精修

- 功能 RED：旧界面进入设置后仍显示项目栏；设置期间的 Portal 菜单仍可见；400px 自定义导航进入设置会被百分比上限缩到 360px；三个 composer 选择器不响应 Escape。这些信号先于对应修复出现，原有测试断言未放宽。
- 功能 GREEN：设置导航接替原项目/文件栏；原导航保持挂载且隐藏/inert；窄窗往返保留文件搜索，400px 宽度保留；恢复 Partner、专注、成果、草稿、Portal 和两个项目的真实 SDK 活动 Run。主题三档、质量三档和 reduced-motion 检查通过。选择器 Escape 关闭且不改变选项；文件菜单边缘与原键盘/路径操作通过。
- 全量单测 `npm test`：4,405 通过、20 条条件跳过、0 失败。后续手册和菜单模型定向单测 13/13 通过。`typecheck`、`lint`、`build:smoke` 通过。
- 完整 Electron 套件：137 项中 133 通过、3 条 live-model opt-in 跳过、1 项已有滚动问题失败。未将失败改成跳过或放宽像素阈值；详见下段。最后补拍的组件交互 sweep 另跑 1/1 通过。
- 1920×1032 中文深浅色设置、工作区、工具记录和模型菜单实图已人工查看；设置在 640px 可达性由真实 Electron 操作验证。图片在本机 `artifacts/f147-refinement/`，均来自隔离测试 profile 和固定 fixture；不是实际客户会话或外部模型结果。
- 独立 Standards 初审 1 项文档矛盾、Spec 初审 2 项导航边界问题均已修复，并由原评审者复核为 0 残留。最终静态报告见 [精修设计](../design/space-ui-refinement-2026-10-20.md)。
- 独立 Windows Setup/Portable 本地包已生成，未发布、未覆盖原 `out/`；锁定 Registry SDK 完整性预检、`smoke:pack`、`smoke:boot` 和 `smoke:complete-exit` 全部通过，打包版真实 SDK 接缝 6/6。ASAR 未包含本轮诊断探针。产物及日志在本机 `artifacts/f147-refinement/package/` 和同级日志中。

### 已有滚动问题的对照证据

`conversation-receipts-scroll.spec.ts` 的 active streamed 场景在 1080→1600px 后向上滚动，偶尔额外移动一行。完整套件中为 24.375px，独立重复为 2 次失败 / 1 次通过。仅恢复 14px 字号仍可复现。随后从固定基点 `21fd84316e72b4d145ba98113008306f86c64964` 提取全部 20 个受改动 renderer 模块的旧源码，使用同一依赖和原 Tailwind 配置构建独立 renderer；原有用例同样 2 次失败 / 1 次通过，偏移为原字号的一行 22.75px。

此对照证明问题在本轮前已存在；它没有证明底层根因或性能跨设备一致。已捕获的几何表现是离屏内容重新布局时总高度减少，而一次滚动未完全补偿可见段落位置。当前未修改滚动机制、关闭离屏渲染或移除失败测试。源码/探针/日志分别在本机 `artifacts/f147-refinement/baseline-sources.json`、`scroll-probe.spec.ts`、`scroll-repeat.log` 和 `scroll-baseline-corrected.log`。早期未生效的字号覆盖及缺少 Tailwind 扫描的基线尝试不作为有效对照证据。跨设备主观流畅度和该已有问题的修复仍需单独验收。
