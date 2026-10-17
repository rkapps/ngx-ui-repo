import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/** Placeholder until Analytics is built. */
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-white p-8 text-center">
      <lucide-icon name="chart-bar" [size]="32" class="text-primary-600" />
      <h1 class="text-lg font-semibold text-text">Analytics</h1>
      <p class="max-w-md text-sm text-text-muted">Usage and analytics will appear here.</p>
    </div>
  `,
})
export default class AnalyticsComponent {}
