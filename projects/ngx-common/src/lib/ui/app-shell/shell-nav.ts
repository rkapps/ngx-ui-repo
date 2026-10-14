/**
 * One entry in the app shell's sidebar. `link` is an absolute route, e.g. `/home`. An entry with
 * `children` is a group (e.g. Platform › Agents, Providers): its `link` is the common prefix
 * (`/platform`) and the children are the pages. A child may itself have children — a sub-group
 * shown as a heading over its pages (Admin › Config › Agents, Providers).
 */
export interface ShellNavItem {
  label: string;
  /** Lucide icon name (must be registered by the app). */
  icon: string;
  link: string;
  children?: readonly ShellNavItem[];
  /** Draw a border above this item, separating it from the ones before. */
  divider?: boolean;
  /** Active only on exactly `link`, not its sub-routes (e.g. an "All conversations" item). */
  exact?: boolean;
  /** For a group: the page it opens from the icon-only sidebar and its breadcrumb (default: its first page). */
  target?: string;
}

const within = (path: string, link: string) => path === link || path.startsWith(link + '/');
const matches = (path: string, item: ShellNavItem) => (item.exact ? path === item.link : within(path, item.link));

/** The top-level nav item whose route contains `url` (`/conversations/123` → Conversations). */
export function activeShellNavItem(items: readonly ShellNavItem[], url: string): ShellNavItem | undefined {
  const path = url.split(/[?#]/)[0];
  return items.find(item => within(path, item.link));
}

/** Within a group, the child whose route contains `url` (`/platform/agents` → Agents). */
export function activeShellNavChild(item: ShellNavItem | undefined, url: string): ShellNavItem | undefined {
  const path = url.split(/[?#]/)[0];
  return item?.children?.find(child => matches(path, child));
}

/** Items from the top level down to the deepest one containing `url` (`/admin/config/agents` → Admin, Config, Agents). */
export function activeShellNavPath(items: readonly ShellNavItem[], url: string): ShellNavItem[] {
  const path: ShellNavItem[] = [];
  let item = activeShellNavItem(items, url);
  while (item) {
    path.push(item);
    item = activeShellNavChild(item, url);
  }
  return path;
}

/** The page an item opens: its own link, or for a group its `target`, else its first page (depth-first). */
export function shellNavTarget(item: ShellNavItem): string {
  if (item.target) return item.target;
  const first = item.children?.[0];
  return first ? shellNavTarget(first) : item.link;
}
