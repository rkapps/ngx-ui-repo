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

/** `a/./b//c` → `a/b/c`; `..` steps up. Paths are relative to the picked folder. */
function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/**
 * Agent configs from a picked config folder (an `<input webkitdirectory>` file list), resolved the
 * way the backend's `load_agents_config` does at startup, with every path relative to the folder:
 * reads `agents.json` (at the folder root, else the shallowest one); `description` — a file's
 * contents if that file exists, else kept as written; `system_prompt` — must be a file, replaced by
 * its contents; a legacy `response_format_schema_path` — when set and the file exists, parsed into
 * `response_format_schema` (the path itself is dropped; agents only carry the inline schema).
 * Returns an error message instead when something can't be resolved.
 */
export async function resolveAgentsFolder(files: readonly File[]): Promise<AgentConfig[] | string> {
  // webkitRelativePath is "<picked folder>/<path inside it>"; key files by the path inside it.
  const byPath = new Map<string, File>();
  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    byPath.set(normalize(rel.split('/').slice(1).join('/') || rel), file);
  }

  const agentsPath =
    (byPath.has('agents.json') && 'agents.json') ||
    [...byPath.keys()].filter(p => p.split('/').pop() === 'agents.json').sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (!agentsPath) return 'No agents.json found in the folder.';

  const parsed = parseAgents(await byPath.get(agentsPath)!.text());
  if (typeof parsed === 'string') return `${agentsPath}: ${parsed}`;

  const read = (path: string) => {
    const file = path ? byPath.get(normalize(path)) : undefined;
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
      return `Agent "${agent.id}": system prompt file "${agent.system_prompt ?? ''}" was not found in the folder.`;
    }
    next.system_prompt = prompt;

    if (schemaPath) {
      const schema = await read(schemaPath);
      if (schema !== null) {
        try {
          next.response_format_schema = JSON.parse(schema);
        } catch {
          return `Agent "${agent.id}": response format schema "${schemaPath}" is not valid JSON.`;
        }
      }
    }
    resolved.push(next);
  }
  return resolved;
}
