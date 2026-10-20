// Loaded inside the shared Host through its trusted Extension API.
export default function registerSpaceBuiltins(api) {
  return api.registerSkillPath('./builtin-skills');
}
