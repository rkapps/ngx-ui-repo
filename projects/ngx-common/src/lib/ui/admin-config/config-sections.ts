import { type AdminSection, rememberedSectionRedirect } from '../admin-page/section-memory';

export const CONFIG_SECTIONS: readonly AdminSection[] = [
  { label: 'Agents', icon: 'bot', path: 'agents' },
  { label: 'Providers', icon: 'server', path: 'providers' },
];

export const CONFIG_SECTION_KEY = 'admin.config.section';

/** Shared by every Config page so the sidebar's collapsed/pinned state carries across options. */
export const CONFIG_LAYOUT_KEY = 'admin.config.layout';

export const configSectionRedirect = rememberedSectionRedirect(CONFIG_SECTION_KEY, CONFIG_SECTIONS);
