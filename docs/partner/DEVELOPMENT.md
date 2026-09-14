# Partner 开发与 Git 工作流

这份文档用于管理 Partner 产品线的代码放置、PF Feature、本地 Git、验证、上游同步和发布。目标是同时满足三件事：本地改动可恢复、尚未完成的内容不会被误发布、Partner 能持续吸收 Coder 所在的 Space 上游变化。

产品要求见 [PRD](PRD.md)，内部架构见 [HLD](HLD.md)，共享接缝与当前同步证据见 [INTEGRATION](INTEGRATION.md)，功能状态见 [Partner Feature List](FEATURE_LIST.md)。

## 目录与维护责任

| 路径                                                                 | 主要维护     | 额外评审                               |
| -------------------------------------------------------------------- | ------------ | -------------------------------------- |
| `docs/partner/**`                                                    | Partner      | 融合契约变化需 Space 评审              |
| `extensions/partner-library/**`                                      | Partner      | manifest/Host API 变化需 Space 评审    |
| `apps/desktop/renderer/src/features/partner/**`                      | Partner      | Shell 接缝需 Space 评审                |
| `apps/desktop/renderer/src/features/extensions/Partner*`、`partner*` | Partner      | 通用 provider/bridge 变化需 Space 评审 |
| `apps/desktop/electron/partner-connectors/**`                        | Partner      | 安全、凭据、远端写入需共同评审         |
| `resources/brands/**`、`resources/partner-connectors/**`             | Partner 内容 | 来源、供应链和打包复核                 |
| `apps/desktop/electron/space-extensions/**`、IPC、Shell/Main/Window  | Space 共享   | Partner/Coder 双向回归                 |

### 改动应该放在哪里

- 专家、连接器声明或独立插件 UI：`extensions/partner-library/`。
- Partner 工作区交互：`apps/desktop/renderer/src/features/partner/`。
- OAuth、CLI、凭据、scope 和远端调用：`apps/desktop/electron/partner-connectors/`。
- 通用插件安装/校验：`apps/desktop/electron/space-extensions/`，需要共享评审。
- 新 IPC：先改 `packages/space-ipc-schema/`，再接 Electron handler/preload/Renderer。
- 模式切换、侧边栏或输入框公共外壳：`apps/desktop/renderer/src/shell/`，需要共享评审。
- Partner 产品、Feature、测试和发布证据：`docs/partner/`。
- Space 正式发布声明：Space 总文档，由双方评审。

### 为什么不把代码搬进 `docs/partner/`

`docs/partner/` 是文档所有权边界，不是构建边界。Partner 源码已经按 Electron、Renderer、Extension 和共享 package 正确分层：

- Desktop 的 TypeScript、Vite、esbuild 和测试 glob 只覆盖既有应用目录，移出后可能不再构建或静默漏测。
- Connector host 不能进入 Renderer/Extension，否则会破坏凭据与进程安全边界。
- IPC schema 必须留在共享 package，避免 Main/Preload/Renderer 出现多份协议。
- `space-extensions` 是通用宿主，即使最初随 F146 增加，也不属于 Partner 私有实现。
- 构建脚本、品牌资源、CLI bundle 和 installer 对当前路径有明确依赖。

本次“迁移后删除旧内容”只适用于使用 `git mv` 迁入本目录的 Partner 专项文档，不适用于共享源码、Extension 源码或用户运行数据。

## 仓库与分支职责

- `upstream`：同事维护的 `icetomoyo/KodaX-Space`，只拉取，不推送。
- `origin`：自己的 `poppersamhar/KodaX-Space-Partner`，准备好后才推送。
- `main`：只跟随 `upstream/main`，不直接开发 Partner。
- `feature/f146-partner-plugin-library`：F146 Partner 的长期集成分支。
- `feature/partner-host-<slice>`：Partner 主体、Host API、IPC、会话、安全执行与宿主适配的短期分支。
- `feature/partner-library-<slice>`：独立插件包、专家目录、连接器声明、插件 UI 与品牌资源的短期分支。
- `integration/partner-upstream-<date>`：临时验证某次上游同步，验证完成后再并回 F146。
- `archive/local-only-*`：只保存在本机的恢复分支，不合并、不推送。

从 2026-09-04 起，现有交叉历史不再重写。首批两个开发起点都从同一个已验证 F146 基线创建：

- `feature/partner-host-foundation`：用于稳定 Partner 宿主边界与融合接口。
- `feature/partner-library-foundation`：用于继续整理专家、连接器和插件库产品能力。

它们初始内容相同是正常的；分离的是从此之后的提交责任，不代表可以从任一分支删除另一侧已经依赖的代码。后续优先创建带具体主题的短分支，不把这两个起点继续扩张成互相长期漂移的第二、第三集成干线。

2026-09-04 的已知恢复点：

- Partner 可集成基线：`7c869d1`。
- 未审核本地材料归档：`archive/local-only-f146-unreviewed-20260904`，提交 `1b45875`。
- 当次上游基线：`upstream/main` 的 `0376cb4`，标签 `v0.1.46-alpha.5`；本地合并提交为 `ea7d61c`。

## 每次开始和结束开发

开始前先确认自己在哪个分支：

```sh
git status --short --branch
```

不要在 `main` 上修改。一个行为完成后就提交，不再把数天的工作堆成一个工作区快照：

```sh
git add <本次功能相关路径>
git diff --cached --check
git diff --cached
git commit
```

提交标题沿用仓库规范：

```text
feat(partner): ...
fix(partner-connectors): ...
test(partner): ...
docs(f146): ...
```

提交正文至少说明用户效果、关键边界、已运行的验证和仍未完成的人工或发布步骤。`git commit` 是本地版本；`git push` 只是把分支备份到 GitHub；只有发布标签和 Release 才代表产品发布。

## Partner Feature 生命周期

Partner 功能使用 `partner-feature-manager`，固定写入：

```text
docs/partner/FEATURE_LIST.md
docs/partner/features/v{VERSION}.md
docs/partner/features/unplanned.md
docs/partner/FEATURES_ARCHIVED.md
docs/partner/INTEGRATION.md
```

PF 使用 `PF###` 编号，并分别管理开发状态 `Planned → InProgress → Completed` 与集成状态 `Local → Ready → Proposed → Integrated`。该 Skill 不修改 Space 总 `docs/FEATURE_LIST.md`；需要新的 Space `F###` 时走全局 Feature 流程。

## Partner 短分支生命周期

先从干净、最新的 F146 集成分支创建一个具体切片：

```sh
git switch feature/f146-partner-plugin-library
git status --short --branch
git switch -c feature/partner-host-<slice>
```

插件库切片则使用 `feature/partner-library-<slice>`。一个切片只承担一个可说明、可验证的结果；如果功能同时需要宿主能力和插件声明，先完成并合入宿主接缝，再从更新后的 F146 创建插件库切片。

完成代码、评审和验证后合回 F146，并删除已完成的本地短分支：

```sh
git switch feature/f146-partner-plugin-library
git merge --no-ff feature/partner-host-<slice>
git branch -d feature/partner-host-<slice>
```

不要直接在两个功能分支之间互相合并；共同依赖统一先进入 F146，再由新的切片从最新 F146 开始。

## 同步同事的 Coder / Space 改动

只在工作区已经提交干净时同步。长期 Partner 分支采用 merge，不反复 rebase 改写历史：

```sh
git fetch --all --prune
git switch feature/f146-partner-plugin-library
git switch -c integration/partner-upstream-YYYYMMDD
git merge --no-ff --no-commit upstream/main
```

解决冲突、暂存合并结果并完成验证后：

```sh
git add <已解决的路径>
NODE_OPTIONS=--no-experimental-webstorage npm test
npm run typecheck
npm run lint
npm run build:smoke
git diff --check
git commit -m "chore(integration): merge upstream baseline"
git switch feature/f146-partner-plugin-library
git merge --ff-only integration/partner-upstream-YYYYMMDD
git branch -d integration/partner-upstream-YYYYMMDD
```

推荐至少每周同步一次，并在每次准备可安装版本之前再同步一次。不要在脏工作区直接执行 `git pull`。

易变化的上游提交、冲突预演和兼容差异不在本稳定指南维护；它们记录在 [Integration 当前快照](INTEGRATION.md#6-当前集成快照)。即使 Git 自动合并，也要复查 Host、Session、Shell、IPC、package/lockfile 和打包脚本；文本无冲突不等于行为兼容。

## Partner 与 Coder 的长期代码边界

OAuth、CLI、凭据、会话授权、资源范围、写入审核和真实远端调用继续属于 Space Electron 主进程中的可信宿主。Partner 插件页面只声明专家、连接器与隔离 UI，不持有凭据，也不复制一套 Runtime。

共享主链路应逐步稳定为：

```text
Coder / Partner UI
        ↓
带版本的 IPC / Contribution Contract
        ↓
Space Trusted Host
        ├── Coder Runtime Adapter
        └── Partner Runtime Adapter
              └── Connector / OAuth / CLI / Reviewed Write Services
```

共享的 `real-session.ts`、Shell 和 schema 只依赖稳定接口。新增 Partner 能力优先落在 Partner adapter、connector service 和 Partner UI 目录；不要继续让 Coder manifest 逐个排除 Partner channel，也不要在共享文件里无限增加 `surface === 'partner'` 分支。

日常 Host API、IPC 和 Partner 宿主兼容改造归入 `feature/partner-host-*`；只有吸收一份新的 `upstream/main` 并处理其冲突时，才使用 `integration/partner-upstream-*`。插件包不应通过修改 Coder 业务逻辑来获得能力。

## 版本号

- Partner 产品线使用独立 SemVer；当前首个整理目标为 `v0.1.0`。其范围和 PF 边界以 [Partner v0.1.0 设计](features/v0.1.0.md)为准。
- Partner Library 也使用独立 SemVer；首个候选与产品版本对齐为 `0.1.0`，归档名为 `kodax.partner-library-0.1.0.space-extension`。以后 library 可以按兼容性需要独立演进，不能反向决定 Space 版本。
- Space 应用版本只跟随实际合入的 `upstream` 发布线；当前兼容基线为 `v0.1.46-alpha.5`，KodaX 为 `0.7.96-beta.1`。整理或发布 Partner `v0.1.0` 时不得修改根 `package.json`、Desktop package 或 lockfile 中的 Space/KodaX 版本来配合名称。
- `hostApiVersion` 只在宿主协议出现不兼容变化时升级。
- 功能可用性通过 `requiredHostCapabilities` 与宿主能力握手判断，不按应用或插件版本字符串猜测。
- Partner Git 标签固定使用 `partner-vX.Y.Z`，例如 `partner-v0.1.0`；不要使用 Space 的 `vX.Y.Z` 命名空间，也不要执行会把全部上游标签一起推送的 `git push --tags`。

历史阶段文档仍会出现 fork `v0.1.61-p.1` 和 Partner Library `0.9.1` / `0.9.0` / `0.5.1`；它们只描述当时证据，不是当前发布入口。当前目标以 [Partner Feature List](FEATURE_LIST.md)、[v0.1.0 设计](features/v0.1.0.md)和 [Release Readiness](releases/v0.1.0-release-readiness.md)为准，不能根据历史片段直接打标签。

## 测试与验证矩阵

按改动范围先运行定向门槛，再在合并或发布前运行完整门槛：

```sh
# 独立插件包
npm run build:packages
node --test scripts/test/build-partner-extension.test.mjs
npm run build:partner-extension
node --test --import tsx apps/desktop/electron/space-extensions/*.test.ts

# 连接器可信宿主
node --test --import tsx apps/desktop/electron/partner-connectors/*.test.ts

# IPC 契约与 Desktop
npm test -w @kodax-space/space-ipc-schema
npm test -w @kodax-space/desktop

# 合并前完整门槛
NODE_OPTIONS=--no-experimental-webstorage npm test
npm run typecheck
npm run lint
npm run format:check
npm run build:smoke
git diff --check
```

正式可安装包还需运行当前平台对应的构建与安装 smoke。独立 Partner Extension 不包含在普通主应用 smoke 的全部断言中，因此 `build:smoke` 与 `build:partner-extension` 都要验证。真实第三方账号/资源验收必须单独记录，不能由 fixture 代替。

## 推送与发布门槛

准备把功能分支备份到自己的 GitHub 时，显式执行：

```sh
git push -u origin feature/f146-partner-plugin-library
```

首次推送前必须重新检查：

- 工作区干净，且没有 `.env`、密钥、真实账号数据、本机绝对路径或未经审核截图。
- 已同步并验证最新 `upstream/main`。
- 完整自动测试、类型检查、lint 和打包 smoke 通过。
- 真实连接器验收与自动夹具结果分开记录；夹具不能宣称第三方真实成功。
- 根/Desktop package 与 lockfile 仍准确表达 Space `v0.1.46-alpha.5` / KodaX `0.7.96-beta.1`；Partner manifest、归档、CHANGELOG 和 release-readiness 准确表达 Partner `v0.1.0`。
- 已核对仓库 `LICENSE`，并取得覆盖目标接收方、用途和分发物的适用书面授权；没有该证据时只能保留本地候选，不能发布公开安装包、Extension、Git tag 或 GitHub Release。

正式发布时再创建唯一的 release commit、`partner-v0.1.0` annotated tag 和 GitHub Release，并逐个推送明确的 Partner 标签；不要使用 plain `v0.1.0`，也不要给仍处于 `InProgress / Local` 的候选冒充最终发布。当前整理阶段只建立本地 Release Candidate，直到技术、人工、集成和授权门槛都有可复核证据。

## 恢复本地归档材料

先查看归档内容，不要整分支合并：

```sh
git show --stat archive/local-only-f146-unreviewed-20260904
```

确认截图、路径、图标或权限变化确实可以公开后，只恢复明确需要的路径：

```sh
git restore --source=archive/local-only-f146-unreviewed-20260904 --worktree -- <path>
```

修正本机绝对路径、授权或来源问题后，再作为独立提交加入功能分支。

## 文档迁移与链接维护

- Partner 专项设计、评审、测试和发布证据放在 `docs/partner/**`。
- Space 的历史版本、全局 ADR 和共享架构留在原位置，只从 Partner 文档链接。
- 移动文档使用 `git mv`，同一提交修复所有入站与相对链接，并执行 Markdown 本地链接检查。
- 不保留两份可继续编辑的旧文档；需要兼容外部旧链接时才增加明确的迁移说明，而不是复制正文。
