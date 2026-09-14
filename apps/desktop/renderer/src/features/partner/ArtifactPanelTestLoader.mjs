export async function resolve(specifier, context, nextResolve) {
  if (/(?:\/|\.\/)ArtifactsView\.(?:js|tsx)(?:\?.*)?$/.test(specifier)) {
    return {
      url: 'data:text/javascript,export function ArtifactsView(){return null}',
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
