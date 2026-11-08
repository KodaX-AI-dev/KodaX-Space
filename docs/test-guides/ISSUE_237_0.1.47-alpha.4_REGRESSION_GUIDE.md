# Issue 237：旧会话正文补读与通知刷屏

2026-11-07，Space 0.1.47-alpha.4 / 本地链接 SDK 0.7.97-beta.2。

## 复现与根因

会话 `20260928_160252_occb6cfe737bfa` 的 34 次长内容读取中，12 个 thinking
项返回 null。SDK 将旧 view 的 `:history:` 身份误路由到历史 opaque 引用读取器。
运行中后台与磁盘 bundle 指纹相同，并非未安装最新 SDK。Space 又在每项失败时
分别弹窗并删除尝试记录，后续快照和其他正文补读完成时会再次尝试，形成刷屏。

SDK 修复先查询 view owner，再回退到历史引用读取。Space 展示预览，正文进入视口、
展开对应详情或用户复制时才补读。读取失败保留该项的预览、技术详情和重试按钮。
收起的工具组与思考片段不触发读取，单项失败不会弹出全局通知。

## 自动验证

在 Space 根目录运行：

```powershell
node --import tsx --test apps/desktop/renderer/src/shell/productBodyWarnings.browser.test.ts apps/desktop/renderer/src/lib/productItemContent.test.ts apps/desktop/renderer/src/store/productSessionView.test.ts apps/desktop/renderer/src/store/productSessionView.browser.test.ts apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts
npm run typecheck
```

在相邻 KodaX 根目录运行：

```powershell
npx vitest run src/sdk-runtime.legacy-view-read.test.ts src/sdk-client.history.test.ts
```

浏览器回归覆盖 30 项收起的思考片段、当前可见回答、单个工具的输入和结果、
滚入视口的消息、未完成的流式输出及切换会话期间的复制。只有读到完整正文才写入
剪贴板并显示成功。版本错误、过期的引用和迟到的读取保留原剪贴板内容。
缓存回归另外覆盖相同 ID 在实时与历史两个来源中出现以及更换 Runtime 的情况。

原会话另经临时隔离副本重放，修复后的源代码 Runtime 完成 34 次补读、0 次失败；
未改原会话、未发消息、未调用模型。此证据不等于当前运行的 daemon 已被更新。

## 应用与人工验收

当前 `node_modules/@kodax-ai/kodax/dist` 链接到相邻 `KodaX/dist`。本次验收的 SDK 已构建到该目录。通过 Space 的“彻底退出”退出开发实例，再从 Space 根目录执行 `npm run dev`。开发产物与 registry 包的版本号相同，核对实际加载的 Host 时使用下文的指纹。

1. 打开旧会话，先阅读当前可见的提问与回答。展开一个思考或工具的详情，
   确认该项完整可读，仍收起的其它详情不发起补读。
2. 令一个完整正文读取失败，确认原位显示预览、“重试”和技术详情。在该项按复制，
   读取失败时剪贴板保留原内容。等后台恢复后直接重试，确认能在原处读到全文。
3. 已提交的长回答使用非零正文偏移的尾部预览。点击复制后，核对剪贴板包含
   开头和末尾，已复制确认仍可见。流式尾部尚未提交时显示预览说明。
4. 在迟到的读取完成前切换会话，确认新会话和剪贴板均未被旧请求更新。

本轮未替换运行中的用户后台，未发布 SDK 或安装包。

## 整体验证范围

Space 的正文、浏览、搜索及操作目标定向回归共 123 项通过。完整 `npm test` 在 SDK 候选 A 上运行，release 检查 147 项通过、7 项跳过，desktop 4,180 项通过、5 项失败、13 项跳过，IPC schema 371 项通过。5 项失败涉及工作模式切换、Partner 输入及斜杠命令清单；在保留同一工作区的工作模式改动、移除本次历史功能实现的隔离对照中也分别失败。最终候选 B 的 SDK 合约、Provider、应用和 Windows 包验收见下文及[SDK 实施记录](../research/sdk-view-history-action-boundaries-2026-11-07.md)。

## 2026-11-07 阅读与性能复核

Windows、Node 22.23.1，独立本地源码 SDK Runtime、生产模式 React 与无头 Chromium。旧会话只复制目标会话文件与项目标识到临时档，重新校验原文件 SHA-256 一致。全程未向模型发消息。浏览器使用当前 ConversationStreamV2、分页 Store、桌面 CSS 和受控 IPC，真实 SDK 大样本耗时另测。

| 样本与操作 | 观测值 |
| --- | --- |
| 旧会话副本，SDK 直接读取 | 当前副本 view 有 111 项。16 个需补齐的文本/输入全部完成分块校验，共 171,518 个 UTF-8 正文字节。最新历史页返回 201 个显示项，状态为 resolved。这里使用的独立 Runtime 没有复刻原进程全部活动状态，因此单列之前现场的 34 次读取。 |
| 同一副本，停在首次打开的窗口 | 把 ConversationStreamV2 的读取策略固定到 Space e7e041a8 作为对照，同一副本实际触发 16 次、171,518 字节，首个已提交可读帧 263 ms（对照 1 次）。本次实现 3 次均为 1 次、1,040 字节，首个可读帧 117–131 ms，无全局提醒。计时从给已启动的 Renderer 提供数据开始。 |
| 生成 120、200 条带唯一序号的 SDK 对话，实际点击打开保存页、滚轮前后翻、点击回到最新 | 120 条的可读范围依次为 41–120、1–120、41–120。200 条的范围依次为 121–200、51–200、1–50、51–200、121–200。每步从真实消息行取编号并核验整段连续、无重复。 |
| 实际 SDK，10,000 条不同长度的持久化消息，其中一条同时含多 MB 思考和普通回答 | 一次本地读取测得首个 view 299 ms；精确词命中 1 条，275 ms。全部 67 页有 10,001 个显示块，10,000 个序号正向完全一致。最新页 79 ms，全页耗时中位 11 ms、P95 为 14 ms。 |
| 独立 Chromium 压测，10,000 个混合显示项分页，当前 view 80 项，包含一个收起的 3.84 MB 思考 | 3 次新页面，首个可读帧 94–109 ms。首屏 64 个渲染行，发起 0 次正文字节读取。主动在历史中段展开后读 30 块，3,840,000 个 UTF-8 字节。点击至新内容可绘制 160–163 ms，当页 8,192 个 UTF-16 单元。真正的中段阅读位置上，展开按钮相对屏幕的坐标变化三次均为 0 px。JS 堆由 50.5–51.6 MiB 到 68.2–69.4 MiB。首屏长任务记录有 0 或 1 项，最长 72 ms，展开没有新增超过 50 ms 的长任务。切入最新保存页 100–107 ms；前四个相邻旧页单次 81–94 ms。 |

压力样本以同一段中英文字生成 1,920,000 个 UTF-16 单元。整段直接排版时，两次实验中 Chromium 完成读取后持续占用 CPU，布局查询无法在 30 秒内完成。超过 65,536 个 UTF-16 单元的思考正文分段呈现，每段约 8,192 个单元，避开 UTF-16 代理对中间。每段均可前后浏览，复制全文写入完整原文。小于等于阈值的思考沿用已有排版。浏览器回归遍历所有段，核对拼回后的 Unicode 源文以及完整剪贴板。

浏览器混合样本由受控 IPC 按页提供，用于测量 Renderer，不含真实 daemon 传输开销；字节数只计正文，不含 IPC 元数据。首帧不含应用启动或打包桌面的冷启动。堆取自 Chromium 的精确 JS heap 计数，受 GC 调度影响。上述单机结果用于复查量级和回归，不能推算其他机器上的延迟。

### 同一输入的发布版与本地 SDK 对照

用 npm registry 的 `@kodax-ai/kodax@0.7.97-beta.2` 发布 tarball（SHA-256 `06D535F6…ADCA3B1B`）与本地第一次候选构建 A 分别启动真实 daemon。A 的 CLI SHA-256 是 `34C5BFA0…E6107A31`，Host 指纹是 `8B8A3EE9…A25C13A`；`B97EC72B…2477AA2` 仅是客户端 runtime 入口摘要。三次 A 的 daemon 都在该 CLI 安装之后启动，均已撤销较早的 Host 拆包尝试。固定一份旧会话磁盘快照，每次复制到新的 SDK home。交替进行 3 对读取，计时从 daemon 已连接后发起首次 `sessions.observeView` 开始，接着调用 `sessions.readHistory({limit:150})`。两边的 view 均为 111 项，历史均为 201 个显示项，顺序及正文、工具输入的摘要完全相同。

| 同一会话，3 次新 daemon | registry beta.2 | 本地候选 A |
| --- | --- | --- |
| 首次 view，ms（中位） | 471.3、525.6、980.1（525.6） | 613.7、995.0、959.5（959.5） |
| 紧随其后的历史首页，ms（中位） | 23.9、27.7、35.5（27.7） | 31.3、42.1、42.3（42.1） |
| 完整 view JSON，UTF-8 字节 | 198,359 | 213,979 |
| 带 historyBoundary 的 view 项 | 0 | 110 |
| 完整 history JSON，UTF-8 字节 | 434,913 | 434,913 |

本机样本中候选 A 的 view 增加 15,620 字节（约 7.9%），带上了原先缺少的来源边界，两类读取的中位耗时均上升。发布版与 A 之间还有其他代码变化，同机也有构建任务，单凭这三对记录无法对延迟归因。Renderer 按需减少正文读取的结果独立列在上表。

### 相同源码下的历史模块冷加载对照

在同一份 SDK 源码上两次构建 CLI，仅切换 esbuild 对私有 `client-history.js` 的外置与路径改写规则，其他打包配置相同。这个临时对照只验证模块加载成本。使用上节同一份会话文件，各跑四个独立 daemon，按交错顺序读取。以下耗时未开启模块跟踪。

| 中位时间，ms | 单独加载历史模块 | 历史模块编入 CLI |
| --- | --- | --- |
| 首次 view（四次范围） | 603.7（596.5–620.2） | 489.1（479.0–523.6） |
| 随后首次读取历史首页 | 30.6 | 29.8 |
| 再读同一页 | 22.7 | 23.5 |

八次 view 和历史的项数、文本与输入摘要、JSON 字节数完全相同。另用 Node 模块加载钩子在独立进程中复测，区分客户端和已启动的 daemon，并记录首次 `observeView` 的起止时间。在此期间，外置构建的 daemon 新加载了 `client-history.js` 及 40 个包内共享 chunk，编入 CLI 的构建新增 0 个包内 JS 模块。同一阶段两个客户端也均新增 0 个。该对照测得的 115 ms 差异只对应本机首次 view 的模块装载路径。

### 最终候选 B、原候选 A 与发布包复核

候选 B 的 CLI SHA-256 为 `B3CC44A2…11A5CAB2`，Host 指纹为 `E68408E6…B4ADCC9E`。B 让首次 view 在 CLI 内执行常用的持久化条目读取，历史展示的投影仍按需加载。分别冻结 A、B、registry 发布产物，每次从相同只读快照建立全新 home，轮换顺序运行 12 个真实 daemon；该批耗时均未开启模块跟踪。

| 四次中位，ms | 发布 beta.2 | 候选 A | 候选 B |
| --- | --- | --- | --- |
| 建立 daemon 连接，含拉起 | 2138 | 3874 | 3466 |
| 首次 view（范围） | 668（602–794） | 752（721–758） | 661（632–752） |
| 接着读历史首页 | 31 | 37 | 33 |
| 二次读同一页 | 26 | 28 | 26 |

三版的 111 个 view 项和 201 个历史显示项顺序、文本与工具输入摘要完全相同，历史 JSON 均为 434,913 字节。B 与 A 的 view 均为 213,979 字节，具有 110 个有效来源边界；相对发布包增加了 15,620 字节。另做独立模块跟踪，A 的首次 view 让 daemon 新加载 41 个包内 JS 文件，B 和两版的客户端均为 0。随后第一次读历史页，两版的客户端各加载 `client-history.js` 和 1 个共享 chunk，各自的 daemon 均为 0。所有运行结束后重新核验原会话六个输入文件，SHA-256 与只读副本一致。

该批中 B 已回到发布包的首次 view 延迟范围。发布包的 daemon 连接中位时间仍短约 1.3 秒。A 到 B 还包含历史居中页调整及打包预置文件变化，registry 到本地包含更多版本差异，应结合上节的单变量对照判断模块装载成本。

对照 SDK `58671f8d`，建连沿用原有 startup coordination 和传输路径，Host 在原有握手数据上声明新的历史能力。B 静态引入的 `conversation-entry-reader` 只定义有界读取函数和常量，顶层沿用 agent 诊断依赖。逐会话的条目读取在打开 view 后发生，动作的历史捕获在调用 `resolveHistoryTurn` 时发生。随后对同源 SDK 仅开关历史功能，结合原批次日志逐段复查，已定位到 Windows Host 发布前同步读取系统开机时间的开销。详见[冷启动到建连的同源对照](../research/windows-daemon-cold-connect-2026-11-07.md)。

## Windows Electron 与真实 SDK 包

在隔离目录安装 Space 锁定的 registry SDK 0.7.97-beta.2，再用相同 Space 代码通过源码 Electron 打开原会话副本。旧 Host 能读取 111 个实时项和 201 个首页历史项。解析最新轮明确返回 `unsupported`。旧 SDK、候选 SDK 使用同一个版本号，验收以各自物理包及 Host 能力为准。

候选 SDK 的源码 Electron 和 `win-unpacked/KodaX Space.exe` 各通过 8 个历史场景。用户会话只复制两个数据文件到测试 profile，未复制凭据。通过 Renderer IPC 取实时项，其中七个用户项都能解析，绝对索引为 13–19。选中索引 13 创建子会话，再在源副本确认保留该轮并回退。重新读取子会话和源副本的末轮均为 13，这个场景向测试 Provider 发起 0 次请求。

其余七个用例从 Electron 界面操作。260 轮样本覆盖显式打开最新保存页、双向翻页和返回最新，还验证本页零匹配、切换会话搜索、原文预览、定位到命中、返回结果恢复焦点。真实本地 HTTP Provider 生成的十万字符回答在当前页面和重载后均可读到头尾。另覆盖恢复 checkpoint 后继续发送、未完成工具的时间戳、工具完成后重载并 Fork，以及拒绝旧回退确认后重新选择、回退、再发送。

可用 `npm run e2e:run` 执行 `tests/e2e/sdk-history-navigation.spec.ts`、`sdk-restored-history.spec.ts`、`sdk-product-output.spec.ts` 的 bounded output 用例及 `sdk-unified-contract.spec.ts` 的 tools / canonical boundaries 用例。设置 `SPACE_E2E_EXECUTABLE` 指向打包的可执行文件可复用这些操作。含用户数据的第八个用例仅在本机隔离副本运行。

候选包 SHA-512 为 `Cpd8yWftXVtZl41fFheYU+tl6X0LWktDijOTkz9QxwlypQ7ouz4U6Y06yUIMsARdltCDdWnXNwUBjXjbihb6JQ==`，SDK Host 构建指纹为 `e68408e649681a0cbffe2b1abc66d4eea349049b7fd3721944cd63c5b4adcc9e`。Windows 本地构建使用完整的 SDK 生产产物，并在构建 JS 之前备妥所有平台的 native 信任清单，外平台的 native 文件沿用锁定版本。Space 验证候选 tarball 与已安装文件逐项一致。开发工作区的 SDK 链接和 lockfile 保留原状。

最终本地候选的历史场景两组均为 8/8，各耗时约 2.1 分钟。打包依赖检查从 app.asar 启动真实 Runtime 和 Worker，通过 Windows native 校验。独立冷启动检查中 Renderer 在 5.73 秒就绪。故意延迟 daemon 20 秒后 Runtime 在 29.01 秒就绪，122 条历史子进程记录完整保留。这组启动时间有测试等待，应与前节阅读性能分开比较。

`npm run build:test-kodax` 通过。打包流程自带的 6 个真实 Host 合约用例全部通过，包含最后一个客户端退出后 daemon 结束、另一个客户端仍连接时保留其运行。这 6 个用例中有 2 个亦属于上述 8 个历史场景。

## 本地开发入口与模型调用验收

Space 开发入口和干净 Windows 包的 CLI SHA-256 均为 `b3cc44a28bed367b8a63b2d2e794b567e80ec3c0b119c2cfed74c0a011a5cab2`。开发目录逐文件核对了候选的 295 个文件，并保留旧进程可能延迟加载的已有 chunk，因此其完整目录指纹为 `e8a109d5c6166973456f01196c45fee147dcc9dd3ec1a54299533631d9946554`，干净打包目录使用前节的 `e68408e6…`。切换后 Space 类型检查通过，工作区 SQLite 已恢复为 Electron ABI。

使用该开发入口、新建的隔离 daemon 和本地 HTTP 测试 Provider，覆盖了工具调用、读取工具结果、Fork 后继续对话。三次运行均完成，四次 HTTP 请求均有预期授权。直接检查包含指定 Fork 续问的请求，其中 `tool_call` 与 `tool` 结果 ID 配对，未出现缺失结果的调用。此项验证传给模型的上下文完整性，未测量在线模型回答质量。

## SDK 0.7.97-beta.3 隔离升级验收

本节使用来自 `codex/beta3-integration` 的本地 SDK 候选，tarball SHA-256 为 `8a05e09ab44909033be73f7fca45c9a1395669d578c7ba809810ba53e9865ff3`。在临时 Space 副本用 `npm ci` 安装，打包前比对归档与实际 SDK 文件全部字节。前一候选的 Windows npm 安装会改写 CLI 首行的 CRLF。最终归档将 CLI 入口固定为 LF，实际通过该字节比对。Space 开发目录的 manifest、lockfile 和本地 SDK 链接保持原状。

同一版 Space 源码配 registry beta.2 的旧 Host，从用户会话的隔离副本读取到 111 个实时项及 201 个首页历史项，整轮解析返回 `unsupported`。另用官方 beta.2 tarball 启动一次真实带工具的旧 Run，在该 Run 未完成时将安装位置替换成 beta.3 候选的内容。Host 报告 `active_runs` 并保留旧进程。旧 Run 完成后升级，同一 Session 的已保存 transcript、设置和工具结果完整保留。升级前后主 Provider 请求数均为 2，测试工作区的工具标记只写入一次，旧运行的终态为 `completed`。

同一 tarball 在源码 Electron 和 Windows 打包应用中分别通过上节 8 个场景，各耗时约 2.3 和 2.4 分钟。用户会话副本的 7 个可见用户项全部解析成功，Fork 和回退实际写入后重新读取的末轮一致。工具场景增加了子会话实际续问：本地 HTTP Provider 收到原问和续问，三项 `write`、`read`、`space_manual` 调用各自对应一条非空、同 ID 的结果。该验证覆盖 Host 实际发送的模型上下文，使用的是回环测试 Provider。

Windows 打包依赖检查、app.asar 中真实 Runtime 和 Worker 启动、原生模块及冷启动检查均通过。冷启动样本中，122 条历史子进程记录保留，Renderer 7.95 秒就绪，特意延迟 daemon 20 秒后 Runtime 30.27 秒就绪。

`build:test-kodax` 最后的 6 个 Host 契约用例全部通过，覆盖取消后继续发送、工具与 Fork、队列只消费一次、退出最后一个客户端、回退竞争及保留其他已连接客户端。其中工具与回退两项也计入上述 8 个历史场景。

## 2026-11-08 Registry beta.3 验收

Space 已从 npm 安装发布的 `0.7.97-beta.3`，Root、Desktop 和 lockfile 使用同一精确版本。
Registry SHA-512 及逐文件安装核验通过，源码 Electron 与 Windows 成品各覆盖 13 项历史及
模式场景。源码搜索场景修正 SDK 索引范围的测试预期后单独复跑通过，成品 13 项一次通过。
工具输入与正文命中能够进入同一持久条目的上下文，思考和多个工具结果同时展开，返回后
恢复原展示模式及同页工具卡的折叠状态。

直接连接该正式 SDK 的隔离 daemon，读取原问题会话副本中的 16 段长正文，共 142,030
字符，全部完整返回。原会话两个输入文件的 SHA-256 在前后保持一致。完整测试、安装
完整性及成品检查见 [beta.3 接入报告](../releases/kodax-beta3-space-adaptation.md)。
