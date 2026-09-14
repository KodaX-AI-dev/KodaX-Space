import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  FolderPlus,
  Paperclip,
  Plug,
  Puzzle,
  Slash,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { SkillMeta, SlashCommandMeta } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../store/appStore.js';
import { Caret } from '../components/Caret.js';
import { useI18n } from '../i18n/I18nProvider.js';
import type { MessageKey } from '../i18n/messages.js';
import { safeSkillSlashText, skillSlashInsertText } from './skillSlash.js';

interface PartnerAttachMenuProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAddFiles: () => void;
  readonly onAddFolder: () => void;
  readonly onInsertText: (text: string) => void;
  readonly partnerConnectorContent: ReactNode;
  readonly partnerExpertContent: ReactNode;
}

const SLASH_COMMANDS: readonly { cmd: string; descKey: MessageKey }[] = [
  { cmd: '/help', descKey: 'attach.slash.help' },
  { cmd: '/clear', descKey: 'attach.slash.clear' },
  { cmd: '/mode', descKey: 'attach.slash.mode' },
  { cmd: '/model', descKey: 'attach.slash.model' },
];

type Flyout = 'slash' | 'connectors' | 'skills' | 'experts' | null;

/** Partner owns hover flyouts; Coder keeps using the unchanged AttachMenu. */
export function PartnerAttachMenu({
  open,
  onClose,
  onAddFiles,
  onAddFolder,
  onInsertText,
  partnerConnectorContent,
  partnerExpertContent,
}: PartnerAttachMenuProps): JSX.Element | null {
  const { t } = useI18n();
  const currentProjectPath = useAppStore((state) => state.currentProjectPath);
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [skills, setSkills] = useState<readonly SkillMeta[] | null>(null);
  const [slashCommands, setSlashCommands] = useState<readonly SlashCommandMeta[]>([]);
  const [skillError, setSkillError] = useState<string | null>(null);
  const skillsRequest = useRef<Promise<void> | null>(null);
  const skillsRevision = useRef(0);
  const menuId = useId();
  const slashButtonId = `${menuId}-slash-trigger`;
  const slashFlyoutId = `${menuId}-slash-flyout`;
  const connectorButtonId = `${menuId}-connector-trigger`;
  const connectorFlyoutId = `${menuId}-connector-flyout`;
  const skillButtonId = `${menuId}-skill-trigger`;
  const skillFlyoutId = `${menuId}-skill-flyout`;
  const expertButtonId = `${menuId}-expert-trigger`;
  const expertFlyoutId = `${menuId}-expert-flyout`;

  useEffect(() => {
    if (!open) {
      skillsRevision.current += 1;
      setFlyout(null);
      setSkills(null);
      setSlashCommands([]);
      setSkillError(null);
      skillsRequest.current = null;
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (flyout) setFlyout(null);
      else onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flyout, onClose, open]);

  useEffect(() => {
    skillsRevision.current += 1;
    skillsRequest.current = null;
    setSkills(null);
    setSlashCommands([]);
    setSkillError(null);
  }, [currentProjectPath]);

  if (!open) return null;

  const openSkills = (): void => {
    setFlyout('skills');
    if (skillsRequest.current || skills !== null || skillError) return;
    if (!currentProjectPath) {
      setSkillError(t('attach.openProjectForSkills'));
      return;
    }
    if (!window.kodaxSpace) {
      setSkillError(t('attach.loadSkillsFailed'));
      return;
    }
    setSkillError(null);
    const revision = ++skillsRevision.current;
    const request = Promise.all([
      window.kodaxSpace.invoke('skill.discover', { projectRoot: currentProjectPath }),
      window.kodaxSpace.invoke('slash.discover', undefined),
    ])
      .then(([skillsResult, commandsResult]) => {
        if (revision !== skillsRevision.current) return;
        setSlashCommands(commandsResult.ok ? commandsResult.data.commands : []);
        if (skillsResult.ok) setSkills(skillsResult.data.skills);
        else setSkillError(skillsResult.error?.message ?? t('attach.loadSkillsFailed'));
      })
      .finally(() => {
        if (skillsRequest.current === request) skillsRequest.current = null;
      });
    skillsRequest.current = request;
  };

  return (
    <div
      data-testid="partner-attach-menu"
      className="absolute bottom-full left-0 z-50 mb-1 w-60 rounded-lg border border-border-default bg-surface-4 py-1 text-xs shadow-xl"
      onMouseLeave={onClose}
    >
      <PartnerAttachRow
        Icon={Paperclip}
        label={t('attach.addFiles')}
        onActivate={() => setFlyout(null)}
        onClick={() => {
          onAddFiles();
          onClose();
        }}
      />
      <PartnerAttachRow
        Icon={FolderPlus}
        label={t('attach.addFolder')}
        onActivate={() => setFlyout(null)}
        onClick={() => {
          onAddFolder();
          onClose();
        }}
      />
      <PartnerAttachRow
        Icon={Slash}
        label={t('attach.slashCommands')}
        id={slashButtonId}
        flyoutId={slashFlyoutId}
        onActivate={() => setFlyout('slash')}
        onClick={() => setFlyout('slash')}
        expanded={flyout === 'slash'}
        chevron
      />
      <PartnerAttachRow
        Icon={Plug}
        label={t('attach.connectors')}
        id={connectorButtonId}
        flyoutId={connectorFlyoutId}
        onActivate={() => setFlyout('connectors')}
        onClick={() => setFlyout('connectors')}
        expanded={flyout === 'connectors'}
        chevron
      />
      <PartnerAttachRow
        Icon={Puzzle}
        label={t('attach.skills')}
        id={skillButtonId}
        flyoutId={skillFlyoutId}
        onActivate={openSkills}
        onClick={openSkills}
        expanded={flyout === 'skills'}
        chevron
      />
      <PartnerAttachRow
        Icon={UserRound}
        label={t('attach.experts')}
        id={expertButtonId}
        flyoutId={expertFlyoutId}
        onActivate={() => setFlyout('experts')}
        onClick={() => setFlyout('experts')}
        expanded={flyout === 'experts'}
        chevron
      />

      {flyout === 'slash' && (
        <PartnerFlyout
          id={slashFlyoutId}
          ownerId={slashButtonId}
          title={t('attach.slashCommands')}
          testId="partner-slash-flyout"
          onBack={() => setFlyout(null)}
        >
          {SLASH_COMMANDS.map((command) => (
            <button
              key={command.cmd}
              type="button"
              onClick={() => {
                onInsertText(`${command.cmd} `);
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-hover-bg"
            >
              <code className="font-mono text-ok">{command.cmd}</code>
              <span className="truncate text-fg-muted">{t(command.descKey)}</span>
            </button>
          ))}
        </PartnerFlyout>
      )}
      {flyout === 'connectors' && (
        <PartnerFlyout
          id={connectorFlyoutId}
          ownerId={connectorButtonId}
          title={t('attach.connectors')}
          testId="partner-connectors-flyout"
          hideHeader
          matchRootSize
          onBack={() => setFlyout(null)}
        >
          {partnerConnectorContent}
        </PartnerFlyout>
      )}
      {flyout === 'skills' && (
        <PartnerFlyout
          id={skillFlyoutId}
          ownerId={skillButtonId}
          title={t('attach.skills')}
          testId="partner-skills-flyout"
          onBack={() => setFlyout(null)}
        >
          {skillError && <p className="px-3 py-2 text-xs text-warn">{skillError}</p>}
          {skills === null && !skillError && (
            <p role="status" className="px-3 py-2 text-xs text-fg-muted">
              {t('attach.loading')}
            </p>
          )}
          {skills !== null && skills.length === 0 && (
            <p className="px-3 py-2 text-xs text-fg-muted">{t('attach.noSkills')}</p>
          )}
          {skills?.map((skill) => (
            <button
              key={`${skill.source}:${skill.name}`}
              type="button"
              title={`${skill.path} (${skill.source})`}
              onClick={() => {
                onInsertText(skillSlashInsertText(skill.name, slashCommands));
                onClose();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-hover-bg"
            >
              <code className="font-mono text-ok">
                {safeSkillSlashText(skill.name, slashCommands)}
              </code>
              <span className="min-w-0 flex-1 truncate text-fg-muted">{skill.description}</span>
            </button>
          ))}
        </PartnerFlyout>
      )}
      {flyout === 'experts' && (
        <PartnerFlyout
          id={expertFlyoutId}
          ownerId={expertButtonId}
          title={t('attach.experts')}
          testId="partner-experts-flyout"
          hideHeader
          matchRootSize
          onBack={() => setFlyout(null)}
        >
          {partnerExpertContent}
        </PartnerFlyout>
      )}
    </div>
  );
}

function PartnerFlyout({
  id,
  ownerId,
  title,
  testId,
  hideHeader = false,
  matchRootSize = false,
  onBack,
  children,
}: {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly testId: string;
  readonly hideHeader?: boolean;
  readonly matchRootSize?: boolean;
  readonly onBack: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div
      className={`absolute bottom-0 left-full pl-2 ${matchRootSize ? 'w-[15.5rem]' : 'w-[18.5rem]'}`}
    >
      <section
        id={id}
        data-testid={testId}
        role="dialog"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft') return;
          event.preventDefault();
          onBack();
          requestAnimationFrame(() => document.getElementById(ownerId)?.focus());
        }}
        className={`max-h-80 overflow-y-auto rounded-lg border border-border-default bg-surface-4 py-1 shadow-xl ${matchRootSize ? 'w-60' : 'w-72'}`}
      >
        {!hideHeader && (
          <header className="sticky top-0 z-10 border-b border-border-default bg-surface-4 px-3 py-2 text-xs font-medium text-fg-secondary">
            {title}
          </header>
        )}
        {children}
      </section>
    </div>
  );
}

function PartnerAttachRow({
  Icon,
  label,
  id,
  flyoutId,
  onActivate,
  onClick,
  expanded,
  chevron,
}: {
  readonly Icon: LucideIcon;
  readonly label: string;
  readonly id?: string;
  readonly flyoutId?: string;
  readonly onActivate: () => void;
  readonly onClick: () => void;
  readonly expanded?: boolean;
  readonly chevron?: boolean;
}): JSX.Element {
  return (
    <button
      id={id}
      type="button"
      onMouseEnter={onActivate}
      onFocus={onActivate}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' || !flyoutId) return;
        event.preventDefault();
        onActivate();
        requestAnimationFrame(() => document.getElementById(flyoutId)?.focus());
      }}
      aria-haspopup={flyoutId ? 'dialog' : undefined}
      aria-controls={flyoutId}
      aria-expanded={flyoutId ? !!expanded : undefined}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-fg-secondary hover:bg-hover-bg focus-visible:bg-hover-bg ${expanded ? 'bg-hover-bg text-fg-primary' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {chevron && <Caret open={false} className="text-fg-faint" />}
    </button>
  );
}
