import { type AdminSection, rememberedSectionRedirect } from '../admin-page/section-memory';

export const CONFIG_SECTIONS: readonly AdminSection[] = [
  { label: 'Agents', icon: 'bot', path: 'agents' },
  { label: 'Providers', icon: 'server', path: 'providers' },
];

export const CONFIG_SECTION_KEY = 'admin.config.section';

/** Shared by every Config page so the sidebar's collapsed/pinned state carries across options. */
export const CONFIG_LAYOUT_KEY = 'admin.config.layout';

const CURRENT_AGENT_KEY = 'admin.config.agents.current';

/** Remembers the agent last selected, edited or tested, so the Agents table reopens on it. */
export function rememberCurrentAgent(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_AGENT_KEY, id);
  } catch {
    // storage unavailable — just not remembered
  }
}

export function currentAgent(): string | null {
  try {
    return localStorage.getItem(CURRENT_AGENT_KEY);
  } catch {
    return null;
  }
}

export const configSectionRedirect = rememberedSectionRedirect(CONFIG_SECTION_KEY, CONFIG_SECTIONS);
