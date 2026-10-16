# F147 — 连续工作区与完整设置页面回归

范围：当前源码，未发布、不改版本与 SDK。功能对应见 [保留清单](../design/space-ui-integration.md)。所有原能力默认保留，现有权限、平台与 capability gate 仍生效。

## 自动验证

- `npm test`：release、Desktop、IPC 全套回归。
- `npm run typecheck`、`npm run lint`、`npm run build:smoke`。
- `npm run e2e:run -- integrated-workspace.spec.ts`：实际 Electron 设置页；六分类、草稿、全部主题/质量、窄窗、reduced-motion、Portal 暂停/恢复、Shift+Tab、Provider 定向入口；本机 HTTP fixture 驱动已发布 SDK，在两个不同项目保持真实活动 Run，打开设置不停止它们，结束一个不影响另一个；成果/专注/设置往返保持原状态。没有调用外部模型。
- `npm run e2e:run -- i18n-language-switch.spec.ts`：中文/英文即时切换、重载后保留个人语言、恢复跟随真实系统语言、六分类与外观选项翻译；保存提示使用切换后的语言。测试夹具显式选择英文便于固定选择器，产品默认仍跟随系统。中文深浅色设置与工作区截图保存在测试输出目录。
- 既有 settings、i18n、左右侧栏、弹出工作面、Coder/Partner 布局、输入模式/模型、文件/产物与通知回归仍适用。设置的六类 tab ID 保留；测试用命名 region / `settings-workspace`，不再将设置视为 modal。
- `partnerShellLayout.test.ts` 覆盖 600/900/1440 宽度、关闭详情、隐藏导航和无效保存宽度；覆盖率命令：`node --test --experimental-test-coverage --test-coverage-include=apps/desktop/renderer/src/shell/partnerShellLayout.ts --test-coverage-lines=80 --test-coverage-branches=80 --import tsx apps/desktop/renderer/src/shell/partnerShellLayout.test.ts`。

## 人工体验检查

1. 打开至少三个项目，分别保留运行、等待用户、已完成会话。展开/折叠、筛选、更多/全部、拖排和项目/会话菜单均应正常；不得把后台完成自动变成当前会话。
2. 在各项目留不同草稿和附件，开关设置、成果、审查、文件树、终端与专注后返回，确认草稿和运行状态保持。终端在设置打开时不销毁；返回仍可接续。
3. 依次检查偏好、Providers、Runtime、Extensions、License、Diagnostics。原功能清单里的每项仍有入口；Provider 编辑失败、Key 编辑 Escape、Runtime 安全重启与安装确认维持旧边界。
4. 打开 Partner 引用详情或资料选择器，再进入设置。Escape 退出设置，不能关闭隐藏的引用详情；返回后可继续原详情。实际可见确认框/编辑器仍优先消费 Escape。
5. 成果/审查进入专注，再用菜单或 `Ctrl+,` 进入设置。宽度允许时项目栏可见；设置内 `Ctrl+\` 不改变后台专注。返回后仍是原专注状态，明确退出即可恢复侧栏。
6. 深浅/系统主题分别检查三档效果：极简无背景模糊、均衡静态柔光、全特效局部玻璃与缓慢环境光。无正文透字，长代码/表格不加全局窄宽度限制；键盘焦点可见。
7. 全特效时流式输出、恢复历史、滚动/拖动、切后台；观察环境动画暂停及输入响应。系统 reduced-motion 禁止装饰动画。不同显卡/屏幕缩放的主观流畅度需要目标机器体验，不把本机通过当作跨设备性能保证。

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
