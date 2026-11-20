// Find the file a slightly wrong link most likely means (an agent dropped a folder, added one, or
// lost the separator before the file name). Pure, so main and renderer share one rule.

function normalize(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function segments(p: string): readonly string[] {
  return p.split('/').filter(Boolean);
}

function commonTailLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}

/**
 * Candidates with the link's file name (or whose last folder + file name equal the link's last
 * segment, when the separator was dropped), ranked by how much of the path tail they share.
 * Returns every top-ranked candidate: callers open a single result and report a tie, never guess.
 */
export function bestFileNameMatches(
  linkPath: string,
  candidates: readonly string[],
): readonly string[] {
  const link = normalize(linkPath);
  const linkName = segments(link).at(-1) ?? '';
  const linkKey = link.replace(/\//g, '');
  let best = 0;
  let picks: string[] = [];
  for (const candidate of new Set(candidates)) {
    const parts = segments(normalize(candidate));
    const name = parts.at(-1) ?? '';
    const droppedSeparator = parts.length > 1 && `${parts.at(-2)}${name}` === linkName;
    if (!linkName || (name !== linkName && !droppedSeparator)) continue;
    const score = commonTailLength(linkKey, parts.join(''));
    if (score > best) {
      best = score;
      picks = [candidate];
    } else if (score === best) {
      picks.push(candidate);
    }
  }
  return picks;
}
