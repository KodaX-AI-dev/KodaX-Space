# SDK 当前窗口、历史消息与 Fork/回退的操作边界

TL;DR：旧消息关联失败确实发生在 SDK→Space 接缝，但“给 view 补上 historyBoundary”尚不足以证明整轮 Fork/回退正确。已有字段表示**单条 canonical 消息之后**，不是整轮结束；工具显示项还可能包含下一条消息的结果。建议由 SDK 提供可证明的完整轮次操作目标，再由 Space 所有入口统一消费；优先评估一个窄的只读边界解析接缝，不扩展通用 action 框架。本文只记录调查与方案取舍，不代表实现方案已批准。

调查日期：2026-11-07。源码基线：KodaX HEAD `58671f8de`、Space HEAD `47221d32`，同时存在用户与前轮任务的未提交改动。下列行号以本次读取的工作树为准；未修改运行代码、未部署、未操作原用户会话的 Fork/回退。

## 1. 现有契约并未把 message boundary 定义为 turn boundary

`ClientViewItem.historyBoundary` 已是公开可选字段，注释明确为“完整 canonical 消息之后，同一消息的显示块共享”。它不限定只能出现在历史页，但也没有承诺每个 view 项必有边界。`inputId` 则明确允许旧历史缺失。[类型定义](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/client-contract.ts:772)

公开接缝文档明确保证的是 `readHistory` 中**可证明 canonical 位置**的条目携带 `{entryId, sourceRevision}`；不得从显示 ID、搜索序号或正文推导。Fork 包含边界消息，Retry 在查询消息之前，Rewind 另带所见 lineage 的 expectedHead。`partial/ambiguous` 不保证每条消息可操作。[canonical 接缝](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:320)

因此，把 view 中缺少该可选字段直接称为“违反已承诺的每项必备契约”证据不足；可以确认的是产品需要的操作接缝不完整。本轮临时重复 prompt/answer 探针曾得到 view 四项边界均 undefined、history 四项边界均有效的失败信号；该探针已撤回，以免把“所有 view 必须带边界”这一候选方案锁成正式测试要求。它是调查证据，不是保留回归。[契约范围](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:322)、[下游调查](space-history-action-entrypoints-2026-11-07.md)

已有产品级派生回归从 `readHistory` 取得第一轮最终文本的 message boundary，再调用 Fork/Rewind，证明这一明确消息目标可用；并未证明任意显示窗口的“整轮末尾”均可由最后一个可见项确定。[既有派生测试](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-client.derive.test.ts:104)

## 2. 上游信息在哪一层丢失

Runtime 的 `conversationPage` entry 本来有 `index`、可选 `boundaryId`，整页有 `revision`、`sourceRevision`、`status` 和 `issues`。[页类型](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:1481)

历史读取保留来源：`projectConversationHistoryPage` 从 entry 投影多个显示块，并把同一个 entry 的 boundaryId 与页面 sourceRevision 附到每个块；历史 display ID 另以 page revision、entry index、block ordinal 构造。[历史投影](C:/Works/GitProj/KodaX-AI/KodaX/src/client-history.ts:26)

当前 view 读取则在 `readConversationHistory` 把同一来源页降成 `KodaXMessage[]`，只 push `source.message`，丢弃边界、页状态和 sourceRevision，再传给 `restoreSessionViewItems`。这是可定位的信息损失点，不是 Space 等待时长不够。[来源降维](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:4591)、[view 调用点](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:4686)

view 恢复为有身份的新消息使用 inputId/outputId；旧消息则可能复用旧显示 checkpoint，或生成 type/text/timestamp 指纹及 occurrence。这些是**显示身份**，不是存储 entry 身份。仅靠它们不能在 Space 内推算 canonical 操作位置。[恢复规则](C:/Works/GitProj/KodaX-AI/KodaX/src/session-view.ts:863)、[旧显示 ID](C:/Works/GitProj/KodaX-AI/KodaX/src/session-view.ts:931)

这个区别也被正式文档说明：旧无 inputId 消息不获得追溯输入身份；跨读取面关联必须验证来源唯一，不能按全文匹配；客户端不解析旧显示 ID 格式。[跨面关联约束](C:/Works/GitProj/KodaX-AI/KodaX/docs/CLIENT_CONTRACT.md:489)

## 3. “最后一个可见边界”存在真实反例

历史投影把 assistant 的 tool_use 与后继 user 的 tool_result 合成一个工具显示项，但给该工具项的边界仍是 **assistant owner entry**。下一条纯 tool_result canonical 消息通常不生成独立可见项。因此工具显示已经 success，并不说明该工具项的 historyBoundary 包含结果消息。[结果合并](C:/Works/GitProj/KodaX-AI/KodaX/src/client-history.ts:41)、[owner 边界赋值](C:/Works/GitProj/KodaX-AI/KodaX/src/client-history.ts:62)

2026-11-07 的隔离实验确认了实际后果：创建三条 canonical 消息 `user → assistant(tool_use) → user(tool_result)`，从历史工具项取得边界并 Fork。工具显示为 success，但 Fork canonical 消息仅有 `user, assistant`，不含 tool_result。这里只调用本地存储和源代码 Runtime，无模型调用、无原会话修改。实验结果与上述 owner 边界契约一致，说明**单条消息语义并不等于用户想保留的完整工具回执/整轮语义**。[Fork 按所选 entry 截取](C:/Works/GitProj/KodaX-AI/KodaX/packages/repl/src/interactive/storage.ts:5629)、[源路径派生](C:/Works/GitProj/KodaX-AI/KodaX/packages/repl/src/session/conversation-history.ts:1296)

实验输出摘要：

```json
{
  "toolStatus": "success",
  "sourceMessageRoles": ["user", "assistant", "user"],
  "forkMessageRoles": ["user", "assistant"],
  "forkContainsResult": false
}
```

可重跑的最小命令（在 Space 根目录 PowerShell 执行；仅在系统临时目录写测试数据）：

```powershell
@'
import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const root=await mkdtemp(path.join(os.tmpdir(),'boundary-research-'));
process.env.KODAX_HOME=path.join(root,'.kodax');
const {createKodaXHostRuntime}=await import('../KodaX/src/sdk-runtime.ts');
const {FileSessionStorage}=await import('../KodaX/packages/repl/dist/index.js');
const sessionsDir=path.join(root,'.kodax/sessions');
const storage=new FileSessionStorage({sessionsDir,configHome:path.join(root,'.kodax')});
await storage.save('s',{title:'Tool end',gitRoot:root,messages:[
 {role:'user',content:'read a file'},
 {role:'assistant',content:[{type:'tool_use',id:'c',name:'read',input:{path:'fixture.txt'}}]},
 {role:'user',content:[{type:'tool_result',tool_use_id:'c',content:'saved result'}]}
]});
const runtime=await createKodaXHostRuntime({homeDir:root,sessionsDir});
try{
 const page=await runtime.sessions.readHistory('s');const tool=page.items.find(i=>i.type==='tool');
 const fork=await runtime.sessions.fork({sessionId:'s',historyBoundary:tool.historyBoundary});
 const data=await storage.load(fork.id);
 console.log(JSON.stringify({toolStatus:tool.tool.status,
  forkMessageRoles:data.messages.map(m=>m.role),
  forkContainsResult:data.messages.some(m=>Array.isArray(m.content)&&m.content.some(b=>b.type==='tool_result'))}));
}finally{await runtime.close();await rm(root,{recursive:true,force:true});}
'@ | node --import tsx --input-type=module
```

同样，150 项 view 限制与 canonical entry 分页不是轮次边界。一个 canonical 消息可以展开超过 150 项，较早工具或查询可能不在窗口中。按页尾/最后可见项认定整个轮次已经结束没有契约依据。[view 窗口](C:/Works/GitProj/KodaX-AI/KodaX/src/session-view.ts:821)、[跨窗口回归](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-client.history-boundaries.test.ts:117)

## 4. sourceRevision 是存储快照身份，不能持久化成永远有效的操作令牌

sourceRevision 按 main、islands、legacy_archive 的完整字节状态计算，不只按聊天正文计算；正文未变时 metadata 保存也可能使它失效。[bundle 文件范围](C:/Works/GitProj/KodaX-AI/KodaX/packages/repl/src/interactive/storage.ts:1216)、[字节哈希](C:/Works/GitProj/KodaX-AI/KodaX/packages/repl/src/session/source-revision.ts:87)

显示 checkpoint 位于 main meta 的 uiHistory，`mutateUiHistory` 在同一 writer lock 下重写 Session。因此如果把带 sourceRevision 的操作字段加入 view，需要处理随后 checkpoint 保存导致的失效，而且应避免把操作 revision 再写回 UI checkpoint。[meta](C:/Works/GitProj/KodaX-AI/KodaX/packages/repl/src/interactive/storage.ts:2328)、[checkpoint 写入](C:/Works/GitProj/KodaX-AI/KodaX/packages/repl/src/interactive/storage.ts:4645)

设置本身另写 runtime settings 文件，不在这三个源文件范围内；但 `updateSettings` 经 `mutateActiveSession` 首先执行 executable admission，因此首次设置调用可能因 admission/claim 使 sourceRevision 变化。不能声称“每次改设置都会让边界失效”。[设置写入](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:17759)、[executable admission](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:8307)

隔离对照实测：连续 readHistory revision 稳定；第一次 updateSettings 后变更，第二次切换 permissionMode 后不变；直接 mutateUiHistory 后变更。首次变化的确切具体写入尚未逐字节定位，**admission/claim 是有源码支持的推断，不是已排除其他副作用后的最终定因**。

```json
{
  "readStableBefore": true,
  "firstSettingsChanged": true,
  "readStableAfterFirst": true,
  "secondSettingsChanged": false,
  "readStableAfterSecond": true
}
```

Host Fork 先拒绝活动会话、等待显示保存，再在 source Session 的 serializedWrite 内读取完整快照并校验 sourceRevision；Rewind 也校验 sourceRevision，公开 Product 层还要求 expectedHead。陈旧目标应明确返回 resync/conflict，不能静默把用户选择扩大到当前末尾。[Runtime Fork](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:9277)、[存储 CAS](C:/Works/GitProj/KodaX-AI/KodaX/packages/repl/src/interactive/storage.ts:5610)、[Runtime Rewind](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:9613)、[文档](C:/Works/GitProj/KodaX-AI/KodaX/docs/SPACE_SDK_SEAMS.md:332)

## 5. 既有 selector/lineage 能否代替 SDK 补齐

selector 只接受实际 entry ID 或已有标签，不接受 view item ID、轮序号或“下一条用户之前”等表达式；从显示 ID 生造 selector 不成立。[selector 解析](C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/session-lineage/kodax-session-lineage.ts:757)

readLineage 可给出已存在 lineage 的摘要，但旧 Session 可返回 null。它也不提供显示 item→canonical entry 的公开解析关系；归档/压缩前的完整操作前缀由 storage 的 canonical boundary 流程处理，不能由客户端当前 lineage 摘要替代。[readLineage 实现](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.ts:9510)、[归档边界验证回归](C:/Works/GitProj/KodaX-AI/KodaX/packages/repl/src/interactive/conversation-history-boundary.test.ts:126)

因此既有 API 足以对**已经持有精确 canonical 消息边界**的选项操作，但不足以证明客户端可以从无输入身份的有界 view 恢复完整轮次目标。默认 Fork 当前 head 只适合明确的“复制当前完整会话”，不能冒充“从用户点选的位置 Fork”。[Fork 默认 selector](C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/client-contract.ts:613)

## 6. 方案比较与倾向

| 候选                                                                                 | 合理之处                                                                                                     | 未解决的问题                                                                             | 判断                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Space 预读历史，按 inputId/outputId 关联                                             | 新消息身份唯一时可复用既有边界；当前实现已有这条路径                                                         | 旧消息缺身份；重复文本不能猜；有界/跨页窗口不证明整轮完成                                | 作为兼容路径保留，不适合作为根修复。依据见 §1、§2、§3                                         |
| SDK view 直接携带现有 historyBoundary                                                | 复用已有字段；SDK 在读取 canonical source 时掌握来源；无需增加公共 RPC                                       | 字段仅是消息边界；工具结果/完整轮次反例仍在；checkpoint 后 revision 可能陈旧             | 是 provenance 修复的合理候选，不能单独宣称完整解决轮次操作。依据见 §2–§4                      |
| SDK 提供窄的只读操作目标解析，输入所见 opaque item/来源，返回明确 canonical 操作边界 | 可在掌握完整 canonical 顺序的一层区分消息位置、完整轮次末尾与不可操作状态；按需读取避免每帧绑定操作 revision | 必须定义所见 item 过期时失败；不可无条件把旧选择解析为新 head；需要公共接口/传输与验证   | **对“整轮 Fork/回退”更值得优先评估**。SDK 拥有来源与 CAS，客户端不能可靠补算。依据见 §2–§5    |
| SDK 随 view 提供明确的完整轮次只读目标描述                                           | 同样由 SDK 负责语义，可少一次 RPC                                                                            | 是新增语义而非简单填 historyBoundary；同样需解决 sourceRevision/保存顺序；字段不能持久化 | 可作为窄解析接口的替代实现，需比较改动量与刷新成本，当前证据未足以选定唯一载体。依据见 §3、§4 |

最小正确架构倾向是：**SDK 决定 canonical 目标，Space 统一消费；现有 historyBoundary 保留“after message”语义。** 对这次用户的轮次操作，先定义“保留这轮的全部已保存消息，包括隐藏工具结果；遇到未证明来源或并发修订明确拒绝”，再比较一个窄只读 resolver 与一个明确完整轮次描述字段，选变更更小者。不要先实施把所有显示项强制补成可操作，也不要为以后所有操作设计通用 action 框架。这个建议是根据上面反例与现有责任边界做出的设计判断，不是源码中已经存在的能力。

## 7. 实施前的验收接缝

1. 旧消息无 input/output ID，两个相同 prompt/answer：选择的 canonical entry 不串轮。
2. 轮次以 tool_result、错误、中断结束：派生前缀包含全部应保留的已保存消息，不把 display checkpoint 当 canonical。
3. 单条消息超过 150 显示块、跨历史页、压缩/归档恢复：选中目标不依赖页尾或窗口顺序猜测。
4. 选中后新消息/设置首次 admission/checkpoint 保存/外部写入：过期目标返回明确 resync/conflict，不自动扩大范围。
5. Fork 源不变，Rewind 保留 expectedHead/sourceRevision 校验；不执行模型、不承诺回滚文件副作用。
6. Space 对话行、会话菜单、右键与命令入口从同一权威操作选择取得目标。独立下游调查已验证部分入口仍读旧 appStore：product 已有有效边界、旧 appStore 为空时菜单按钮仍禁用；仅 SDK 补字段不能闭环。[下游入口与 React 对照实验](space-history-action-entrypoints-2026-11-07.md)

这些是由契约与反例导出的验收建议，不代表本轮已经新增或通过全部测试。既有自动化主要覆盖 history-page 的明确边界，尚不能充当完整 view→所有入口→canonical mutation 的验收。[现有派生覆盖](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-client.derive.test.ts:104)

## 未证实与未解问题

- 第一条设置调用究竟由哪次 admission 写入使 main bytes 改变，尚未做逐字节归因；已排除“设置文件本身必然在 source bundle 中”。
- 产品是否把“从这里”定义为整轮全部已保存记录，还是恰好所点 canonical 消息之后，需要在既有产品要求与下游实现中核实；不能由本次测试自行决定。
- 窄 resolver 与明确目标字段哪一个总体改动最小，需要在完整 Space 入口清单与 SDK 传输边界核对后决定；不建议在本调查结论前先引入两套能力。
- 新目标若来自旧显示 checkpoint 且没有 canonical 来源，应返回 unavailable；不能为了消除提示而造边界。无 canonical 的中断输出如何向用户解释，是 UI 设计问题，不属于数据修复。

## 2026-11-07 实施后补记（本地候选 B，尚未发布）

前文是实施前研究，当时的候选对比和未决项不改写成历史上已接受的契约。随后实施采用窄只读 `sessions.resolveHistoryTurn`：整轮目标由 canonical 顺序计算，包含最后一条真实用户输入之前的已保存隐藏工具结果；既有 `historyBoundary` 仍保留消息之后的语义。[轮次计算](C:/Works/GitProj/KodaX-AI/KodaX/src/history-turn.ts:17)

来源处理区分只读选中与提交：SDK 当前缓存的 exact view item 可通过原消息边界，在当前 canonical 中以唯一不可变 entry ID 重新证明；新提交但未重开的项只接受 SDK 已知的 exact inputId/outputId，拒绝草稿、重复和缺来源。返回给确认框的 sourceRevision/expectedHead 冻住后，mutation 仍原样 CAS，不自动换目标。[只读来源证明](C:/Works/GitProj/KodaX-AI/KodaX/src/history-turn.ts:48)、[不持久化操作 revision](C:/Works/GitProj/KodaX-AI/KodaX/src/session-view.ts:969)

旧会话首次回退可能因首次 Actor claim 使先前读取边界过期；保留明确 resync。真实 Host 测试验证一次失败后重新解析并重新确认可以成功，不绕开 owner 校验。[真实 daemon/Product 回归](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-client.history-turn.test.ts:87)

定位窗口默认围绕精确目标，正常命中用户问题后首窗可直接显示后继答案。若 byte budget 使目标不在所返窗口，退回以目标结尾并再次核验；向后窗口始终保留首个未读 canonical entry。[有界窗口](C:/Works/GitProj/KodaX-AI/KodaX/src/history-turn.ts:151)、[重复命中/前后翻页/大项回归](C:/Works/GitProj/KodaX-AI/KodaX/src/sdk-runtime.history-location.test.ts:8)

生产构建曾做过整体 Host 拆包实验，已撤回：这会改变 ALS/服务实例图，不适合为几个 KiB 的启动预算引入执行路径风险。最终 B 的 `src/kodax_cli.ts` 无变更；热 canonical chunk reader 为轻量静态模块，只有显示投影、操作目标和定位走私有按需入口。最终 CLI 5,192,179 bytes（5070 KiB），低于原 5071 KiB gate，未提高预算。[构建接缝](C:/Works/GitProj/KodaX-AI/KodaX/scripts/build-bundle.mjs:419)

构建还暴露独立打包失误：首次候选在编译前没有放入 native manifests，导致 JS 内嵌可信 manifest 为空；事后复制 native 目录不能修复该编译产物。B 在编译前预置全部五平台 native manifests/产物，并保留原 native 完整性与路径安全校验。B frozen Host fingerprint `e68408e649681a0cbffe2b1abc66d4eea349049b7fd3721944cd63c5b4adcc9e`，CLI SHA256 `b3cc44a28bed367b8a63b2d2e794b567e80ec3c0b119c2cfed74c0a011a5cab2`。

已实际执行：

```powershell
# SDK checkout 下
npx tsc -p tsconfig.check.json
npx vitest run src/history-turn.test.ts src/sdk-client.history-turn.test.ts src/sdk-runtime.history-location.test.ts src/sdk-client.history-boundaries.test.ts src/sdk-runtime.legacy-view-read.test.ts
# 已冻结生产 B 构建；本地 HTTP provider，不调用外部模型
node C:/Users/ADMIN/AppData/Local/Temp/kodax-built-history-turn-provider-smoke.mjs <B-dist-directory>
```

结果：类型检查通过；5 文件 16 测试通过。生产 daemon + HTTP SSE 工具续聊 fixture 的三次运行均 completed，4 个请求 auth 正确；Fork 整轮后继续对话的实际 wire 同时包含匹配的 `fixture-call` tool_use 和 tool_result，`orphanCalls: []`；owned daemon 正常 shutdown。此为受控工具消息完整性 smoke，不是模型质量或外部 Provider 全矩阵评测。Windows packaged Electron/native worker 测试由另一验收任务另行记录，不由本段 standalone 结果替代。

### 最终开发链接和包验收补充

B 的 295 个文件已按 chunks 优先、根入口逐文件原子替换方式覆盖开发 `C:/Works/GitProj/KodaX-AI/KodaX/dist`，全部对应文件逐字节匹配。为保护已启动进程的延迟 import，保留旧 chunks；因此开发目录的整目录 Host fingerprint 为 `e8a109d5c6166973456f01196c45fee147dcc9dd3ec1a54299533631d9946554`，与干净 B 的 `e68408e649681a0cbffe2b1abc66d4eea349049b7fd3721944cd63c5b4adcc9e` 不同。CLI 本体 SHA256 均为 `b3cc44a28bed367b8a63b2d2e794b567e80ec3c0b119c2cfed74c0a011a5cab2`，不能把两种目录指纹差异误判成入口内容不一致。

覆盖后的开发 dist 已重新通过真实 daemon/HTTP provider 工具 Fork 续聊 fixture：三轮 completed、4 请求、正确 scoped auth、匹配的 tool_use/result、无 orphan、owned daemon 正常关闭。首次额外复核曾出现第 5 请求、全局最后请求断言失败；fixture 原先假设最后请求一定为主对话请求，后改为按独特 Fork 续聊输入选取对应请求。失败那次未保留请求正文，不能进一步声称已证明其具体后台请求来源，也不能把它记作已通过。

独立 Windows candidate 的打包验收任务报告：`npm run build:test-kodax` 状态 0，native/daemon worker、boot、包内真实 Host 合约 6/6 通过；源码和 packaged 历史 E2E 两组各 8/8。原始 stage 已在所有消费者结束读取后迁至 `C:/Users/ADMIN/AppData/Local/Temp/kodax-history-builds-c872886b010145aea1b7efb423addb4d/`，保留 A/B 子目录名，不留在 SDK 可提交工作树。包内 SDK 是独立物理副本，后续验收不依赖开发链接或旧 stage 位置。

### beta.3 移植前的交叉复核

2026-11-07 对照 SDK 开发树 `58671f8de` 和已有的 beta.3 集成树 `a03b9f53c`。本轮验证未变更 beta.3 分支或发布包。

| 意见 | 核验结果 |
| --- | --- |
| 测试类型有六处错误 | 在开发树运行 `npm run typecheck:tests` 复现了六条诊断。已补 Host、manager、server 的模拟 Session 方法和调度器参数表，并修正 Vitest 的断言消息写法。修改后完整 `npm run typecheck` 通过，四个直接相关测试文件共 112/112 通过。 |
| 分离工作模式与历史改动 | beta.3 相对开发树基线已有 29 个提交。应按改动块移植历史能力并保留 `e0b508ade` 的旧 Run 恢复行为及测试，避免用开发树的整个文件覆盖集成树。 |
| 原生打包范围 | 历史候选 npm 包确实含有两个新增模块，Windows Electron 实包也已执行完整历史场景。Windows 独立 CLI 使用 Bun 从 bootstrap 重新编译；字面量动态 import 可以随模块图编入二进制，仅查 ZIP 旁置文件不足以判定模块缺失。合并后须检查 Bun 编译图，并用没有 Node/Bun 在 PATH 的真实 ZIP 执行历史定位、整轮解析、Fork 及回退。原 beta.3 的独立 ZIP 验收未覆盖新增能力。合并后重新检查 49 KiB 体积预留。 |
| 发布记录和能力要求 | 已在 SDK 的 Unreleased 与 SPACE_SDK_SEAMS 记录两项能力。当前整轮解析支持设为建连 requirements，历史定位通过 Host 声明探测。Space 已按操作检测能力，可继续在旧 Host 上浏览。最终 registry 依赖升级与 beta.3 包验证仍待进行。 |
| revision、未用方法、摘要 | 已核实 SDK 的选择器和 wire schema 接受整数 revision，Space 实际传字符串版本或省略可选版本。整数永远无法匹配，移植时应同步收窄合约与 schema，保留有稳定来源的无 revision 场景。`SessionViewOwner.itemHistoryBoundary` 只有定义。239 个 ASCII 字符后跟一个 emoji 可令 240 单元摘要结尾成为单独的高代理项，应截在完整字符处并覆盖此边界。三项均为待合入的代码改动。 |
| 诊断分流 | 用同一个进程加载冻结生产构建中的内置和延迟 reader，用同一损坏正文触发错误、在两侧分别注册诊断接收器。两条路径都返回 `internal_error`，接收器均只收到本模块发出的事件。普通分页在 SDK 客户端解析；daemon 读取历史工具原文的回退路径可进入延迟模块，让 Host 日志漏记。应验证该回退路径的错误只记录一次，仍由正确的 Host 所有者脱敏和处理。 |

本次实测的 daemon 冷建连、Windows 所有者开机时间证据和单字段查询收益另见[分阶段计时](windows-daemon-cold-connect-2026-11-07.md)。
