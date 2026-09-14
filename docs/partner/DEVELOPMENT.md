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

从 2026-09-14 起，交付目标统一为组织仓库 `KodaX-AI-dev/KodaX-Space`：

- `origin`：组织 Space 仓库，作为拉取和以后提交 PR 的目标。
- `main` / `origin/main`：组织主线，不直接开发或覆盖。
- `integration/partner-bundled-release`：保留原始 39 条提交的来源分支。
- `feature/partner-bundled-release`：已通过 [PR #5](https://github.com/KodaX-AI-dev/KodaX-Space/pull/5) 合入组织 main 的 beta.3 贡献分支，保留作历史。
- `feature/partner-<topic>`：后续短期开发分支，从最新 `origin/main` 创建。
- 旧个人仓库和旧 F146 分支只作来源及恢复历史，不再作为产品分发入口。

2026-09-14 来源分支已上传。随后用户授权按贡献规范提交到组织主线，并确认 Space `0.1.46-beta.3`；通过 PR、完整验证及既有发布 workflow 交付。主线使用署名 `poppersamhar` 且带完整正文的整合提交，来源分支不改写。实际合并、标签和发布状态见 [beta.3 readiness](../releases/v0.1.46-beta.3-release-readiness.md)。

开发使用当前组织集成 checkout。旧 Partner checkout 仅保留历史；集成仓库已复制全部需要的 Git 对象，不依赖旧目录的对象存储。具体目录、提交和备份证据记录在本地交付报告，不把个人电脑路径写入公共产品配置。

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

## 短分支与组织主线同步

本次融合已进入组织主线。后续从最新组织主线建立短功能分支：

```sh
git fetch origin main
git switch -c feature/partner-<topic> origin/main
```

同步时先提交当前工作并确认目录干净，再把组织主线合入当前功能分支；不重写已经共享的历史：

```sh
git fetch origin main
git switch feature/partner-<topic>
git merge --no-ff --no-commit origin/main
```

解决冲突后复查 Session、Host、IPC、Shell、package/lockfile 和打包脚本，完成测试再创建合并提交。最新基线和验证证据见 [Integration](INTEGRATION.md) 与 [本次随包交付](releases/space-bundled-integration.md)。每次准备上传组织前都检查主线是否继续更新；不要在脏目录执行 `git pull`。

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

日常 Host API、IPC 和 Partner 宿主兼容改造归入 `feature/partner-host-*`；需要吸收新的 `origin/main` 时，在当前功能分支同步并处理冲突；`integration/partner-bundled-release` 仅保留来源历史。插件包不应通过修改 Coder 业务逻辑来获得能力。

## 版本号与分发

- 用户下载的产品是官方 Space。Space 版本、SDK 精确版本和 lockfile 由组织发布线统一管理，禁止为了 Partner 修改 SDK 版本或改回个人更新地址。
- 历史交付基线为 Space `0.1.46-beta.3` / KodaX `0.7.96-rc.4`，该 GitHub Release 已撤回，tag 保留。当前源码为 Space `0.1.46-beta.4` / KodaX `0.7.96-rc.6`，尚未发布；修复和验证见 [beta.4 readiness](../releases/v0.1.46-beta.4-release-readiness.md)。后续发布使用未占用的新版本，同步 manifests、CHANGELOG 和更新元数据，不覆盖既有 tag 或 Release 资产。
- Partner Library 当前为 `0.1.0`，随官方安装包包含并在首次启动注册。宿主、插件归档与方法 Skill 必须一起验证；只上传 `.space-extension` 不代表用户已经获得宿主能力。
- `hostApiVersion` 管理宿主协议兼容性；`requiredHostCapabilities` 声明需要的能力。
- 本次不创建新的个人 `partner-v*` 发布线。历史标签保留作证据，不执行 `git push --tags`。
- 新版本对已有同 ID 包的自动升级策略不在本次首次随包注册范围；必须保留用户停用、卸载和手动安装选择。

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
npm run build:smoke
git diff --check
```

默认 `npm test` 已包含 TSX 组件测试，组织 CI 与 Release 的现有测试步骤会自动执行。单独调试组件时可以使用下面的定向命令；相关 Electron E2E 另行运行：

```sh
node --test --import tsx 'apps/desktop/renderer/src/**/*.test.tsx'
npm run e2e:run -- tests/e2e/partner-bundled.spec.ts tests/e2e/partner-mode.spec.ts tests/e2e/partner-layout.spec.ts
```

开发 Node 版本采用 `.nvmrc`，测试加载器使用同步 `registerHooks`（Node 22.15+）。构建会自动生成随包插件，打包 smoke 验证归档字节与宿主依赖。正式安装包仍需各支持平台的构建、安装、首次启动与已有 profile 升级验证。真实第三方账号/资源验收单列，不能用 fixture 代替。

Node 与 Electron 使用不同 SQLite ABI；不要同时运行会重建原生依赖的单元测试和打包/E2E 命令。

## 推送与发布门槛

Space beta.3 曾通过组织主线和既有发布流程交付，随后由维护者撤回 Release；发布与撤回记录均保留。以下门槛适用于后续功能与新版本：

1. 核对组织最新主线、目标分支和已完成验证，确认当前工作区没有未提交的产品改动。
2. 核对即将提交的内容没有凭据、真实账号运行数据或个人环境配置；只包含可复核的产品代码、资产和文档。
3. 核对 `origin` 指向组织仓库，推送当前已确认的 `feature/partner-*` 功能分支并向 `main` 提交 PR，不直接覆盖组织主线。
4. 组织 CI 及各平台验收通过后，由维护者合并，再按 Space 原有发布流程更新版本、创建对应标签与 Release。
5. 从正式 Release 下载验证，确认用户首次启动看到 Partner，账号连接仍由用户授权，Coder 运行不受影响。

本地 `git commit`、组织分支、合入主线、正式 Release 是四个不同状态。只有目标提交被组织主线接收后，才将对应 PF 标记为 `Integrated`。本次用户已明确选择组织发布路线；个人仓库删除状态单独记录，不影响本地代码保留。

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
