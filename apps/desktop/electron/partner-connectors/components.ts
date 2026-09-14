import type { PartnerComponentIdT, PartnerComponentT } from '@kodax-space/space-ipc-schema';
import { ReadConnectorError } from './read-connector.js';
import { FeishuOnboardingError } from './feishu-auth-process.js';

/** Installation and local verification only; this boundary has no account or session authority. */
export interface ConnectorComponent {
  readonly version: string;
  readonly supported: boolean;
  inspect(signal: AbortSignal): Promise<boolean>;
  install(signal: AbortSignal): Promise<unknown>;
}
type Job = { controller: AbortController; promise: Promise<void> };
export class PartnerConnectorComponents {
  private readonly states = new Map<PartnerComponentIdT, PartnerComponentT>();
  private readonly jobs = new Map<PartnerComponentIdT, Job>();
  private disposed = false;
  constructor(
    private readonly components: Partial<Record<PartnerComponentIdT, ConnectorComponent>>,
  ) {
    for (const [id, component] of Object.entries(components))
      this.states.set(id as PartnerComponentIdT, {
        id: id as PartnerComponentIdT,
        version: component.version,
        state: component.supported ? 'missing' : 'unsupported',
      });
  }
  async list(refresh = false): Promise<PartnerComponentT[]> {
    if (refresh) await Promise.all([...this.states.keys()].map((id) => this.inspect(id)));
    return structuredClone([...this.states.values()]);
  }
  private async inspect(id: PartnerComponentIdT): Promise<void> {
    const component = this.components[id]!;
    if (!component.supported || this.jobs.has(id)) return;
    const previous = this.states.get(id);
    try {
      const ready = await component.inspect(AbortSignal.timeout(30000));
      if (this.states.get(id) === previous) this.update(id, ready ? 'ready' : 'missing');
    } catch (error) {
      if (this.states.get(id) === previous) this.update(id, 'failed', this.safeError(error));
    }
  }
  isInstalling(): boolean {
    return this.jobs.size > 0;
  }
  install(id: PartnerComponentIdT): PartnerComponentT {
    const component = this.components[id];
    if (this.disposed || !component?.supported) throw new Error('连接组件不可安装。');
    if (!this.jobs.has(id)) {
      const controller = new AbortController();
      this.update(id, 'installing');
      const promise = Promise.resolve().then(async () => {
        try {
          await component.install(controller.signal);
          if (controller.signal.aborted) this.update(id, 'cancelled');
          else this.update(id, 'ready');
        } catch (error) {
          this.update(
            id,
            controller.signal.aborted ? 'cancelled' : 'failed',
            controller.signal.aborted ? undefined : this.safeError(error),
          );
        } finally {
          this.jobs.delete(id);
        }
      });
      this.jobs.set(id, { controller, promise });
    }
    return structuredClone(this.states.get(id)!);
  }
  async cancel(id: PartnerComponentIdT): Promise<PartnerComponentT> {
    const job = this.jobs.get(id);
    job?.controller.abort();
    await job?.promise;
    const state = this.states.get(id);
    if (!state) throw new Error('连接组件不存在。');
    return structuredClone(state);
  }
  async waitForIdle(): Promise<void> {
    await Promise.all([...this.jobs.values()].map((job) => job.promise));
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    for (const job of this.jobs.values()) job.controller.abort();
    await this.waitForIdle();
  }
  private update(id: PartnerComponentIdT, state: PartnerComponentT['state'], error?: string): void {
    this.states.set(id, {
      id,
      version: this.components[id]!.version,
      state,
      ...(error ? { error } : {}),
    });
  }
  private safeError(error: unknown): string {
    return error instanceof ReadConnectorError || error instanceof FeishuOnboardingError
      ? error.message
      : '连接组件安装或校验失败，请重试。';
  }
}
