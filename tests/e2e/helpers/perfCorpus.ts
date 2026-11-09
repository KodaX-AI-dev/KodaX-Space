import type { KodaXMessage } from '@kodax-ai/kodax/agent';

/**
 * Deterministic long-Session corpus for the F144 baseline. Mixed-height turns (short answers,
 * long Markdown with code and tables, thinking, bash/read/edit/grep tool rounds) plus optional
 * giant single assistant body and giant single tool turn. Every user question carries the
 * unique marker `PERF_Q_<turn>`; every final answer carries `PERF_A_<turn>`.
 */
export interface PerfCorpusOptions {
  readonly turns: number;
  readonly seed: number;
  /** Characters in one giant assistant Markdown body, placed at turn `giantAt`. */
  readonly giantBodyChars?: number;
  /** Tool calls in one giant assistant tool round, placed right after the giant body. */
  readonly giantToolCalls?: number;
  readonly giantAt?: number;
}

export const PERF_TURN_KINDS = ['short', 'markdown', 'thinking', 'tool'] as const;
export type PerfTurnKind = (typeof PERF_TURN_KINDS)[number];
const KIND_WEIGHTS: Readonly<Record<PerfTurnKind, number>> = {
  short: 4,
  markdown: 2,
  thinking: 2,
  tool: 2,
};
const TOOLS = ['bash', 'read', 'edit', 'grep'] as const;
const WORDS =
  'render anchor window page cursor revision history layout paint scroll viewport transcript session commit measure budget latency frame queue reader parse'.split(
    ' ',
  );

/** mulberry32: tiny, fast and stable across platforms. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function int(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function sentence(random: () => number): string {
  const words = Array.from({ length: int(random, 6, 16) }, () => WORDS[int(random, 0, 19)]!);
  return `${words.join(' ')}.`;
}

function paragraph(random: () => number): string {
  return Array.from({ length: int(random, 2, 5) }, () => sentence(random)).join(' ');
}

function pickKind(random: () => number): PerfTurnKind {
  const total = PERF_TURN_KINDS.reduce((sum, kind) => sum + KIND_WEIGHTS[kind], 0);
  let roll = random() * total;
  for (const kind of PERF_TURN_KINDS) {
    roll -= KIND_WEIGHTS[kind];
    if (roll < 0) return kind;
  }
  return 'short';
}

function markdownSection(random: () => number, label: string): string {
  const rows = Array.from(
    { length: int(random, 3, 10) },
    (_, row) => `| ${label}-${row} | ${int(random, 1, 999)} ms | ${WORDS[int(random, 0, 19)]} |`,
  );
  const code = Array.from(
    { length: int(random, 4, 14) },
    (_, line) => `  const value${line} = measure('${WORDS[int(random, 0, 19)]}', ${line});`,
  );
  return [
    `## ${label}`,
    paragraph(random),
    '```ts',
    `function ${label.replace(/\W/g, '_')}() {`,
    ...code,
    '}',
    '```',
    '| Step | Cost | Owner |',
    '| --- | ---: | --- |',
    ...rows,
    `- ${sentence(random)}`,
    `- ${sentence(random)}`,
  ].join('\n');
}

function toolCall(random: () => number, id: string, tool: (typeof TOOLS)[number]) {
  const file = `src/perf/${WORDS[int(random, 0, 19)]}-${int(random, 1, 99)}.ts`;
  const input =
    tool === 'bash'
      ? { command: `npm run check -- --filter ${WORDS[int(random, 0, 19)]}` }
      : tool === 'read'
        ? { path: file }
        : tool === 'edit'
          ? { path: file, old_string: sentence(random), new_string: sentence(random) }
          : { pattern: WORDS[int(random, 0, 19)]!, path: 'src' };
  const lines = Array.from({ length: int(random, 2, 24) }, (_, line) =>
    tool === 'grep' ? `${file}:${line + 1}: ${sentence(random)}` : sentence(random),
  );
  return {
    use: { type: 'tool_use' as const, id, name: tool, input },
    result: { type: 'tool_result' as const, tool_use_id: id, content: lines.join('\n') },
  };
}

function toolRound(
  random: () => number,
  turn: number,
  count: number,
  prefix = 'tool',
): KodaXMessage[] {
  const calls = Array.from({ length: count }, (_, call) =>
    toolCall(random, `${prefix}-${turn}-${call}`, TOOLS[int(random, 0, TOOLS.length - 1)]!),
  );
  return [
    {
      role: 'assistant',
      content: [{ type: 'text', text: sentence(random) }, ...calls.map((call) => call.use)],
    },
    { role: 'user', content: calls.map((call) => call.result) },
  ];
}

function answer(turn: number, body: string, thinking?: string): KodaXMessage {
  return {
    role: 'assistant',
    outputId: `perf-output-${turn}`,
    content: [
      ...(thinking !== undefined ? [{ type: 'thinking' as const, thinking }] : []),
      { type: 'text' as const, text: `PERF_A_${turn}\n\n${body}` },
    ],
  };
}

function normalTurn(random: () => number, turn: number, kind: PerfTurnKind): KodaXMessage[] {
  const question: KodaXMessage = {
    role: 'user',
    inputId: `perf-input-${turn}`,
    content: `PERF_Q_${turn} ${kind} ${sentence(random)}`,
  };
  switch (kind) {
    case 'short':
      return [question, answer(turn, sentence(random))];
    case 'markdown':
      return [
        question,
        answer(
          turn,
          Array.from({ length: int(random, 1, 3) }, (_, part) =>
            markdownSection(random, `section-${turn}-${part}`),
          ).join('\n\n'),
        ),
      ];
    case 'thinking':
      return [
        question,
        answer(
          turn,
          paragraph(random),
          Array.from({ length: int(random, 2, 8) }, () => paragraph(random)).join('\n\n'),
        ),
      ];
    case 'tool':
      return [
        question,
        ...toolRound(random, turn, int(random, 1, 4)),
        answer(turn, paragraph(random)),
      ];
  }
}

function giantBody(random: () => number, turn: number, chars: number): KodaXMessage[] {
  const sections: string[] = [];
  let length = 0;
  for (let part = 0; length < chars; part++) {
    const section = markdownSection(random, `giant-${part}`);
    sections.push(section);
    length += section.length + 2;
  }
  return [
    { role: 'user', inputId: `perf-input-${turn}`, content: `PERF_Q_${turn} giant-body` },
    answer(turn, `${sections.join('\n\n')}\n\nPERF_GIANT_BODY_END`),
  ];
}

function giantTool(random: () => number, turn: number, calls: number): KodaXMessage[] {
  return [
    { role: 'user', inputId: `perf-input-${turn}`, content: `PERF_Q_${turn} giant-tool` },
    ...toolRound(random, turn, calls, 'giant'),
    answer(turn, `PERF_GIANT_TOOL_END ${sentence(random)}`),
  ];
}

export function buildPerfCorpus(options: PerfCorpusOptions): KodaXMessage[] {
  const random = createRandom(options.seed);
  const giantAt = options.giantAt ?? Math.floor(options.turns / 2);
  const messages: KodaXMessage[] = [];
  for (let turn = 0; turn < options.turns; turn++) {
    if (turn === giantAt && options.giantBodyChars)
      messages.push(...giantBody(random, turn, options.giantBodyChars));
    else if (turn === giantAt + 1 && options.giantToolCalls)
      messages.push(...giantTool(random, turn, options.giantToolCalls));
    else messages.push(...normalTurn(random, turn, pickKind(random)));
  }
  return messages;
}
