# Runtime 凭据解密失败：Space / SDK 责任与修复边界

## 已确认事实

- Space `0.1.46-rc.5`、Electron `42.5.0`、SDK `0.7.96-rc.11`。
- 当前启动在 `identity_open` 阶段读取本地凭据失败；尚未调用 SDK
  Runtime factory。日志记录 `host_initialization_failed` 和
  `safeStorage.decryptStringAsync` 解密异常。
- 用户未修改 API Key 或环境变量。API Key / Runtime secret 的值与 Electron
  用来保护它们的加密密钥是不同的对象。
- 在复制的 Electron 加密状态下，三个现存 v10 密文全部无法通过同步或异步
  API 解密；同一环境新生成的合成密文可立即解密，也可跨进程重启后解密。
  这支持“旧密文与当前加密状态不匹配”，不是一般的系统加密不可用。
- 旧 keyring 中 Runtime 候选 secret 的指纹与 SDK 持久化 Host Tool 调用
  记录中的同一 `instanceId` 指纹匹配。检查只输出布尔结果，没有输出 secret、
  指纹、调用参数或环境变量。

## 时间线和因果限制

现场文件时间（Asia/Shanghai）：

| 对象 | 时间 |
| --- | --- |
| Runtime identity 文件最后写入 | 2026-07-25 21:42:41 |
| 凭据库最后写入 | 2026-09-22 22:38:02 |
| 当前 `%APPDATA%/KodaX Space` 目录创建 | 2026-09-28 14:55:17 |
| 当前 `Local State` 文件创建 | 2026-09-28 14:55:27 |
| 当前 `out/win-unpacked` 目录创建 | 2026-09-28 14:58:30 |

用户报告当日在另一个 worktree 启动过 dev，之后关闭 dev，并执行过
`npm run clean; npm run build`。文件时间只能证明当前目录/文件的创建时间，
不能识别删除或替换旧目录的进程。

`scripts/clean.mjs` 的删除范围是仓库中的固定构建目录，不包括 AppData
或 `.kodax`。隔离 fixture 运行真实 clean 脚本后，构建产物被删除，而用户
凭据和 Local State 均保留。SDK daemon 清理只管理自己的所有权文件。
目前没有证据将本次 AppData 重建归因于 clean、build、dev 或 SDK。

## Space 的已确认缺陷

版本历史确认：2026-09-22 的提交 `9d7c4b6f`（Issue 216）将 Windows 凭据从
原生 Credential Manager 改为优先使用 Electron safeStorage 加密 vault，
并按账号自动导入旧 keyring 值。本地 release tags 中，`v0.1.46-rc.2` 起
包含该提交，`rc.3` 至 `rc.5` 也包含。用户不必修改任何 Key 就会走迁移路径。
这次变更新增了对 Electron profile 加密状态的依赖，而 vault 仍保存在
独立的 `.kodax/space` 中，因而引入了本次暴露的生命周期失配风险。
这定位了风险引入的代码版本，但不能证明该提交执行了本次 AppData 重建，
也不能仅凭凭据库写入日期证明当时具体由哪个构建完成迁移。

1. **凭据与加密状态生命周期分离。** 密文保留在 `.kodax/space`，加密状态
   位于 Electron profile。此前 NSIS 配置开启 `deleteAppDataOnUninstall`，
   卸载可删除后者而保留前者；这是已确认的数据丢失路径，但不是本次 unpacked
   故障的已确认触发器。修复为普通卸载保留 AppData。显式删除应用数据仍需
   用户备份完整 profile。
2. **失败呈现为等待。** Runtime 已报告不可恢复的 `incompatible` 状态，历史
   分页仍把 `runtime_unavailable` 当作短暂启动重试。修复为立即显示错误原因、
   停止轮询；Runtime 真正恢复后仍可自动重读历史。
3. **原先没有经过验证的凭据恢复流程。** 解密异常直接抛出；旧 keyring 迁移只在
   vault 记录不存在时触发。后续补丁添加了下面限定范围的 Runtime 自动恢复，
   未验证候选仍不可覆盖密文，也不会自动生成新 Runtime secret。

## 已实现的升级自愈路径（源码，尚未发布）

- 仅 Windows Runtime 的已有身份读取遇到解密失败时触发。普通 Provider
  Key、损坏的 vault JSON、缺失的已有身份 secret 不走这个恢复入口。
- 从原 Credential Manager 的同账号读取候选；只读当前 SDK home 的
  `runtime/daemon/coder/host-tool-invocations.json` v1 记录，要求同一
  `instanceId` 只有一个指纹且与候选 SHA-256 完全匹配。历史记录缺失、
  版本不支持、候选不符或存在多指纹时，不恢复；SDK 文件不会被改写。
- 这是针对此次 rc.2 迁移的兼容读取器，不是 SDK 新公共 API。升级 SDK
  时须检查 journal 格式；未知格式失败关闭，不能猜测或以连接成功代替校验。
- 原凭据用当前 safeStorage 重新加密并立即解密验证。先保存原 vault
  的独立密文备份，再通过已有条件替换工具原子安装。恢复期间发现删除或
  更新则放弃覆盖；保留 `clientId`、`instanceId` 和原 secret。
- 使用当前现场数据只读核对，新验证器返回 `automaticRecoveryEligible: true`。
  正式凭据库未被修改。隔离测试覆盖重新启动、错误候选、删除/覆盖竞争、
  备份失败及新加密不可读等情况。
- 覆盖边界：旧 keyring 或身份指纹已丢失的用户不能靠此路径自愈；Provider
  API Key 也不能套用 Runtime 的身份指纹。它们仍需要恢复原加密状态或重新
  配置对应凭据。该补丁不能承诺任意 AppData 丢失后的所有凭据恢复。

## SDK 结论

- SDK 不使用 Space 的 `safeStorage`、vault 或 Electron `Local State`；本次
  失败发生在连接 SDK 之前，未发现需要修改 SDK 运行时代码的直接原因。
- SDK 使用 daemon token 认证连接，并按 `instanceId + hash(instanceSecret)`
  隔离客户端 reverse bridge。连接成功不等于验证候选 secret 与旧身份一致。
  因此不能把“旧 keyring 有值且连接成功”当作自动覆盖密文的充分条件。
- 保留原有身份及租约隔离语义。SDK embedder 文档补充加密状态生命周期和
  恢复边界；未更改 SDK 协议或自动轮换身份。

## 后续持久化修复方案

当前源码补丁封堵了普通卸载造成状态分离的路径，添加已验证 Runtime 恢复，
并修复失败仍显示等待的表现，
不能据此声称本次 AppData 重建的触发进程已经找到，也不保证任意手动删除后
仍能恢复。

- 现场恢复：备份当前密文与加密状态，使用已验证的原 Runtime secret 重新
  加密，保持 `clientId`、`instanceId` 不变；通过重启验证。其他 Provider
  凭据要逐条恢复或重新录入，不能静默采用可能过期的值。
- 持久化加固：让加密状态与 vault 具备同一备份、迁移、删除边界。迁移已有
  profile 时必须先使用旧状态解密验证，保留可回滚副本；不可直接切换目录，
  也不可在检测到失配后备份新密钥并覆盖旧恢复材料。
- 自愈仅接受可证明属于现有身份的恢复材料。没有证据时给出明确恢复入口，
  保留原密文；不要修改 SDK 的身份隔离来绕过错误。
- dev 使用显式独立 profile 可避免开发分支共享生产数据，但不能恢复已丢失
  的加密状态，也不能证明本次故障来自 dev。

## 验证

- `node --test scripts/test/credential-lifecycle.test.mjs`：2 项通过。
- `node --import tsx --test apps/desktop/electron/test/session-history-paging.test.ts apps/desktop/electron/test/history-loading-indicator.test.ts`：68 项通过。
- SDK：`node node_modules/vitest/vitest.mjs run src/runtime-daemon/reverse-bridge.test.ts packages/agent/src/runtime/process-hardening.test.ts --maxWorkers=1`：30 项通过。
- `node node_modules/typescript/bin/tsc -p apps/desktop --noEmit`：通过。

本次未重建或替换用户运行中的 exe，未改写正式凭据库。SDK 工作区原有改动
均保留。
