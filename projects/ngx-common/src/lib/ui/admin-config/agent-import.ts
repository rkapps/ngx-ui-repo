import { type AgentConfig, EXECUTION_TYPE_LABELS } from '../../services/admin-config.service';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Agent configs from import JSON — the agents config file's `{ "agents": [...] }`, a JSON array, or a
 * single agent — or an error message. Only the shape the table needs is checked; the backend
 * validates the rest.
 */
export function parseAgents(text: string): AgentConfig[] | string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return 'The file is not valid JSON.';
  }
  const wrapped = isObject(json) && Array.isArray(json['agents']) ? json['agents'] : json;
  const list = Array.isArray(wrapped) ? wrapped : [wrapped];
  if (!list.length) return 'The file has no agents.';
  for (const [i, a] of list.entries()) {
    const where = `Agent ${i + 1}`;
    if (!isObject(a)) return `${where} is not an object.`;
    if (typeof a['id'] !== 'string' || !a['id']) return `${where} needs an "id".`;
    if (typeof a['name'] !== 'string') return `${where} (${a['id']}) needs a "name".`;
    if (typeof a['execution'] !== 'string' || !(a['execution'] in EXECUTION_TYPE_LABELS)) {
      return `${where} (${a['id']}) needs "execution": one of ${Object.keys(EXECUTION_TYPE_LABELS).join(', ')}.`;
    }
  }
  return list as AgentConfig[];
}

/** `a/./b//c` → `a/b/c`; `..` steps up. Null when `..` climbs above the picked folder. */
function normalize(path: string): string | null {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join('/');
}

/** Picked files keyed by their path inside the picked folder (webkitRelativePath is "<folder>/<path>"). */
function filesByPath(files: readonly File[]): Map<string, File> {
  const byPath = new Map<string, File>();
  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const key = normalize(rel.split('/').slice(1).join('/') || rel);
    if (key) byPath.set(key, file);
  }
  return byPath;
}

/** Every `agents.json` in a picked folder, as paths inside it (e.g. `project/agents.json`), sorted. */
export function agentsFilesIn(files: readonly File[] | ReadonlyMap<string, File>): string[] {
  const paths = Array.isArray(files) ? [...filesByPath(files as readonly File[]).keys()] : [...(files as ReadonlyMap<string, File>).keys()];
  return paths.filter(p => p.split('/').pop() === 'agents.json').sort();
}

/**
 * Agent configs from a picked folder (an `<input webkitdirectory>` file list), resolved the way the
 * backend's `load_agents_config` does at startup. The `agents.json` files listed in `only` are
 * imported (all of them when omitted) — a folder of packages, each with its own; each one's paths are relative to the folder holding it, and
 * may use `..` to reach a sibling package such as `common`. `description` — a file's contents if that
 * file exists, else kept as written; `system_prompt` — must be a file, replaced by its contents; a
 * legacy `response_format_schema_path` — when set, must be a file, parsed into
 * `response_format_schema` (the path itself is dropped; agents only carry the inline schema).
 * Returns an error message instead when something can't be resolved, or two files share an agent id.
 */
export async function resolveAgentsFolder(files: readonly File[], only?: readonly string[]): Promise<AgentConfig[] | string> {
  const byPath = filesByPath(files);
  const agentsFiles = agentsFilesIn(byPath).filter(p => !only || only.includes(p));
  if (!agentsFiles.length) return 'No agents.json found in the folder.';

  const resolved: AgentConfig[] = [];
  const sourceOf = new Map<string, string>();
  for (const agentsPath of agentsFiles) {
    const result = await resolveAgentsFile(agentsPath, byPath);
    if (typeof result === 'string') return result;
    for (const agent of result) {
      const other = sourceOf.get(agent.id);
      if (other) return `Agent "${agent.id}" is in both ${other} and ${agentsPath}.`;
      sourceOf.set(agent.id, agentsPath);
      resolved.push(agent);
    }
  }
  return resolved;
}

/** One `agents.json`, its paths resolved against the folder that holds it. */
async function resolveAgentsFile(agentsPath: string, byPath: ReadonlyMap<string, File>): Promise<AgentConfig[] | string> {
  const parsed = parseAgents(await byPath.get(agentsPath)!.text());
  if (typeof parsed === 'string') return `${agentsPath}: ${parsed}`;

  const dir = agentsPath.includes('/') ? agentsPath.slice(0, agentsPath.lastIndexOf('/')) : '';
  const read = (path: string) => {
    const key = path ? normalize(dir ? `${dir}/${path}` : path) : null;
    const file = key ? byPath.get(key) : undefined;
    return file ? file.text() : Promise.resolve(null);
  };

  const resolved: AgentConfig[] = [];
  for (const agent of parsed) {
    const { response_format_schema_path: schemaPath, ...rest } = agent as AgentConfig & { response_format_schema_path?: string };
    const next: AgentConfig = rest;

    const description = await read(agent.description ?? '');
    if (description !== null) next.description = description;

    const prompt = await read(agent.system_prompt ?? '');
    if (prompt === null) {
      return `${agentsPath}: agent "${agent.id}": system prompt file "${agent.system_prompt ?? ''}" was not found.`;
    }
    next.system_prompt = prompt;

    if (schemaPath) {
      const schema = await read(schemaPath);
      if (schema === null) {
        return `${agentsPath}: agent "${agent.id}": response format schema file "${schemaPath}" was not found.`;
      }
      try {
        next.response_format_schema = JSON.parse(schema);
      } catch {
        return `${agentsPath}: agent "${agent.id}": response format schema "${schemaPath}" is not valid JSON.`;
      }
    }
    resolved.push(next);
  }
  return resolved;
}
