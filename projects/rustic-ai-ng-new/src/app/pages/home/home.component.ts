import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

/** Placeholder until Home is built. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-white p-8 text-center">
      <lucide-icon name="house" [size]="32" class="text-primary-600" />
      <h1 class="text-lg font-semibold text-text">Home</h1>
      <p class="max-w-md text-sm text-text-muted">Welcome. This is the new multi-tenant Rustic AI.</p>
    </div>
  `,
})
export default class HomeComponent {}
