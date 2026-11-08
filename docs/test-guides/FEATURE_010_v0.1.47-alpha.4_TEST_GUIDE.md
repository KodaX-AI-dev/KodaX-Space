# macOS 双架构专项验收

## 范围与执行

从 GitHub Actions 手动运行 `macos-acceptance`，选择需要验收的提交所在分支。
任务仅验收，不创建 tag 或发布 Release。Intel 使用 `macos-15-intel`，Apple Silicon
使用 `macos-15`；保留实际系统版本、Node/SDK/Space 版本、提交、签名和安装器哈希。

两种架构分别完成：

- 凭据、迁移、拒绝授权抑制、稳定 Runtime 身份、Git 预检和 Dock 角标回归。
- 构建真实 `.app`、DMG、ZIP，验证应用的 ad-hoc 签名。
- 用成品应用运行 Provider 设置与重启、Agent/Coding/Script、Partner、Skill、审批、
  待回答问题、队列、Stop、退出、完整工具原文、历史浏览与恢复等 UI/Host 接口验收。
- 补验原子输入 token 的 macOS 撤销快捷键，以及窗口展示后的后台节流恢复。
- 所有 E2E 关闭自动重试；失败需保留首次证据，修复后以新提交重新验收。

`macos-acceptance-<arch>-<attempt>` artifact 包含 Node TAP、E2E 原始 JSON、汇总、
失败 trace/截图及身份信息。不得上传用户配置目录、auth.json、旧 vault 或真实凭据。
`macos-installer-<arch>-<attempt>` 保留已验签的 DMG 和身份/哈希，供后续桌面专项使用。
原生 Node 专项不使用 `--test-force-exit`，必须保留完整结果与正常进程退出。

独立 SDK 检查进程读取隔离 profile 的 daemon descriptor，验证 configHome/profile
后使用其 endpoint 和本地 daemon token 连接现有 Host，不根据自身 TMPDIR 推导地址。
Space 在 macOS 使用短 `/tmp` endpoint；外部进程的默认临时目录可能不同。

## 不依赖 OS vault 的验证

`file-credentials.native.test.ts` 启动两个独立 Node 进程，清除 onboarding 测试模式，
通过 `KODAX_HOME` 和 `KODAX_PROFILE_DIR` 隔离合成配置。禁止加载 Electron、Keyring 和
keytar，记录任何被捕获的后端访问尝试。第一进程保存测试 API key 并创建 Runtime 身份，
第二进程重新读取并比较原有身份与 secret 摘要；任何后端访问、身份替换或凭据丢失均失败。
Unix 上同时要求 auth.json 没有 group/other 权限。

这验证生产存储模块在实际 OS/架构上不依赖系统 vault，不等同于完整应用启动过程中
所有第三方连接器都不访问 Keychain。旧版迁移测试中的授权拒绝及故障仍是合成系统边界。

## 仍需桌面环境独立验收

- GitHub 镜像预装 Git/Xcode：缺少开发者工具的用例仍为模拟。用干净 Mac/虚拟机复核
  [Issue 217](ISSUE_217_v0.1.46-rc.3_REGRESSION_GUIDE.md)，不卸载开发机工具链。
- 通知 E2E 模拟系统 show/failed 回执，只验证产品交互；通知中心实际展示、通知授权、
  Dock 外观与点击导航需要桌面观察。
- 旧 Keychain 首次迁移、允许/拒绝授权、DMG 安装后 Finder 启动、系统重启后行为以及
  Gatekeeper 需要独立桌面验收。ad-hoc 签名不等同于 Developer ID 或公证。
- 测试 Provider 使用本地协议夹具；不声称验证真实订阅权限或线上模型质量。

实际执行结果另记在 `docs/research/`；未执行项保持待验收，不以构建成功代替。

## Windows 启动等待回归（2026-11-08）

对应[排查记录](../research/windows-startup-root-wait.md)。使用本机 Windows 隔离桌面，
不使用真实用户 profile。先 `npm run build:smoke`，然后运行：

```powershell
npm run e2e:run -- tests/e2e/renderer-startup-fixture.spec.ts --retries=0 --repeat-each=3
npm run e2e:run -- tests/e2e/renderer-boot.spec.ts tests/e2e/startup-overlay.spec.ts tests/e2e/window-throttling.spec.ts tests/e2e/sdk-ui-contract-acceptance.spec.ts --retries=0
npm run e2e:run -- tests/e2e/settings-modal-interactions.spec.ts --grep="interactive inventory" --retries=0 --repeat-each=3
```

要求：无动画帧时已挂载 root 仍能完成夹具等待；root 确实缺失时拒绝，且清理前的
`startup-root-failure` 附件保留 root、文档和原生窗口状态，不包含用户内容或凭据。
不增加全局等待时限，不将“root 已挂载”当作“Shell 已绘制”或“历史已加载完成”。
非 Windows 跳过此原生后台绘制专项，通用启动/绘制场景继续按各平台执行。
Settings 必须等待异步 policy 控件出现，再核对全部预期名称和无匿名交互控件。
记录实际 SDK 版本；其他 checkout 升级不能代替当前测试进程的版本核对。

## 历史搜索自动滚动与输入验收（2026-11-08）

```powershell
node --test --import tsx apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts
```

当前页搜索从页顶定位页尾工具内容时，即使采用 12 倍 CPU 限速，也不得自动读取相邻页。
全历史结果定位后“返回结果”恢复原页，不因程序滚动多发分页读取。保留原有回到最新、
延迟读取、会话切换和搜索焦点恢复断言。键盘、触摸、滚动条分别使用隔离 Chromium 页面，
验证向新/向旧两个方向的用户翻页；滚轮继续由原完整场景覆盖。
滚动条场景显式启用 headless 默认隐藏的原生轨道，不能用不存在的轨道冒充拖动验收。
触摸还需覆盖同次手势中途反向；滚动条需覆盖同次按下连续跨页，以及释放、取消后的后续移动不再声明拖动。
原生轨道连续跨页必须使用真实 `page.mouse` 按住拖动，分别向新、向旧连续跨两页，
不能只派发 DOM PointerEvent：原生轨道拖动可能只发 scroll，不持续发 pointermove。
首轮锚点恢复后 8 帧内继续拖动也须跨页，且按住时的程序搜索不得误翻页。
稳定页确认到底后，同次按住以 1 步和 12 步反向拖到顶部也须正常翻页。
合成指针事件仅补充释放、取消及延迟 scroll 的生命周期边界。
`sdk-history-navigation.spec.ts` 还需对真实 SDK 冻结历史窗口执行相同原生拖动，
保留长段内容、工具与报告，确认每个方向经过至少两个不同且严格单调的窗口，
不能把 A→B→A 计作两页；最后单一向下入口恢复最初实时窗口的精确消息 ID。
这些是 DOM/浏览器交互契约测试，不代替各 OS 的物理输入设备验收。
