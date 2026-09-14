const stubs = new Map([
  ['FilesPanel', 'FilesPanel'],
  ['ArtifactPanel', 'ArtifactPanel'],
  ['FileViewer', 'FileViewer'],
  ['SourcesPanel', 'SourcesPanel'],
  ['PartnerContextRail', 'PartnerContextRail'],
  ['PartnerConversation', 'PartnerConversation'],
  ['PartnerEvidenceDetail', 'PartnerEvidenceDetail'],
  ['PartnerExpertDetails', 'PartnerExpertDetails'],
  ['PartnerConnectorDetails', 'PartnerConnectorDetails'],
  ['PartnerCollaborationPanel', 'PartnerCollaborationPanel'],
  ['PartnerSkillDetails', 'PartnerSkillDetails'],
]);

export async function resolve(specifier, context, nextResolve) {
  const exportName = [...stubs].find(([fileName]) =>
    new RegExp(`(?:/|\\./)${fileName}\\.(?:js|tsx)(?:\\?.*)?$`).test(specifier),
  )?.[1];
  if (exportName) {
    return {
      url: `data:text/javascript,export function ${exportName}(){return null}`,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
