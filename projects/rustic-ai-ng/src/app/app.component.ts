import { Component, computed, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { AppShellComponent, ConversationService, LOGIN_CONFIG, type ShellNavItem, UserService } from 'ngx-common';

/** How many recent conversations the sidebar lists under Conversations. */
const RECENT_CONVERSATIONS = 5;

/** Agents / Providers pages under `base` (`/platform`, `/admin/config`). */
const configPages = (base: string): ShellNavItem[] => [
  { label: 'Agents', icon: 'bot', link: `${base}/agents` },
  { label: 'Providers', icon: 'server', link: `${base}/providers` },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AppShellComponent],
  template: `<app-shell [navItems]="navItems()" [error]="userService.loadError()" />`,
})
export class AppComponent {
  // Eagerly constructed so the backend user is fetched from /auth/user on login.
  protected readonly userService = inject(UserService);
  private readonly conversationService = inject(ConversationService);

  /** Conversations group: New, the most recently updated ones, then All. Its icon (collapsed sidebar) opens All. */
  private readonly conversationsNav = computed<ShellNavItem>(() => {
    const recent = [...this.conversationService.conversations()]
      .sort((a, b) => (b.last_updated_at ?? '').localeCompare(a.last_updated_at ?? ''))
      .slice(0, RECENT_CONVERSATIONS)
      .map(c => ({ label: c.title || 'Untitled', icon: 'message-circle', link: `/conversations/${c.id}` }));
    return {
      label: 'Conversations',
      icon: 'message-square',
      link: '/conversations',
      target: '/conversations',
      divider: true,
      children: [
        { label: 'New conversation', icon: 'message-square-plus', link: '/conversations/new' },
        ...recent,
        { label: 'All conversations', icon: 'list', link: '/conversations', exact: true },
      ],
    };
  });

  /** Admin for admins of the active tenant; Platform for super admins, always last. Each set off by a border. */
  /** None at all when the account failed to load (the shell shows the error instead). */
  protected readonly navItems = computed<readonly ShellNavItem[]>(() => {
    if (this.userService.loadError()) return [];
    const items: ShellNavItem[] = [
      { label: 'Home', icon: 'house', link: '/home' },
      this.conversationsNav(),
      // divider: the border below Conversations (Conversations sets the one above it).
      { label: 'Projects', icon: 'folder-open', link: '/projects', divider: true },
      {
        label: 'Analytics',
        icon: 'chart-bar',
        link: '/analytics',
        divider: true,
        children: [{ label: 'Logs', icon: 'scroll-text', link: '/analytics/logs' }],
      },
    ];
    if (this.userService.user()?.role === 'Admin') {
      items.push({
        label: 'Admin',
        icon: 'shield',
        link: '/admin',
        divider: true,
        children: [
          {
            label: 'Access',
            icon: 'lock',
            link: '/admin/access',
            children: [
              { label: 'Groups', icon: 'users', link: '/admin/access/groups' },
              { label: 'Invites', icon: 'mail', link: '/admin/access/invites' },
              { label: 'Users', icon: 'user', link: '/admin/access/users' },
            ],
          },
          {
            label: 'Config',
            icon: 'settings',
            link: '/admin/config',
            children: [...configPages('/admin/config'), { label: 'MCP Servers', icon: 'plug', link: '/admin/config/mcp-servers' }],
          },
        ],
      });
    }
    if (this.userService.isSuperAdmin()) {
      items.push({
        label: 'Platform',
        icon: 'layers',
        link: '/platform',
        divider: true,
        children: [
          ...configPages('/platform'),
          { label: 'MCP Servers', icon: 'plug', link: '/platform/mcp-servers' },
          { label: 'Chat Templates', icon: 'message-square-plus', link: '/platform/chat-templates' },
        ],
      });
    }
    return items;
  });

  constructor() {
    // Load the conversation list once the account is in, for the sidebar's recent conversations.
    // New/edited/deleted conversations update the same list (ConversationService keeps it).
    effect(() => {
      if (this.userService.user()) this.conversationService.getConversations().subscribe({ error: err => console.error('Failed to load conversations', err) });
    });

    const appName = inject(LOGIN_CONFIG).appName;
    if (appName) inject(Title).setTitle(appName);
  }
}
