# F148 — 设置中的数据位置 测试指南

设计：[F148](../features/v0.1.47.md#feature_148-settings-based-data-location)；决策：[ADR-011](../ADR/ADR-011-settings-data-root.md)。

## 前置条件

- 不要用真实用户数据。每台机器先备份 `~/.kodax` 与 `<appData>/KodaX Space/data-root.json`，或在专用测试账户中进行。
- `<appData>`：Windows `%APPDATA%`；macOS `~/Library/Application Support`；Linux `~/.config`。
- 复制场景使用 Registry SDK `0.7.97-beta.9` 的 `copyKodaXDataRoot`（Space 当前精确依赖该版本）。
- 每次切换前后对旧位置做文件清单与哈希（例如 `find <root> -type f -exec sha256sum {} +`），用于确认旧位置未被修改。

## 自动化覆盖

| 范围                                                                            | 命令（在 `apps/desktop` 下）                                                                                                                                                                            | 结果  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 解析、指针、校验、环境标记                                                      | `node --test --import ../../scripts/test/isolated-credential-profile.mjs --import tsx electron/kodax/data-root.test.ts`                                                                                 | 21/21 |
| 切换、排除项、失败不写指针，真实 beta.9 复制（路径改写、标记拒绝）              | 同上，`electron/kodax/data-root-change.test.ts`                                                                                                                                                         | 通过  |
| 启动对话框文案                                                                  | 同上，`electron/kodax/data-root-notice.test.ts`                                                                                                                                                         | 通过  |
| SDK 复制（KodaX 仓库）                                                          | `npx vitest run src/data-root-copy.test.ts`                                                                                                                                                             | 25/25 |
| Space 驱动真实 SDK 构建                                                         | 一次性集成脚本：复制、路径改写、排除项、指针、非空目标拒绝、标记识别                                                                                                                                    | 通过  |
| 设置界面复制并保存重启（源码 Electron，非测试模式，隔离 appData 与 OS keyring） | 仓库根目录 `npm run e2e:run -- tests/e2e/data-root-change.spec.ts`：选目录、勾选复制、经验证的 Host 停止、指针、排除项、路径改写、`data_root_changed`、重启请求；再次启动从新位置读取，来源“在此处设置” | 3/3   |

## 人工场景

### A. 显示与来源

1. 未设 `KODAX_HOME`，打开 设置 → 常规 → 数据位置：显示 `~/.kodax`，来源“默认位置”。
2. 只为 Space 设置 `KODAX_HOME=<abs>` 后启动：来源“来自环境变量 KODAX_HOME”。
3. 在此基础上通过设置选择另一位置并重启：来源“在此处设置”，并提示环境变量指向的路径。

### B. 切换到空目录（不复制）

1. 选择一个空目录，不勾选复制，确认“保存并重启”。
2. Space 关闭并重新打开；当前位置为新目录，会话列表为空，Provider 需重新配置。
3. 旧位置清单与哈希不变。

### C. 复制到空目录

1. 选择空目录（可含 `desktop.ini` / `.DS_Store`），勾选复制，确认。
2. 进度窗口显示文件数；完成后重新打开，会话、设置、Provider 可用，历史会话中的图片与工具输出可打开。
3. 检查 `space/mcpb/registry.json` 等 JSON 中的 `installDir` 指向新位置；MCPB 扩展能启动。
4. 新位置没有 `.kodax-copy-incomplete`、`space/runtime-client-identity.json`、`space/input-intents`。
5. 诊断日志 `<appData>/KodaX Space/diagnostics/space-main.jsonl` 中有 `data_root_changed`，含 `files`、`bytes`、`rebasedFiles`、`skipped`。
6. 旧位置清单与哈希不变。

### D. 使用已有 KodaX 数据目录

选择另一台机器拷来的或 CLI 用过的数据目录：提示“将按原样使用，不复制”，复制选项不可用；重启后显示该目录的会话。

### E. 拒绝路径

逐一选择，确认提示原因且不重启：当前位置；当前位置的子目录或父目录；含其他文件的目录；只读目录；UNC 网络路径 `\server\share`（Windows）；含 `.kodax-copy-incomplete` 的目录；勾选复制时选择已有数据目录。

### F. 其他客户端占用

1. 用同一 `KODAX_HOME` 启动 KodaX CLI 并保持连接。
2. 在 Space 中切换：提示有其他 KodaX 客户端连接，什么都没改（指针文件不变，Space 继续运行或重连）。
3. 运行中的 Coder 任务同样阻止切换。

### G. 位置不可用

1. 把数据位置设到移动硬盘，退出 Space，拔掉硬盘后启动。
2. 弹出“数据位置不可用”，可选继续 / 恢复默认 / 退出；选择继续时使用下一优先级位置，且未在原盘符或挂载点新建目录。
3. 重新插入硬盘并重启，恢复到该位置。
4. 手动把 `data-root.json` 改成非法 JSON：弹出“数据位置设置已损坏”。

### H. 恢复默认

在“在此处设置”状态下点“恢复默认位置”，重启后回到环境变量位置（若设置）或 `~/.kodax`。即使上一进程由 Space 改写过 `KODAX_HOME`，也不能沿用旧的设置位置。

### I. 复制中断（需要带复制导出的 SDK）

复制过程中强制结束进程。重启后仍使用旧位置（指针未写）；再次选择该目标会被识别为未完成复制。清空该目录后可重试。

## 平台清单

| 平台                   | 必测                                                     | 结果   |
| ---------------------- | -------------------------------------------------------- | ------ |
| Windows 10/11 安装版   | A–I；另一盘符；盘符根目录作为目标                        | 未执行 |
| Windows 便携版         | B、H；重启后仍为便携版进程                               | 未执行 |
| macOS                  | A–H；大小写不同的同一路径被识别为相同                    | 未执行 |
| Linux AppImage / Kylin | A–H；AppImage 重启路径；keyring 解锁提示                 | 未执行 |
| CLI                    | Space 切换后 CLI 仍使用自己的 `KODAX_HOME` 或 `~/.kodax` | 未执行 |

## 已知限制（不作为失败）

见设计文档“已知限制”：Linux 全局 keyring 中的 Partner 连接器密钥、`safeStorage` 密钥与沙箱 ACL 不随根移动；映射网络驱动器无法识别；未挂载的挂载点会被当作空目录；`~/.kodax` 形式或 URL 编码的路径不改写；atomic-file 备份与 input intents 不复制。
