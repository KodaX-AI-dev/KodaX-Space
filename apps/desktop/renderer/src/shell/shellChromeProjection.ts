import type { Surface } from '@kodax-space/space-ipc-schema';

export interface ShellChromeProjection {
  readonly showWorkflowNavigation: boolean;
  readonly showFutureFeatures: boolean;
  readonly showLocalEnvironment: boolean;
  readonly showPlaceholderBranch: boolean;
  readonly showProjectSwitcher: boolean;
  readonly showRepositoryIntelligence: boolean;
}

export function projectShellChrome(surface: Surface): ShellChromeProjection {
  const showCoderChrome = surface === 'code';
  return {
    showWorkflowNavigation: showCoderChrome,
    showFutureFeatures: showCoderChrome,
    showLocalEnvironment: showCoderChrome,
    showPlaceholderBranch: showCoderChrome,
    showProjectSwitcher: true,
    showRepositoryIntelligence: showCoderChrome,
  };
}
