// Composer attachment and command menu. File selection is delegated to
// BottomBar so picker, drag-drop, and paste share the same attachment pipeline.

import { useEffect, useState, type ReactNode } from 'react';
import {
  Paperclip,
  FolderPlus,
  Slash,
  Plug,
  Puzzle,
  UserRound,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import type { McpServerMeta, SkillMeta, SlashCommandMeta } from '@kodax-space/space-ipc-schema';
import { useAppStore } from '../store/appStore.js';
import { Caret } from '../components/Caret.js';
import { useI18n } from '../i18n/I18nProvider.js';
import type { MessageKey } from '../i18n/messages.js';
import { safeSkillSlashText, skillSlashInsertText } from './skillSlash.js';

interface AttachMenuProps {
  open: boolean;
  onClose: () => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onInsertText: (text: string) => void;
  /** Partner injects its governed account picker instead of Coder's MCP discovery. */
  partnerConnectorContent?: ReactNode;
  onOpenPartnerExperts?: () => void;
  /** Opens directly into a low-frequency picker while preserving the shared discovery path. */
  initialSub?: 'root' | 'skills';
}

const SLASH_COMMANDS: readonly { cmd: string; descKey: MessageKey }[] = [
  { cmd: '/help', descKey: 'attach.slash.help' },
  { cmd: '/clear', descKey: 'attach.slash.clear' },
  { cmd: '/mode', descKey: 'attach.slash.mode' },
  { cmd: '/model', descKey: 'attach.slash.model' },
];

type SubMenu = 'root' | 'slash' | 'connectors' | 'skills';

export function AttachMenu({
  open,
  onClose,
  onAddFiles,
  onAddFolder,
  onInsertText,
  partnerConnectorContent,
  onOpenPartnerExperts,
  initialSub = 'root',
}: AttachMenuProps): JSX.Element | null {
  const { t } = useI18n();
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  const [sub, setSub] = useState<SubMenu>('root');
  const [mcpServers, setMcpServers] = useState<readonly McpServerMeta[] | null>(null);
  const [skills, setSkills] = useState<readonly SkillMeta[] | null>(null);
  const [slashCommands, setSlashCommands] = useState<readonly SlashCommandMeta[]>([]);
  const [discoverErr, setDiscoverErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSub('root');
      setMcpServers(null);
      setSkills(null);
      setSlashCommands([]);
      setDiscoverErr(null);
      return;
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (sub === 'root' || initialSub === 'skills') onClose();
        else setSub('root');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [initialSub, open, onClose, sub]);

  useEffect(() => {
    if (!open || initialSub !== 'skills') return;
    let alive = true;
    setSub('skills');
    setDiscoverErr(null);
    if (!currentProjectPath) {
      setDiscoverErr(t('attach.openProjectForSkills'));
      return;
    }
    if (!window.kodaxSpace) {
      setDiscoverErr(t('attach.loadSkillsFailed'));
      return;
    }
    void Promise.all([
      window.kodaxSpace.invoke('skill.discover', { projectRoot: currentProjectPath }),
      window.kodaxSpace.invoke('slash.discover', undefined),
    ]).then(([skillsResult, commandsResult]) => {
      if (!alive) return;
      setSlashCommands(commandsResult.ok ? commandsResult.data.commands : []);
      if (skillsResult.ok) setSkills(skillsResult.data.skills);
      else setDiscoverErr(skillsResult.error?.message ?? t('attach.loadSkillsFailed'));
    });
    return () => {
      alive = false;
    };
  }, [currentProjectPath, initialSub, open, t]);

  if (!open) return null;

  function addFiles(): void {
    onAddFiles();
    onClose();
  }

  function addFolder(): void {
    onAddFolder();
    onClose();
  }

  async function loadConnectors(): Promise<void> {
    if (!window.kodaxSpace) return;
    if (!currentProjectPath) {
      setDiscoverErr(t('attach.openProjectForMcp'));
      setSub('connectors');
      return;
    }
    setSub('connectors');
    setDiscoverErr(null);
    const r = await window.kodaxSpace.invoke('mcp.discover', { projectRoot: currentProjectPath });
    if (r.ok) {
      setMcpServers(r.data.servers);
      if (r.data.errors.length > 0) {
        setDiscoverErr(t('attach.configErrors', { count: r.data.errors.length }));
      }
    } else {
      setDiscoverErr(r.error?.message ?? t('attach.loadMcpFailed'));
    }
  }

  async function loadSkills(): Promise<void> {
    if (!currentProjectPath) {
      setDiscoverErr(t('attach.openProjectForSkills'));
      setSub('skills');
      return;
    }
    if (!window.kodaxSpace) {
      setDiscoverErr(t('attach.loadSkillsFailed'));
      setSub('skills');
      return;
    }
    setSub('skills');
    setDiscoverErr(null);
    const [skillsResult, commandsResult] = await Promise.all([
      window.kodaxSpace.invoke('skill.discover', { projectRoot: currentProjectPath }),
      window.kodaxSpace.invoke('slash.discover', undefined),
    ]);
    setSlashCommands(commandsResult.ok ? commandsResult.data.commands : []);
    if (skillsResult.ok) {
      setSkills(skillsResult.data.skills);
    } else {
      setDiscoverErr(skillsResult.error?.message ?? t('attach.loadSkillsFailed'));
    }
  }

  if (sub === 'slash') {
    return (
      <SubMenuFrame title={t('attach.slashCommands')} onBack={() => setSub('root')}>
        {SLASH_COMMANDS.map((s) => (
          <button
            key={s.cmd}
            type="button"
            onClick={() => {
              onInsertText(s.cmd + ' ');
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-hover-bg flex items-center gap-2 text-xs"
          >
            <code className="text-ok font-mono">{s.cmd}</code>
            <span className="text-fg-muted truncate">{t(s.descKey)}</span>
          </button>
        ))}
        <div className="border-t border-border-default mt-1 pt-1 px-3 py-1 text-[11px] text-fg-muted">
          {t('attach.slashHint')}
        </div>
      </SubMenuFrame>
    );
  }

  if (sub === 'connectors') {
    if (partnerConnectorContent)
      return (
        <SubMenuFrame title={t('attach.connectors')} onBack={() => setSub('root')}>
          {partnerConnectorContent}
        </SubMenuFrame>
      );
    return (
      <SubMenuFrame title={t('attach.connectorsMcp')} onBack={() => setSub('root')}>
        {discoverErr && <div className="px-3 py-1 text-[11px] text-warn">{discoverErr}</div>}
        {mcpServers === null && !discoverErr && (
          <div className="px-3 py-1 text-[11px] text-fg-muted">{t('attach.loading')}</div>
        )}
        {mcpServers !== null && mcpServers.length === 0 && (
          <div className="px-3 py-1 text-[11px] text-fg-muted">{t('attach.noMcp')}</div>
        )}
        {mcpServers?.map((s) => (
          <div
            key={`${s.source}:${s.name}`}
            className="px-3 py-1.5 hover:bg-hover-bg text-xs flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-ok flex-shrink-0" aria-hidden />
            <span className="flex-1 truncate">{s.name}</span>
            <span className="text-[11px] text-fg-muted font-mono">{s.transport}</span>
            <span className="text-[11px] text-fg-faint">{s.source}</span>
          </div>
        ))}
      </SubMenuFrame>
    );
  }

  if (sub === 'skills') {
    return (
      <SubMenuFrame
        title={t('attach.skills')}
        onBack={initialSub === 'skills' ? onClose : () => setSub('root')}
      >
        {discoverErr && <div className="px-3 py-1 text-[11px] text-warn">{discoverErr}</div>}
        {skills === null && !discoverErr && (
          <div className="px-3 py-1 text-[11px] text-fg-muted">{t('attach.loading')}</div>
        )}
        {skills !== null && skills.length === 0 && (
          <div className="px-3 py-1 text-[11px] text-fg-muted">{t('attach.noSkills')}</div>
        )}
        {skills?.map((sk) => (
          <button
            key={`${sk.source}:${sk.name}`}
            type="button"
            onClick={() => {
              // Insert a skill trigger, falling back to /skill:name for command-name conflicts.
              onInsertText(skillSlashInsertText(sk.name, slashCommands));
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-hover-bg flex items-center gap-2 text-xs"
            title={`${sk.path} (${sk.source})`}
          >
            <code className="text-ok font-mono">{safeSkillSlashText(sk.name, slashCommands)}</code>
            <span className="text-fg-muted truncate flex-1">{sk.description}</span>
            <span className="text-[11px] text-fg-faint">{sk.source}</span>
          </button>
        ))}
      </SubMenuFrame>
    );
  }

  return (
    <div
      className="absolute left-0 bottom-full mb-1 w-60 bg-surface-4 border border-border-default rounded-lg shadow-xl py-1 text-xs z-50"
      onMouseLeave={onClose}
    >
      <AttachRow Icon={Paperclip} label={t('attach.addFiles')} onClick={() => addFiles()} />
      <AttachRow Icon={FolderPlus} label={t('attach.addFolder')} onClick={() => addFolder()} />
      <AttachRow
        Icon={Slash}
        label={t('attach.slashCommands')}
        onClick={() => setSub('slash')}
        chevron
      />
      <AttachRow
        Icon={Plug}
        label={t('attach.connectors')}
        onClick={() => (partnerConnectorContent ? setSub('connectors') : void loadConnectors())}
        chevron
      />
      <AttachRow
        Icon={Puzzle}
        label={t('attach.skills')}
        onClick={() => void loadSkills()}
        chevron
      />
      {onOpenPartnerExperts && (
        <AttachRow
          Icon={UserRound}
          label={t('attach.experts')}
          onClick={() => {
            onOpenPartnerExperts();
            onClose();
          }}
          chevron
        />
      )}
    </div>
  );
}

function SubMenuFrame({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="absolute left-0 bottom-full mb-1 w-72 bg-surface-4 border border-border-default rounded-lg shadow-xl py-1 z-50 max-h-80 overflow-y-auto">
      <div className="px-3 py-1 text-[11px] uppercase tracking-wider text-fg-muted flex items-center gap-2 sticky top-0 bg-surface-2">
        <button
          type="button"
          onClick={onBack}
          className="hover:text-fg-secondary inline-flex items-center"
          aria-label={t('attach.back')}
        >
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
        </button>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function AttachRow({
  Icon,
  label,
  onClick,
  disabled,
  chevron,
  hint,
}: {
  Icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  chevron?: boolean;
  hint?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
        disabled ? 'text-fg-faint cursor-not-allowed' : 'text-fg-secondary hover:bg-hover-bg'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden />
      <span className="flex-1">{label}</span>
      {chevron && <Caret open={false} className="text-fg-faint" />}
    </button>
  );
}
