// Project management channels — FEATURE_005.
//
// Project = 用户在 Space 里"打开"的工作目录（一般是 git root）。
// 持久化到 ~/.kodax/space/projects.json（main 端 store），UI 提供 picker / recent list。
//
// Renderer **永远不**直接把任意路径传给 main 持久化——project.openDialog 包了 main 端
// dialog.showOpenDialog，只允许用户通过原生 picker 选；project.recent.add 接收的 path
// 已经经过 validateProjectRoot 路径形态校验。

import { z } from 'zod';

const projectSchema = z.object({
  path: z.string().min(1).max(4096), // 路径长度上限——再长八成不是真路径
  name: z.string().min(1).max(256), // 显示名（默认 path basename；F043 起用户可改）
  addedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative(),
  /** F043 v0.1.8: 归档项目默认在 LeftSidebar 隐藏；未设字段 = 未归档 */
  archived: z.boolean().optional(),
  /** F149: 置顶项目在置顶区内的位置（0 = 最上）；缺省 = 未置顶。project.list 从 projects.json 的 pinned 派生。 */
  pinnedIndex: z.number().int().nonnegative().optional(),
});

export type Project = z.infer<typeof projectSchema>;

/** F149: 完整的项目主列表顺序；上限只挡畸形输入（与 main 端 projects.json 一致）。*/
const projectOrderSchema = z.array(z.string().min(1).max(4096)).max(4096);

// ---- project.list ----
export const projectListChannel = {
  name: 'project.list',
  direction: 'invoke',
  input: z.undefined(),
  output: z.object({
    projects: z.array(projectSchema),
    /** projects.json 中已保存的主列表顺序；空 = 尚未保存（projects 仍按补齐后的顺序返回）。 */
    order: projectOrderSchema,
  }),
} as const;

// ---- project.order.set ----
//
// 持久化用户拖排的项目顺序到 projects.json，dev 与打包版共享同一顺序。
export const projectOrderSetChannel = {
  name: 'project.order.set',
  direction: 'invoke',
  input: z.object({ order: projectOrderSchema }),
  output: z.object({}),
} as const;

/** F149: 替换置顶项目列表（canon 路径，置顶区顺序）；与 project.order.set 对称。 */
export const projectPinnedSetChannel = {
  name: 'project.pinned.set',
  direction: 'invoke',
  input: z.object({ pinned: projectOrderSchema }),
  output: z.object({}),
} as const;

// ---- project.openDialog ----
//
// main 端调 dialog.showOpenDialog({ properties: ['openDirectory'] })。
// 返回用户选中的 path（已经是绝对路径，OS dialog 保证），或 null 表示用户取消。
// 这是 renderer 拿到合法 path 的**唯一**途径——不允许 renderer 凭空输入路径写进 recent。
export const projectOpenDialogChannel = {
  name: 'project.openDialog',
  direction: 'invoke',
  input: z.undefined(),
  output: z.object({
    path: z.string().min(1).max(4096).nullable(),
  }),
} as const;

// ---- project.recent.add ----
export const projectRecentAddChannel = {
  name: 'project.recent.add',
  direction: 'invoke',
  input: z.object({
    path: z.string().min(1).max(4096),
  }),
  output: z.object({
    project: projectSchema,
  }),
} as const;

// ---- project.recent.remove ----
export const projectRecentRemoveChannel = {
  name: 'project.recent.remove',
  direction: 'invoke',
  input: z.object({
    path: z.string().min(1).max(4096),
  }),
  output: z.object({
    removed: z.boolean(),
  }),
} as const;

// ---- project.recent.rename ---- (F043 v0.1.8)
//
// 只改 displayName，不改文件夹。renderer 长按 / 右键项目节点 → contextmenu → Rename。
// 空字符串 / 全空白 → reject；超过 256 字符 schema 拦下。
export const projectRecentRenameChannel = {
  name: 'project.recent.rename',
  direction: 'invoke',
  input: z.object({
    path: z.string().min(1).max(4096),
    name: z.string().min(1).max(256),
  }),
  output: z.object({
    renamed: z.boolean(), // false 表示该 path 不在 allowlist
  }),
} as const;

// ---- project.recent.setArchived ---- (F043 v0.1.8)
//
// 切归档。归档后 LeftSidebar 默认折叠 + 隐藏，可显式 toggle "Show archived" 显示。
// 归档不影响 SDK session — 用户切回未归档可继续用。
export const projectRecentSetArchivedChannel = {
  name: 'project.recent.setArchived',
  direction: 'invoke',
  input: z.object({
    path: z.string().min(1).max(4096),
    archived: z.boolean(),
  }),
  output: z.object({
    ok: z.boolean(), // false 表示 path 不在 allowlist
  }),
} as const;

// ---- project.gitStats ----
//
// 读 `git log` + `git shortlog` 聚合一段时间内的 commit / churn / 每日活跃度。
// main 端用 child_process 跑 git binary——不引入 simple-git 依赖（avoid +30MB deps）。
// 超时 5s，非 git repo / 不可执行直接返回 ok:true + 全 0（让 dashboard 平和 fallback）。
const dailyCommitSchema = z.object({
  date: z.string().min(10).max(10), // YYYY-MM-DD
  count: z.number().int().nonnegative(),
});

export const projectGitStatsChannel = {
  name: 'project.gitStats',
  direction: 'invoke',
  input: z.object({
    projectRoot: z.string().min(1).max(4096),
    /** 时间范围（天）。null = all-time。 */
    sinceDays: z.number().int().positive().max(3650).nullable(),
  }),
  output: z.object({
    /** 是否真的是 git repo（false 时其它字段为 0）。 */
    isGitRepo: z.boolean(),
    /** 范围内 commit 数。*/
    commits: z.number().int().nonnegative(),
    /** 范围内不重复改动文件数（git log --name-only 去重）。*/
    filesChanged: z.number().int().nonnegative(),
    /** 范围内累计新增行数。 */
    linesAdded: z.number().int().nonnegative(),
    /** 范围内累计删除行数。 */
    linesDeleted: z.number().int().nonnegative(),
    /** 范围内活跃 author 数 (按 email 去重)。 */
    contributors: z.number().int().nonnegative(),
    /** 每日 commit 直方图（YYYY-MM-DD → count）。给 dashboard 热力图叠加用，最多 365 条。*/
    dailyCommits: z.array(dailyCommitSchema).max(365),
    /** 当前 HEAD 分支名（detached 时返回 'HEAD'）。 */
    currentBranch: z.string().max(256).nullable(),
  }),
} as const;

export type ProjectGitStatsDaily = z.infer<typeof dailyCommitSchema>;

// ---- project.gitDiff ----
//
// 返回当前 working tree 相对 HEAD 的 unified diff (`git diff HEAD`),给 /review slash 命令
// 直接拼模板填入 textarea 用。
//
// 设计:
//   - 限定相对 HEAD 的 diff (含 staged + 未 staged 的所有改动) — 用户最常关心的"我改了啥"
//   - 上限 64KB: 超出截断,不抛错 (UI 显示 "(diff truncated)" 提示)
//   - 非 git repo / 命令失败: 返回 isGitRepo: false + 空 diff
//   - 缓存: 5s mtime (HEAD 不变 + 工作区不变时同 gitStatus,但比起为 review 复用 cache 简单点,
//     这个先不 cache — 用户用 /review 的频率不会高)
export const projectGitDiffChannel = {
  name: 'project.gitDiff',
  direction: 'invoke',
  input: z.object({
    projectRoot: z.string().min(1).max(4096),
  }),
  output: z.object({
    isGitRepo: z.boolean(),
    /** unified diff 文本; 空字符串 = 无改动 / git diff 失败 (看 error 字段区分) */
    diff: z.string().max(65_536),
    /** true 表示 diff 大于 64KB 被截断,UI 显示 hint */
    truncated: z.boolean(),
    /** non-null 表示 git diff 调用本身失败 (timeout / spawn 错等),不是"无改动"。
     *  Renderer 用来区分"真的没改动"vs"git 命令出错了" (审查 Batch 4 M2)。*/
    error: z.string().max(256).nullable(),
  }),
} as const;

// ---- project.fileSearch ----
//
// 模糊匹配 project root 下的文件路径,给 BottomBar 的 @path autocomplete 用 (REPL
// SuggestionsDisplay 等价)。
//
// 实现策略 (main 端):
//   - 启动期 lazy 扫: 每个 project 第一次查询时 walk projectRoot 收集相对路径,按项目根
//     .gitignore 过滤,内置只跳依赖/版本库/缓存目录 (node_modules / .git / __pycache__ 等);
//     隐藏目录照常收录。结果存 module-level cache + 30s TTL,后续命中 cache 立即返回。
//   - 单次扫上限 50_000 文件 (大 monorepo 防内存炸),超出截断并返回 truncated=true。
//   - query 是简单 substring (case-insensitive)。subsequence/fuzzy 后续优化。
//
// **不返回内容**: 只回相对路径 (raw string)。文件读还是走 files.read。
// **不暴露绝对路径**: 隐私 (用户 home dir 等) + UI 简洁 (@src/foo.ts 比绝对路径短)。
export const projectFileSearchChannel = {
  name: 'project.fileSearch',
  direction: 'invoke',
  input: z.object({
    projectRoot: z.string().min(1).max(4096),
    /** 子串查询;空串 → 返回前 limit 条文件 (用于刚打 `@` 还没输文字时弹个清单) */
    query: z.string().max(512),
    /** 默认 30 条,popover 显示足够 */
    limit: z.number().int().positive().max(100).optional(),
    /** 点击链接定位刚生成的文件时用：跳过 cache 重扫,不套 .gitignore,结果不写 cache */
    locate: z.boolean().optional(),
    /** `@` 补全同时列文件夹（结尾带 `/`）；定位与文件面板只要文件，不传 */
    includeDirectories: z.boolean().optional(),
  }),
  output: z.object({
    /** posix 风格相对路径,如 'src/foo/bar.ts';文件夹结尾带 '/',如 'src/foo/' */
    paths: z.array(z.string().min(1).max(2048)).max(100),
    /** 是否截断 — true 表示还有更多匹配未返回,或遍历撞到文件数上限 */
    truncated: z.boolean(),
  }),
} as const;

// ---- project.gitStatus ----
//
// 实时读 git working tree 脏度,给 BottomBar 上的 StashNotice 用 (REPL TUI 同款功能):
// 工作区有未提交改动时显示一条"N modified · M untracked"的提示行,避免用户在 dirty 仓库里
// 误启动 KodaX 跑 task 把变更覆盖掉。轻量 — 单次 `git status --porcelain -b` 调用,~10-30ms。
//
// 缓存策略: main 端 module-level mtime + 5s TTL (同 gitStats),renderer 频繁切场景不会撞 git。
//
// **不**返回文件路径列表 (DoS guard + 隐私): 只回计数 + branch 名,避免 leak file structure 到 renderer。
export const projectGitStatusChannel = {
  name: 'project.gitStatus',
  direction: 'invoke',
  input: z.object({
    projectRoot: z.string().min(1).max(4096),
  }),
  output: z.object({
    /** false = 非 git repo / git 不可用 / projectRoot 不存在等。 */
    isGitRepo: z.boolean(),
    /** modified + staged + untracked > 0 → 工作区 dirty (UI 弹 StashNotice 条件)。 */
    dirty: z.boolean(),
    /** Modified (worktree 修改未 staged) 文件数。 */
    modifiedCount: z.number().int().nonnegative(),
    /** Staged (已 git add 等待 commit) 文件数。 */
    stagedCount: z.number().int().nonnegative(),
    /** Untracked (未 git add 也未 .gitignore) 文件数。 */
    untrackedCount: z.number().int().nonnegative(),
    /** 当前分支名 (detached HEAD 时返回 'HEAD' 或短 SHA)。 */
    branch: z.string().max(256).nullable(),
    /** main/master 上游的领先 / 落后 commit 数 (无上游时 undefined)。 */
    ahead: z.number().int().nonnegative().optional(),
    behind: z.number().int().nonnegative().optional(),
  }),
} as const;

// project.gitChanges — F041 v0.1.4 新增 (右侧栏 Changes 节用)
//
// 返回**带路径**的变动文件列表，区别于 project.gitStatus（只回计数）。
//
// 安全：
//   - 200 文件上限 + truncated 标志：超出 N 条仍能用、UI 弹 "+N more"；防 zip-bomb 类几万文件 DoS UI
//   - path max 2048：单条路径上限；rare 极长路径 (zsh ./super/long/...) 不撑爆 IPC
//   - 复用 validateProjectRoot + runGit + 5s TTL cache（同 gitStatus）
//   - 只回 path/status/staged 三个最小字段；不回 mtime / size 等可能 leak 文件元数据
//   - status enum 严格：M/A/D/R/U；其它 git 状态字 (C/?/!) 上层归一化为最近邻
export const projectGitChangesChannel = {
  name: 'project.gitChanges',
  direction: 'invoke',
  input: z.object({
    projectRoot: z.string().min(1).max(4096),
  }),
  output: z.object({
    /** false = 非 git repo / git 不可用 / projectRoot 不存在等。 */
    isGitRepo: z.boolean(),
    /** 当前分支名 (detached HEAD 时返回 'HEAD' 或短 SHA)。 */
    branch: z.string().max(256).nullable(),
    /** 变动文件列表，上限 200 条。staged + worktree + untracked 合并；同 path 多变（如 staged M + worktree M）合并显示。 */
    files: z
      .array(
        z.object({
          /** 相对 projectRoot 的 posix 路径。 */
          path: z.string().min(1).max(2048),
          /** M=modified, A=added, D=deleted, R=renamed, U=untracked。 */
          status: z.enum(['M', 'A', 'D', 'R', 'U']),
          /** 该 path 至少有一部分 staged (X != ' ')。worktree-only 改动 staged=false。 */
          staged: z.boolean(),
        }),
      )
      .max(200),
    /** true = 文件总数超 200，files 被截断；UI 显示 "+N more"。 */
    truncated: z.boolean(),
  }),
} as const;

// F044 (v0.1.10) — git working-tree diff for a single file.
//
// 跟 files.diff (tool-call write/edit 缓存的 before/after) 是两条独立语义:
//   - files.diff:        "AI 改文件那一瞬"的快照, in-memory cache only
//   - project.gitFileDiff: "当前 working tree vs HEAD"的 git 状态
//
// 历史 session 切回去时 files.diff 永远 miss (cache 不在本进程),DiffPanel
// fallback 到这条;实时 tool-call 仍优先 files.diff (语义更精确)。
//
// 上限 1 MB / file —— Monaco diff render 超大文件没意义,提前拒。
// Binary file 检测 (前 8KB 含 NUL byte) → 拒绝 inline diff,UI 显示"Binary"。
export const projectGitFileDiffChannel = {
  name: 'project.gitFileDiff',
  direction: 'invoke',
  input: z.object({
    projectRoot: z.string().min(1).max(4096),
    // F044 security review HIGH-1: 拒 NUL byte。Linux/macOS libc 把 path 在 NUL 处截断,
    // 让 isPathInside 检查的字符串跟 fs.open 实际打开的文件不一致 → 可能读到不同文件。
    // 同 validateProjectRoot:25 的防御。
    path: z
      .string()
      .min(1)
      .max(4096)
      .refine((s) => !s.includes('\x00'), { message: 'path must not contain NUL byte' }),
  }),
  output: z.object({
    /** false = 无可显示的 diff;前端显示 reason 文案。*/
    available: z.boolean(),
    /** HEAD 上的内容;untracked file → ''。 */
    before: z.string().max(1_048_576),
    /** working tree 当前内容;deleted file → ''。 */
    after: z.string().max(1_048_576),
    /** true = file 在 working tree 存在但不在 HEAD (新加未 commit)。 */
    isUntracked: z.boolean().optional(),
    /** true = binary file (含 NUL byte 等)。available 同步 false。 */
    isBinary: z.boolean().optional(),
    /** available=false 时给前端精准文案的 hint。 */
    reason: z
      .enum(['ok', 'file-too-large', 'is-binary', 'not-a-git-repo', 'no-such-file', 'git-error'])
      .optional(),
  }),
} as const;
