import type {
  FeishuBaseCreateFieldT,
  PartnerFeishuBaseCreateTaskT,
} from '@kodax-space/space-ipc-schema';
import { Database, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';

function fieldTypeLabel(field: FeishuBaseCreateFieldT, t: ReturnType<typeof useI18n>['t']): string {
  if (field.type === 'text') return t('partner.baseTask.field.text');
  if (field.type === 'number') return t('partner.baseTask.field.number');
  if (field.type === 'select') return t('partner.baseTask.field.select');
  if (field.type === 'datetime') return t('partner.baseTask.field.datetime');
  return t('partner.baseTask.field.checkbox');
}

function BaseTaskFields({
  fields,
}: {
  readonly fields: PartnerFeishuBaseCreateTaskT['fields'];
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="mt-5">
      <h3 className="text-xs font-medium text-fg-primary">{t('partner.baseTask.fields')}</h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {fields.map((field) => (
          <span
            key={field.name}
            className="rounded-md border border-border-default bg-surface-2 px-2 py-1 text-xs text-fg-secondary"
          >
            {field.name} · {fieldTypeLabel(field, t)}
          </span>
        ))}
      </div>
    </div>
  );
}

function BaseTaskHeader({ task }: { readonly task: PartnerFeishuBaseCreateTaskT }): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-ink">
        <Database className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-fg-primary">{task.baseName}</h2>
        <p className="mt-1 text-xs text-fg-secondary">
          {t(`partner.baseTask.status.${task.status}`)}
        </p>
      </div>
    </div>
  );
}

function BaseTaskMetadata({ task }: { readonly task: PartnerFeishuBaseCreateTaskT }): JSX.Element {
  const { t } = useI18n();
  return (
    <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
      <dt className="text-fg-muted">{t('partner.baseTask.baseName')}</dt>
      <dd className="break-words text-fg-primary">{task.baseName}</dd>
      <dt className="text-fg-muted">{t('partner.baseTask.tableName')}</dt>
      <dd className="break-words text-fg-primary">{task.tableName}</dd>
    </dl>
  );
}

export function PartnerFeishuBaseTaskPanel({
  task,
}: {
  readonly task: PartnerFeishuBaseCreateTaskT;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <section
      data-testid="partner-feishu-base-task"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface p-4"
    >
      <BaseTaskHeader task={task} />
      <BaseTaskMetadata task={task} />
      <BaseTaskFields fields={task.fields} />

      {task.error ? (
        <p role="alert" className="mt-4 break-words text-xs text-danger">
          {task.error}
        </p>
      ) : null}
      <p className="mt-auto flex items-start gap-2 pt-6 text-[11px] leading-relaxed text-fg-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t('partner.baseTask.safety')}</span>
      </p>
    </section>
  );
}
