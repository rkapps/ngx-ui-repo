import { type AdminSection, rememberedSectionRedirect } from '../admin-page/section-memory';

export const ACCESS_SECTIONS: readonly AdminSection[] = [
  { label: 'Users', icon: 'user', path: 'users' },
  { label: 'User Groups', icon: 'users', path: 'groups' },
  { label: 'Resource Types', icon: 'boxes', path: 'resource-types' },
  { label: 'Grants', icon: 'key-round', path: 'grants' },
];

export const ACCESS_SECTION_KEY = 'admin.access.section';

/** Shared by every Access page so the sidebar's collapsed/pinned state carries across options. */
export const ACCESS_LAYOUT_KEY = 'admin.access.layout';

export const accessSectionRedirect = rememberedSectionRedirect(ACCESS_SECTION_KEY, ACCESS_SECTIONS);
