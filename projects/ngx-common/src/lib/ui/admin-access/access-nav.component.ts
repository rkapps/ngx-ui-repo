import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { trackActiveSection } from '../admin-page/section-memory';
import { ACCESS_SECTION_KEY, ACCESS_SECTIONS } from './access-sections';

/** Access sidebar (left panel) — one option per Access sub route. Remembers the selection. */
@Component({
  selector: 'app-access-nav',
  standalone: true,
  imports: [LucideAngularModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="flex flex-col gap-1" aria-label="Access options">
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
export class AccessNavComponent {
  protected readonly sections = ACCESS_SECTIONS;

  constructor() {
    trackActiveSection(ACCESS_SECTION_KEY, ACCESS_SECTIONS);
  }
}
