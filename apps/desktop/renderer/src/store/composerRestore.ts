/** Text taken back from the queue fills an empty composer and never overwrites a draft. */
export function mergeRestoredDraft(current: string, restored: string): string {
  return current.trim() === '' ? restored : `${current}\n\n${restored}`;
}
