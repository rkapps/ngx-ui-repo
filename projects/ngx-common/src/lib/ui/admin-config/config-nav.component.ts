import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { trackActiveSection } from '../admin-page/section-memory';
import { CONFIG_SECTION_KEY, CONFIG_SECTIONS } from './config-sections';

/** Config sidebar (left panel) — one option per Config sub route. Remembers the selection. */
@Component({
  selector: 'app-config-nav',
  standalone: true,
  imports: [LucideAngularModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="flex flex-col gap-1" aria-label="Config options">
      @for (section of sections; track section.path) {
        <a
          [routerLink]="['..', section.path]"
          routerLinkActive="bg-primary-50 !text-primary-700 !font-semibold"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        >
          <lucide-icon [name]="section.icon" [size]="16" aria-hidden="true" />
          {{ section.label }}
        </a>
      }
    </nav>
  `,
})
export class ConfigNavComponent {
  protected readonly sections = CONFIG_SECTIONS;

  constructor() {
    trackActiveSection(CONFIG_SECTION_KEY, CONFIG_SECTIONS);
  }
}
