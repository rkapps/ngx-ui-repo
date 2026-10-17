import { Component, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/** Stand-in for a page not built yet; title, icon and text come from the route's `data`. */
@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-white p-8 text-center">
      <lucide-icon [name]="icon()" [size]="32" class="text-primary-600" />
      <h1 class="text-lg font-semibold text-text">{{ title() }}</h1>
      <p class="max-w-md text-sm text-text-muted">{{ text() }}</p>
    </div>
  `,
})
export default class PlaceholderComponent {
  // Bound from route data (withComponentInputBinding).
  readonly title = input('');
  readonly icon = input('settings');
  readonly text = input('Coming soon.');
}
