import { Copy, Download, FolderOpen, Maximize2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { revealPath } from '../../lib/openPath.js';
import { SidebarContextMenu, type SidebarContextMenuItem } from '../../shell/SidebarContextMenu.js';
import { copyArtifactPath, saveArtifactAs } from './artifactActions.js';

interface Props {
  readonly id: string;
  readonly version?: number;
  readonly title: string;
  readonly path?: string;
  readonly projectRoot: string | null;
  readonly x: number;
  readonly y: number;
  readonly onClose: () => void;
  readonly onOpenWindow?: () => void;
}

export function ArtifactActionsMenu(props: Props): JSX.Element {
  const { t } = useI18n();
  const select = (action: () => void): void => {
    props.onClose();
    action();
  };
  const items: SidebarContextMenuItem[] = [
    {
      id: 'save-as',
      label: t('artifact.saveAs'),
      icon: <Download size={14} />,
      onSelect: () =>
        select(() => {
          void saveArtifactAs(props.id, props.version);
        }),
    },
  ];
  if (props.path) {
    const path = props.path;
    items.push(
      {
        id: 'reveal',
        label: t('fileActions.revealInFileManager'),
        icon: <FolderOpen size={14} />,
        onSelect: () =>
          select(() => {
            void revealPath(path, props.projectRoot);
          }),
      },
      {
        id: 'copy-path',
        label: t('fileViewer.copyPath'),
        icon: <Copy size={14} />,
        onSelect: () =>
          select(() => {
            void copyArtifactPath(path);
          }),
      },
    );
  }
  if (props.onOpenWindow)
    items.push({
      id: 'open-window',
      label: t('conversation.openArtifactWindow'),
      icon: <Maximize2 size={14} />,
      onSelect: () => select(props.onOpenWindow!),
    });
  return (
    <SidebarContextMenu
      x={props.x}
      y={props.y}
      ariaLabel={props.title}
      groups={[items]}
      onClose={props.onClose}
      estimatedHeight={160}
    />
  );
}
