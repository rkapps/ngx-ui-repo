function cleanJson(raw: string): string {
  return raw
    .replace(/:\s*--(?=[,\}\]\s\n])/g, ': null')   // object value: "key": --
    .replace(/\[\s*--/g, '[null')                   // first array element: [--
    .replace(/,\s*--/g, ', null');                  // subsequent array elements: , --
}

/**
 * While a `{ "sections": [...] }` payload is still streaming in, extract and re-serialize
 * only the sections that have finished arriving (plus any complete section groups), so
 * partial/malformed trailing JSON never reaches the renderer.
 */
export function extractCompleteSections(raw: string): string | null {
  const sectionsIdx = raw.indexOf('"sections"');
  if (sectionsIdx === -1) return null;
  const arrStart = raw.indexOf('[', sectionsIdx);
  if (arrStart === -1) return null;

  const sections: unknown[] = [];
  let pos = arrStart + 1;

  while (pos < raw.length) {
    while (pos < raw.length && /[\s,]/.test(raw[pos])) pos++;
    if (pos >= raw.length || raw[pos] !== '{') break;

    let depth = 0, i = pos, inStr = false, esc = false;
    for (; i < raw.length; i++) {
      const c = raw[i];
      if (esc) { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { sections.push(JSON.parse(cleanJson(raw.slice(pos, i + 1)))); } catch { /* skip malformed */ }
        pos = i + 1;
        break;
      }
    }
    if (depth > 0) break; // section not yet complete — stop
  }

  if (!sections.length) return null;

  // Buffer the last group: hold back any trailing sections that share the same group
  // name, since more sections with that group may still be streaming in.
  type WithGroup = { group?: string };
  const lastGroup = (sections[sections.length - 1] as WithGroup).group;
  if (lastGroup) {
    let groupStart = sections.length - 1;
    while (groupStart > 0 && (sections[groupStart - 1] as WithGroup).group === lastGroup) {
      groupStart--;
    }
    const display = sections.slice(0, groupStart);
    return display.length ? JSON.stringify({ sections: display }) : null;
  }

  return JSON.stringify({ sections });
}

/** Pulls the `suggested_prompts` section's prompt list out of a (possibly markdown-fenced) structured response. */
export function extractSuggestedPrompts(content: string): string[] {
  if (!content) return [];
  let raw = content.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return [];
  raw = raw.slice(jsonStart);
  try {
    const obj = JSON.parse(cleanJson(raw));
    if (Array.isArray(obj?.sections)) {
      const section = obj.sections.find((s: { type: string }) => s.type === 'suggested_prompts');
      const list = section?.prompts ?? section?.prompt ?? section?.suggested_prompts;
      if (Array.isArray(list) && list.length) return list;
    }
    // Top-level suggested_prompts object
    if (obj?.type === 'suggested_prompts') {
      const list = obj.prompts ?? obj.prompt ?? obj.suggested_prompts;
      if (Array.isArray(list)) return list;
    }
    return [];
  } catch {
    return [];
  }
}

/** True when `content` looks like a structured `{ "sections": [...] }` JSON payload (optionally markdown-fenced). */
export function looksLikeSectionsJson(content: string): boolean {
  const trimmed = content.trimStart();
  return trimmed.startsWith('{') || /^```json\s*\{/s.test(trimmed);
}
