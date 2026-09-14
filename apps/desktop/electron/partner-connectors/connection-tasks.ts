import { randomUUID } from 'node:crypto';
import {
  partnerConnectorOnboardingValueSchema,
  type PartnerConnectorOnboardingT,
  type PartnerConnectorOnboardingValueT,
} from '@kodax-space/space-ipc-schema';
import {
  FeishuOnboardingError,
  isFeishuOnboardingAuthorizationUrl,
  type FeishuOnboardingInput,
  type FeishuOnboardingProgress,
} from './feishu-onboarding-cli.js';
import { PartnerConnectorCommitError, type PartnerConnectorService } from './service.js';
import { ReadConnectorError, type ReadConnector } from './read-connector.js';

type Owner = { extensionId: string; connectorId: string };
type Identity = Owner & { id: string };
interface Task {
  job: PartnerConnectorOnboardingT;
  readonly profile: string;
  readonly controller: AbortController;
  readonly deadline: number;
  promise: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  authorizationUrl?: string;
  abortReason?: 'cancelled' | 'expired';
  adapter?: ReadConnector;
  pendingInput?: {
    kind: NonNullable<PartnerConnectorOnboardingT['inputKind']>;
    resolve(value: PartnerConnectorOnboardingValueT): void;
    reject(error: Error): void;
  };
}
interface Dependencies {
  service: Pick<PartnerConnectorService, 'assertConnectionAllowed' | 'connect'>;
  run(input: FeishuOnboardingInput): Promise<void>;
  resolveAdapter?(owner: Owner): Promise<ReadConnector | undefined>;
  openExternal(url: string, assertActive: () => void): Promise<void>;
  changed?(job: PartnerConnectorOnboardingT): void;
}
const MAX_TASKS = 32;
// Private installation plus both official authorization stages and verification.
const MAX_TASK_MS = 40 * 60 * 1000;
const terminal = (job: PartnerConnectorOnboardingT): boolean =>
  ['needs_install', 'connected', 'cancelled', 'expired', 'failed'].includes(job.phase);
const sameOwner = (a: Owner, b: Owner): boolean =>
  a.extensionId === b.extensionId && a.connectorId === b.connectorId;

/** Ephemeral host jobs. Codes/URLs are never persisted, projected to IPC or replayed after restart. */
export class PartnerConnectorTasks {
  private readonly tasks = new Map<string, Task>();
  private disposed = false;
  constructor(private readonly deps: Dependencies) {}

  start(input: Owner & { installCli?: boolean }): PartnerConnectorOnboardingT {
    if (this.disposed) throw new Error('连接服务已关闭');
    const active = [...this.tasks.values()].find((task) => !terminal(task.job));
    if (active) {
      if (sameOwner(active.job, input)) return structuredClone(active.job);
      throw new Error('已有连接流程正在进行，请先完成或取消');
    }
    if (this.tasks.size >= MAX_TASKS) this.tasks.delete(this.tasks.keys().next().value!);
    const id = randomUUID();
    const task: Task = {
      job: {
        id,
        extensionId: input.extensionId,
        connectorId: input.connectorId,
        phase: 'preparing',
        canReopen: false,
      },
      profile: `space-${randomUUID()}`,
      controller: new AbortController(),
      deadline: Date.now() + MAX_TASK_MS,
      promise: Promise.resolve(),
    };
    this.tasks.set(id, task);
    this.scheduleExpiry(task, task.deadline);
    task.promise = Promise.resolve().then(() => this.execute(task, input.installCli === true));
    this.publish(task, {});
    return structuredClone(task.job);
  }

  get(input: Identity): PartnerConnectorOnboardingT {
    return structuredClone(this.requireTask(input).job);
  }
  submit(
    input: Identity & { value: PartnerConnectorOnboardingValueT },
  ): PartnerConnectorOnboardingT {
    const task = this.requireTask(input);
    this.assertLive(task);
    const pending = task.pendingInput;
    const value = partnerConnectorOnboardingValueSchema.parse(input.value);
    if (
      !pending ||
      !{
        mail_credentials: 'email' in value,
        authorization_complete: 'confirmed' in value,
        slack_token: 'token' in value,
        github_token: 'token' in value,
        zoom_account: 'accountId' in value,
      }[pending.kind]
    )
      throw new Error('此连接步骤不接受该输入');
    task.pendingInput = undefined;
    this.publish(task, { inputKind: undefined, phase: 'verifying' });
    pending.resolve(value);
    return structuredClone(task.job);
  }
  private requestInput(
    task: Task,
    kind: NonNullable<PartnerConnectorOnboardingT['inputKind']>,
  ): Promise<PartnerConnectorOnboardingValueT> {
    this.assertLive(task);
    if (task.pendingInput) throw new Error('已有输入步骤等待完成');
    return new Promise((resolve, reject) => {
      task.pendingInput = { kind, resolve, reject };
      this.publish(task, {
        inputKind: kind,
        phase: kind === 'authorization_complete' ? 'waiting_authorization' : 'waiting_input',
      });
    });
  }
  async cancel(input: Identity): Promise<PartnerConnectorOnboardingT> {
    const task = this.requireTask(input);
    this.abort(task, 'cancelled');
    await task.promise;
    return structuredClone(task.job);
  }
  async reopen(input: Identity): Promise<void> {
    const task = this.requireTask(input);
    this.assertLive(task);
    if (
      !task.authorizationUrl ||
      !task.job.canReopen ||
      !this.validAuthorizationUrl(task, task.authorizationUrl)
    )
      throw new Error('没有可重新打开的有效授权页面');
    try {
      await this.deps.openExternal(task.authorizationUrl, () => this.assertLive(task));
    } catch {
      throw new Error('无法打开系统浏览器，请点击重新打开授权页');
    }
  }
  async cancelForExtension(extensionId?: string): Promise<void> {
    const tasks = [...this.tasks.values()].filter(
      (task) => extensionId === undefined || task.job.extensionId === extensionId,
    );
    tasks.forEach((task) => this.abort(task, 'cancelled'));
    await Promise.all(tasks.map((task) => task.promise));
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.cancelForExtension();
  }

  private requireTask(input: Identity): Task {
    const task = this.tasks.get(input.id);
    if (!task || !sameOwner(task.job, input)) throw new Error('连接任务不存在或不属于此连接器');
    return task;
  }
  private validAuthorizationUrl(task: Task, value: unknown): value is string {
    return task.adapter
      ? task.adapter.isAuthorizationUrl(value)
      : isFeishuOnboardingAuthorizationUrl(value);
  }
  private assertLive(task: Task): void {
    if (task.controller.signal.aborted || terminal(task.job) || this.disposed)
      throw new FeishuOnboardingError(task.abortReason ?? 'cancelled');
    if (
      Date.now() >= task.deadline ||
      (task.job.expiresAt && Date.now() >= Date.parse(task.job.expiresAt))
    ) {
      this.abort(task, 'expired');
      throw new FeishuOnboardingError('expired');
    }
  }
  private publish(task: Task, patch: Partial<PartnerConnectorOnboardingT>): void {
    task.job = { ...task.job, ...patch };
    this.deps.changed?.(structuredClone(task.job));
  }
  private abort(task: Task, reason: 'cancelled' | 'expired'): void {
    if (terminal(task.job) || task.controller.signal.aborted) return;
    task.abortReason = reason;
    task.authorizationUrl = undefined;
    clearTimeout(task.timer);
    task.pendingInput?.reject(new ReadConnectorError(reason));
    task.pendingInput = undefined;
    task.controller.abort();
    this.publish(task, { canReopen: false, inputKind: undefined });
  }
  private scheduleExpiry(task: Task, deadline: number): void {
    clearTimeout(task.timer);
    task.timer = setTimeout(() => this.abort(task, 'expired'), Math.max(0, deadline - Date.now()));
    task.timer.unref();
  }
  private progress(task: Task, progress: FeishuOnboardingProgress): void {
    this.assertLive(task);
    if (
      progress.authorizationUrl &&
      (!['waiting_app', 'waiting_authorization'].includes(progress.phase) ||
        !this.validAuthorizationUrl(task, progress.authorizationUrl))
    )
      throw new FeishuOnboardingError('invalid_response');
    const requestedDeadline =
      progress.expiresAt === undefined ? task.deadline : Date.parse(progress.expiresAt);
    if (!Number.isFinite(requestedDeadline)) throw new FeishuOnboardingError('invalid_response');
    const deadline = Math.min(requestedDeadline, task.deadline);
    if (deadline <= Date.now()) throw new FeishuOnboardingError('expired');
    task.authorizationUrl = progress.authorizationUrl;
    this.publish(task, {
      phase: progress.phase,
      canReopen: !!progress.authorizationUrl,
      expiresAt: progress.expiresAt === undefined ? undefined : new Date(deadline).toISOString(),
      error: undefined,
    });
    this.scheduleExpiry(task, deadline);
    if (task.authorizationUrl)
      void this.reopen(task.job).catch(() => {
        if (!terminal(task.job) && !task.controller.signal.aborted)
          this.publish(task, { error: '无法打开系统浏览器，请点击重新打开授权页' });
      });
  }
  private finish(task: Task, patch: Partial<PartnerConnectorOnboardingT>): void {
    clearTimeout(task.timer);
    task.authorizationUrl = undefined;
    task.pendingInput?.reject(new ReadConnectorError('cancelled'));
    task.pendingInput = undefined;
    this.publish(task, { ...patch, canReopen: false, expiresAt: undefined, inputKind: undefined });
  }
  private async execute(task: Task, installCli: boolean): Promise<void> {
    try {
      this.assertLive(task);
      await this.deps.service.assertConnectionAllowed(task.job.extensionId, task.job.connectorId);
      task.adapter = await this.deps.resolveAdapter?.(task.job);
      this.assertLive(task);
      const input: FeishuOnboardingInput = {
        requestInput: (kind) => this.requestInput(task, kind),
        profile: task.profile,
        // Shared onboarding IPC keeps explicit install consent for the other
        // read-only providers. Feishu is host-managed and must never accept an
        // installation decision from renderer input.
        installCli: task.adapter ? installCli : false,
        signal: task.controller.signal,
        onProgress: (event) => this.progress(task, event),
      };
      if (task.adapter) await task.adapter.run(input);
      else await this.deps.run(input);
      this.assertLive(task);
      this.progress(task, { phase: 'verifying' });
      await this.deps.service.connect(
        {
          extensionId: task.job.extensionId,
          connectorId: task.job.connectorId,
          profile: task.profile,
        },
        {
          signal: task.controller.signal,
          ...(task.adapter ? { expectedAdapter: task.adapter.id } : {}),
          assertActive: () => this.assertLive(task),
          complete: (connection) => this.finish(task, { phase: 'connected', connection }),
        },
      );
    } catch (error) {
      const code =
        error instanceof PartnerConnectorCommitError
          ? 'authorization_failed'
          : (task.abortReason ??
            (error instanceof FeishuOnboardingError || error instanceof ReadConnectorError
              ? error.code
              : 'authorization_failed'));
      this.finish(task, {
        phase:
          code === 'needs_install' || code === 'cancelled' || code === 'expired' ? code : 'failed',
        error:
          error instanceof PartnerConnectorCommitError
            ? error.message
            : task.adapter
              ? task.abortReason
                ? new ReadConnectorError(task.abortReason).message
                : error instanceof ReadConnectorError
                  ? error.message
                  : new ReadConnectorError('authorization_failed').message
              : new FeishuOnboardingError(code as FeishuOnboardingError['code']).message,
      });
    }
  }
}
