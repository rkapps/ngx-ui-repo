import type { TwangTreeTableNode } from 'ngx-twang-ui';

/**
 * Turn execution trace — mirrors `rustic-agent`'s `TurnExecution` and friends
 * (`agents/domain/turn_response.rs`, `agent_response.rs`). Serde's default externally-tagged
 * enums, so a variant arrives as `{ "SingleAgent": {...} }`, `{ "Deterministic": {...} }`, etc.
 */

export interface TokenUsage {
  input_tokens: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
  tool_use_tokens: number;
  reasoning_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface AgentToolCall {
  id: string;
  name: string;
  input: unknown;
  output: unknown | null;
  error: string | null;
  duration_ms: number;
}

/** One model call within an iteration: the request, the generation, the stream drained. */
export interface LlmCall {
  model: string;
  duration_ms: number;
  /** Text the model produced (often empty when it only called tools). */
  content: string;
  response_id: string;
  usage: TokenUsage;
}

/**
 * The whole iteration: the LLM call plus the tools (parallel tools overlap). Older executions have
 * no `llm` and carry `usage`, `response_id` and `finish_reason` on the iteration itself.
 */
export interface AgentIteration {
  iteration: number;
  duration_ms: number;
  llm?: LlmCall | null;
  tool_calls: AgentToolCall[];
  usage?: TokenUsage;
  response_id?: string;
  finish_reason?: string;
}

/** An iteration's token usage: its LLM call's, or the iteration's own in older executions. */
export function iterationUsage(it: AgentIteration): TokenUsage | null {
  return it.llm?.usage ?? it.usage ?? null;
}

export interface AgentResponse {
  agent_id: string;
  model: string;
  iterations: AgentIteration[];
  response_id: string;
  content: string;
  usage: TokenUsage;
  duration_ms: number;
}

/** What a turn delivered beyond the screen, as the delivery agent decided (clamped to what's allowed). */
export interface Delivery {
  pdf: boolean;
  email: boolean;
}

export interface TurnResponse {
  agent_id: string;
  prompt: string;
  content: string;
  response_id: string | null;
  usage: TokenUsage;
  execution: TurnExecution;
  /** Absent in older executions and when the agent has no delivery config. */
  delivery?: Delivery | null;
  /** The delivery agent's own run, made once before the first stage or decision. */
  delivery_response?: TurnResponse | null;
}

/** "PDF + email", "PDF", or "Screen" for a turn's delivery. */
export function deliveryLabel(d: Delivery): string {
  return [d.pdf ? 'PDF' : '', d.email ? 'email' : ''].filter(Boolean).join(' + ') || 'Screen';
}

export interface StageResponse {
  name: string;
  responses: TurnResponse[];
  duration_ms: number;
}

export interface StageDecision {
  agents: { id: string; goal: string | null }[];
  execution: 'sequential' | 'parallel';
  stop: boolean;
  reasoning: string | null;
  /** What the user gets back; only meaningful when `stop` is true. Absent in older executions. */
  deliverable?: 'screen' | 'pdf';
}

/** One orchestrator decision cycle. Older executions have `duration_ms` and no orchestrator run or split timings. */
export interface DecisionResponse {
  iteration: number;
  decision: StageDecision;
  /** The orchestrator's own run for this decision (iterations, usage, content). */
  orchestrator?: AgentResponse | null;
  /** Time spent deciding. */
  decide_ms?: number;
  /** Time spent running the chosen sub-agents (0 when the decision was stop). */
  subs_ms?: number;
  responses: TurnResponse[];
  duration_ms?: number;
}

/** A decision's total time: deciding plus running its sub-agents (older executions: `duration_ms`). */
export function decisionMs(d: DecisionResponse): number {
  return d.duration_ms ?? (d.decide_ms ?? 0) + (d.subs_ms ?? 0);
}

export type TurnExecution =
  | { SingleAgent: { response: AgentResponse } }
  | { Deterministic: { stages: StageResponse[]; synthesizer: TurnResponse | null } }
  | { Dynamic: { decisions: DecisionResponse[]; synthesizer: TurnResponse | null } };

/**
 * Parses agent `content` that is JSON — bare, in a ```json fence, surrounded by prose, or encoded
 * as a JSON string (double-encoded). `undefined` when no object/array parses (render it as text, or
 * try `formatLooseJson`).
 */
export function parseJsonContent(text: string | null | undefined): unknown {
  if (!text) return undefined;
  const trimmed = text.trim();
  const candidates: string[] = [];
  // A ```json fence anywhere in the text (models often wrap it in prose).
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) candidates.push(fenced[1]);
  candidates.push(trimmed);
  // The outermost {...} or [...], ignoring text before/after it.
  const open = trimmed.search(/[{[]/);
  if (open >= 0) {
    const close = trimmed.lastIndexOf(trimmed[open] === '{' ? '}' : ']');
    if (close > open) candidates.push(trimmed.slice(open, close + 1));
  }
  for (const candidate of candidates) {
    const value = parseJsonObject(candidate.trim());
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Parses an object/array, unwrapping JSON that was encoded as a JSON string (once or twice). */
function parseJsonObject(body: string): unknown {
  if (!/^[{["]/.test(body)) return undefined;
  try {
    let value: unknown = JSON.parse(body);
    for (let i = 0; i < 2 && typeof value === 'string'; i++) {
      const inner = value.trim();
      if (!/^[{[]/.test(inner)) return undefined;
      value = JSON.parse(inner);
    }
    return typeof value === 'object' && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Best-effort indentation for JSON that does not parse (typically truncated output): breaks after
 * `{`, `[` and `,` and indents by nesting depth, leaving string contents untouched. Returns
 * undefined for text that does not look like JSON.
 */
export function formatLooseJson(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*(?:```)?$/);
  const body = (fenced ? fenced[1] : trimmed).trim();
  if (!/^[{[]/.test(body)) return undefined;
  const pad = (depth: number) => '\n' + '  '.repeat(Math.max(depth, 0));
  let out = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const ch of body) {
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (/\s/.test(ch)) continue;
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '{' || ch === '[') {
      out += ch + pad(++depth);
    } else if (ch === '}' || ch === ']') {
      out += pad(--depth) + ch;
    } else if (ch === ',') {
      out += ch + pad(depth);
    } else if (ch === ':') {
      out += ': ';
    } else {
      out += ch;
    }
  }
  // Empty containers: "{\n  }" -> "{}".
  return out.replace(/([{[])\s+([}\]])/g, '$1$2');
}

// ── Tree (for `twang-tree-table`) ───────────────────────────────────────────────────────────

/** An agent call: the `TurnResponse`, plus its `AgentResponse` when it ran as a single agent. */
export interface AgentStep {
  turn: TurnResponse;
  agent: AgentResponse | null;
}

/** A pipeline execution (the `Deterministic` / `Dynamic` variant), shown as its own tree level. */
export interface PipelineStep {
  mode: 'Deterministic' | 'Dynamic';
  /** Stages (deterministic) or orchestrator decisions (dynamic). */
  steps: number;
  synthesizer: TurnResponse | null;
}

/** One row of the execution tree, tagged by what it represents; `data` feeds the detail view. */
export type ExecRow = { label: string; meta: string; duration_ms: number | null; error: boolean } & (
  | { kind: 'turn' | 'agent' | 'synthesizer' | 'delivery' | 'orchestrator'; data: AgentStep }
  | { kind: 'stage'; data: StageResponse }
  | { kind: 'pipeline'; data: PipelineStep }
  | { kind: 'decision'; data: DecisionResponse }
  | { kind: 'iteration'; data: AgentIteration }
  | { kind: 'llm'; data: LlmCall }
  | { kind: 'tool'; data: AgentToolCall }
);

export type ExecNode = TwangTreeTableNode<ExecRow>;

/** Builds the tree for a whole turn, rooted at the turn's own response. */
export function buildTurnTree(turn: TurnResponse): ExecNode {
  return turnNode(turn, 'root', 0, 'turn');
}

function turnNode(turn: TurnResponse, id: string, depth: number, kind: 'turn' | 'agent' | 'synthesizer' | 'delivery' | 'orchestrator'): ExecNode {
  const ex = turn.execution;
  let children: ExecNode[] = [];
  let agent: AgentResponse | null = null;
  let meta = '';
  let duration: number | null = null;

  if (ex && 'SingleAgent' in ex) {
    // Fold the AgentResponse into this node: its iterations become the children directly.
    agent = ex.SingleAgent.response;
    children = agent.iterations.map((it, i) => iterationNode(it, `${id}/i${i}`, depth + 1));
    duration = sum(agent.iterations.map(it => it.duration_ms));
    meta = plural(agent.iterations.length, 'iteration');
  } else if (ex && ('Deterministic' in ex || 'Dynamic' in ex)) {
    // The pipeline variant gets its own level (Agent → Deterministic → stages + synthesizer).
    const pipeline = pipelineNode(ex, `${id}/p`, depth + 1);
    children = [pipeline];
    duration = rowOf(pipeline).duration_ms;
    meta = rowOf(pipeline).meta;
  }

  // The delivery agent ran first, so it leads the children.
  if (turn.delivery_response) {
    const delivery = turnNode(turn.delivery_response, `${id}/delivery`, depth + 1, 'delivery');
    children = [delivery, ...children];
    duration = (duration ?? 0) + (rowOf(delivery).duration_ms ?? 0);
  }
  if (turn.delivery) meta = [meta, deliveryLabel(turn.delivery)].filter(Boolean).join(' · ');

  // The orchestrator is the pipeline itself, so its row is just "Orchestrator" (the id is in its details).
  const prefix = { synthesizer: 'Synthesizer · ', delivery: 'Delivery · ' }[kind as string] ?? '';
  const label = kind === 'orchestrator' ? 'Orchestrator' : prefix + turn.agent_id;
  return node(id, depth, { kind, label, meta, duration_ms: duration, error: anyError(children), data: { turn, agent } }, children);
}

function pipelineNode(ex: TurnExecution, id: string, depth: number): ExecNode {
  let children: ExecNode[];
  let step: PipelineStep;
  if ('Deterministic' in ex) {
    const { stages, synthesizer } = ex.Deterministic;
    children = stages.map((s, i) => stageNode(s, `${id}/s${i}`, depth + 1));
    step = { mode: 'Deterministic', steps: stages.length, synthesizer };
  } else if ('Dynamic' in ex) {
    const { decisions, synthesizer } = ex.Dynamic;
    children = decisions.map((d, i) => decisionNode(d, `${id}/d${i}`, depth + 1));
    step = { mode: 'Dynamic', steps: decisions.length, synthesizer };
  } else {
    throw new Error('pipelineNode called for a non-pipeline execution');
  }
  if (step.synthesizer) children.push(turnNode(step.synthesizer, `${id}/synth`, depth + 1, 'synthesizer'));
  const meta = step.mode === 'Deterministic' ? plural(step.steps, 'stage') : plural(step.steps, 'decision');
  return node(
    id,
    depth,
    { kind: 'pipeline', label: step.mode, meta, duration_ms: sum(children.map(c => rowOf(c).duration_ms ?? 0)), error: anyError(children), data: step },
    children,
  );
}

function stageNode(stage: StageResponse, id: string, depth: number): ExecNode {
  const children = stage.responses.map((r, i) => turnNode(r, `${id}/r${i}`, depth + 1, 'agent'));
  return node(
    id,
    depth,
    { kind: 'stage', label: `Stage · ${stage.name}`, meta: plural(stage.responses.length, 'agent'), duration_ms: stage.duration_ms, error: anyError(children), data: stage },
    children,
  );
}

function decisionNode(decision: DecisionResponse, id: string, depth: number): ExecNode {
  const children = decision.responses.map((r, i) => turnNode(r, `${id}/r${i}`, depth + 1, 'agent'));
  // The orchestrator's run that made this decision comes first, as an agent step of its own.
  const o = decision.orchestrator;
  if (o) {
    const turn: TurnResponse = { agent_id: o.agent_id, prompt: '', content: o.content, response_id: o.response_id, usage: o.usage, execution: { SingleAgent: { response: o } } };
    children.unshift(turnNode(turn, `${id}/o`, depth + 1, 'orchestrator'));
  }
  const { execution, stop, deliverable } = decision.decision;
  const meta = [execution, stop ? 'stop' : '', stop ? deliverable ?? '' : ''].filter(Boolean).join(' · ');
  return node(
    id,
    depth,
    { kind: 'decision', label: `Decision ${decision.iteration}`, meta, duration_ms: decisionMs(decision), error: anyError(children), data: decision },
    children,
  );
}

function iterationNode(it: AgentIteration, id: string, depth: number): ExecNode {
  // Parallel tools overlap, so the iteration takes the LLM call plus its slowest tool — marked `*`.
  const slowest = it.tool_calls.reduce((best, t, i) => (t.duration_ms > (it.tool_calls[best]?.duration_ms ?? -1) ? i : best), -1);
  const children = it.tool_calls.map((t, i) =>
    node(
      `${id}/t${i}`,
      depth + 1,
      { kind: 'tool', label: i === slowest ? `${t.name} *` : t.name, meta: t.error ? 'error' : '', duration_ms: t.duration_ms, error: !!t.error, data: t },
      [],
    ),
  );
  // The model call comes before the tools it asked for.
  if (it.llm) {
    children.unshift(node(`${id}/llm`, depth + 1, { kind: 'llm', label: `LLM · ${it.llm.model}`, meta: '', duration_ms: it.llm.duration_ms, error: false, data: it.llm }, []));
  }
  const meta = it.tool_calls.length ? plural(it.tool_calls.length, 'tool') : 'response';
  return node(id, depth, { kind: 'iteration', label: `Iteration ${it.iteration}`, meta, duration_ms: it.duration_ms, error: anyError(children), data: it }, children);
}

/** Tree-table nodes carry their row as `summary` (has children) or `data` (leaf). */
function node(id: string, depth: number, row: ExecRow, children: ExecNode[]): ExecNode {
  return children.length ? { id, label: row.label, depth, summary: row, children } : { id, label: row.label, depth, data: row, children: [] };
}

export function rowOf(n: ExecNode): ExecRow {
  return (n.summary ?? n.data)!;
}

/** Depth-first lookup by id. */
export function findExecNode(n: ExecNode, id: string): ExecNode | null {
  if (n.id === id) return n;
  for (const child of n.children ?? []) {
    const hit = findExecNode(child, id);
    if (hit) return hit;
  }
  return null;
}

/** Nodes from the root down to the node with `id` (inclusive); empty when not found. */
export function execNodePath(n: ExecNode, id: string): ExecNode[] {
  if (n.id === id) return [n];
  for (const child of n.children ?? []) {
    const path = execNodePath(child, id);
    if (path.length) return [n, ...path];
  }
  return [];
}

function anyError(children: ExecNode[]): boolean {
  return children.some(c => rowOf(c).error);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + (b || 0), 0);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
