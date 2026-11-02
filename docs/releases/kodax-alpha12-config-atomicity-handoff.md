# alpha.12 核心配置并发读取

2026-11-02，正式 Registry alpha.12。Space 的两个真实 Electron 用例曾在 provider.list / provider.setKey 处遇到配置读取失败；受控跨进程回归确认，持 SDK 配置锁的截断写入可以使旧异步 reader 读到半截 JSON。该实验复现了相同失败类别，原失败当时的底层错误未保留，不能据此断言它们已经逐次溯源。

可转交 SDK：当前 alpha.12 的核心配置写入尚未统一采用原子替换：packages/repl/src/common/custom-providers.ts 的 writeWholeConfig 和 src/sdk-runtime.ts 的 writeRuntimeConfigUnlocked 仍会在配置锁内直接截断重写 config.json；互斥锁只保护参与锁协议的调用方，未参与的 reader 仍可能读到半截 JSON，进程崩溃或磁盘写入失败也可能损坏原文件。另外 custom-providers.ts 的 readWholeConfig 会把损坏或读取失败转成空对象，后续写入可能覆盖原配置。请把所有核心配置 writer 统一到现有 withCoreConfigWriteLock + writeCoreConfigAtomically，读取及修改失败时保留原文件并明确报错；如要求 reader 也参与锁，请提供/文档化公开的一致读取接缝及锁忙语义，不把配置忙误归为 provider 网络错误，也不因解析失败静默回落空配置。验收覆盖真实独立进程持续写入与读取、截断阶段/磁盘写失败注入、损坏或不可读原文件、并发 Provider 改名和无关配置更新，要求 reader 只见完整旧值或新值、失败保留原字节和用户修改、凭证绑定/CAS 不绕过，且不输出 Key 或配置原文。Space 已用公开 SDK 同一把锁同步读取，且仅对明确的 CoreConfigWriteConflictError 做最多四次短暂重试；损坏文件和其他 IO 错误仍事实拒绝。这是 Space reader 的兼容处理，不能代替 SDK writer 的原子性修复。
