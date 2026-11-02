/** A factual Main refusal before any SDK input or Run is admitted. */
export class PartnerMethodUnavailableError extends Error {
  constructor() {
    super(
      'This Host cannot apply the expert default Skill. Use an explicit Skill or disable the default method.',
    );
    this.name = 'PartnerMethodUnavailableError';
  }
}
