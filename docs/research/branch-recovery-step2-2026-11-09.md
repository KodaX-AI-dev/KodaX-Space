# 历史分支修复提取：第二步

## 范围与需求

按已确认的第二步，只提取五项修复，不整分支合并。基线为远程主线 `ce15d123`，SDK 保持 Registry `0.7.97-beta.4`。其他线程的 `codex/alpha4-release-final` 分支和工作树、现有 `design-demos/` 均不修改。历史连续浏览与用户提问视觉强调留到第三步；在线预览、Whisper、F144 与清理分支不属于本次范围。

| 修复                  | 原提交                  | 本次提交   | 必须保留的行为与测试边界                                                                                                                                                                                             |
| --------------------- | ----------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Artifact 独立窗口     | `528317a9`              | `279b175c` | `artifact.openWindow` 能显示持久化交互 HTML；只允许 renderer `/index.html` 的客户端 fragment，查询、资源 fragment、路径穿越仍拒绝。协议公共函数与真实 Electron 窗口回归                                              |
| 当前侧栏重命名        | `ca64e3f3` 的重命名部分 | `3cfdcec0` | 项目/会话 Enter 或失焦保存一次，IME 确认不提交，Escape 取消，失败保留原名称并提示，菜单 Escape 恢复焦点。真实 LeftSidebar 与 IPC 替身；不恢复该提交中的历史分页和用户气泡样式，也不扩大到未使用的旧 SessionList      |
| Partner 首页场景      | `0627cfa4`              | `ba1d5b9f` | 成功绑定专家后用单个场景模板替换草稿，包括已编辑内容；重复选择不叠加，失败/上下文切换不覆盖，不自动创建或发送；普通方法插入仍按光标追加。真实任务卡、Provider、BottomBar 和当前 Lexical 输入框                       |
| Partner Artifact 高度 | `fe80c7db`              | `77a8e008` | 预览占满工具栏下方空间，长报告内部滚动，缩放、短版本、HTML、标签与汇总入口保持正确尺寸。真实详情工作区、预览组件与生产 CSS                                                                                           |
| Partner 连接器恢复    | `81a598ff`              | `99a7188b` | 组件/版本/验证失败与实际身份变化区分；可显式重试会话校验，保留账号 revision、范围和草稿；空草稿清错不授予失败范围，再选择仍走宿主校验。不自动断连、重授权、创建、发送或读写远端文档。service、binding 与真实弹窗组件 |

## 已完成的红绿验证

- Artifact：协议解析先返回 `400 invalid-url`，修复后 6 项通过、1 项 Windows 符号链接权限条件跳过；原始独立窗口 E2E 与其他 4 项 Artifact 场景均在源码和 Windows 成品中通过。
- 侧栏：真实组件先复现失焦丢弃修改，修复后 Enter/失焦次数、IME、取消、拒绝反馈、焦点与项目重命名通过。
- 场景：当前 Lexical 输入框先出现研究与数据模板拼接，修复后六类场景、反复切换、通用方法插入与失败/过期保护通过。
- 高度：生产样式下复现 960px 标签页内仅 150px 预览；修复后全部尺寸与切换断言通过。旧回归在汇总入口补充等待新标签建立，避免测量已卸载的旧 iframe。
- 连接器：先分别复现空草稿旧错误不清除、组件错误误报账号变化、两个弹窗场景缺少重试按钮；修复后三个测试文件共 71 项通过。

红绿日志位于忽略目录 `artifacts/diagnostics/step2-*-{red,green}.log`。测试使用隔离资料与模拟连接器宿主，不访问真实账号或远端文档。

## 集成验收

代码候选 `99a7188b`，基线 `ce15d123`。以下均在同一组五项修复上运行，后续仅补验收文档，不改变已验证的运行时代码。

| 检查             | 结果                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 类型、lint、格式 | `npm run typecheck`、`npm run lint`、改动文件 Prettier 检查及 `git diff --check` 全部通过                                 |
| 完整 `npm test`  | 4,740 项通过、20 项条件跳过、0 失败；Desktop 4,214/13 跳过，Schema 373，发布脚本 153/7 跳过                               |
| 生产构建         | `npm run build:smoke` 通过                                                                                                |
| 源码 Electron    | Artifact HTML、Partner bundled、Partner layout 三个文件共 11/11，`retries=0`；含独立窗口持久化 HTML、专家选择与跨宽度布局 |
| Windows 目录包   | `node scripts/pack.mjs --win --dir` 通过；Registry 完整性、原生资源、asar Worker、SQLite、Host 协商检查均通过             |
| 冷启动           | Renderer 4,599 ms 就绪，Runtime 在确定性延迟后 25,992 ms 就绪，122 条历史子进程记录保留                                   |
| Windows 成品 E2E | 同一组界面场景 11/11，加打包内置真实 SDK/退出场景 7/7，共 18/18，全部首次尝试通过                                         |

Electron 与成品测试使用隔离桌面和临时资料。本轮未进行 macOS/Linux 实机、真实连接器账号或外部文档操作验收；未创建新标签、Release 或发布安装器。`SPACE_PACK_REGISTRY_TIMEOUT_MS=1200000` 仅用于下载等待，仍核验锁定 Registry tarball 与已安装 SDK 的字节完整性。

源码及成品界面场景命令为：

```powershell
npm run e2e:run -- tests/e2e/artifact-html-runtime.spec.ts tests/e2e/partner-bundled.spec.ts tests/e2e/partner-layout.spec.ts --retries=0
```

成品运行前将 `SPACE_E2E_EXECUTABLE` 指向 `out/win-unpacked/KodaX Space.exe`。完整日志在 `artifacts/diagnostics/step2-{typecheck,lint,full-tests,build,e2e-source,pack,e2e-packaged}.log`；已有源码和成品验证均完成，不需要为文档收尾重复运行。

## Standards

只读审查 `ce15d123...99a7188b`：五项修复沿用现有组件、IPC 与宿主校验边界，用户手册、应用内主题和 Partner 历史记录同步完整。成文规范问题 0，坏味道基线发现 0；最高严重项无。审查没有代替实际自动化验收。

## Spec

只读审查未发现需求缺失、超范围行为或可确认实现错误；五项改动符合上表行为与保护条件，没有混入第三步或延后的功能。需求问题 0，最高严重项无；真实 Electron 与 Windows 成品结果以集成验收记录为准。
