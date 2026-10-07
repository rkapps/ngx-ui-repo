import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { map } from 'rxjs';
import { ThreePanelLayoutComponent } from '../three-panel-layout/three-panel-layout.component';
import { ADMIN_RIGHT_WIDTH } from '../admin-page/admin-layout';
import { AccessNavComponent } from './access-nav.component';
import { ACCESS_LAYOUT_KEY, ACCESS_SECTIONS } from './access-sections';

/**
 * Placeholder for Access options that aren't built yet (Resource Types, Grants).
 * Each will get its own component with its own middle/right panels; until then this renders
 * a stub for the section matching the route path.
 */
@Component({
  selector: 'app-access-stub',
  standalone: true,
  imports: [AccessNavComponent, LucideAngularModule, ThreePanelLayoutComponent],
  template: `
    <app-three-panel-layout
      leftTitle="Access"
      rightTitle="Details"
      [storageKey]="layoutKey"
      [rightWidth]="rightWidth"
      panelMinHeight="min-h-[70vh]"
    >
      <app-access-nav left />

      <div middle class="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-white">
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
          <span class="text-sm font-semibold text-primary-600">{{ section()?.label }}</span>
        </div>
        <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <lucide-icon [name]="section()?.icon ?? 'boxes'" [size]="28" class="text-text-muted" />
          <p class="text-sm text-text-muted">{{ section()?.label }} management coming soon.</p>
        </div>
      </div>

      <div right class="p-4 text-sm text-text-muted">Nothing selected.</div>
    </app-three-panel-layout>
  `,
})
export class AccessStubComponent {
  protected readonly layoutKey = ACCESS_LAYOUT_KEY;
  protected readonly rightWidth = ADMIN_RIGHT_WIDTH;

  private readonly path = toSignal(inject(ActivatedRoute).url.pipe(map(segments => segments[0]?.path)));
  protected readonly section = computed(() => ACCESS_SECTIONS.find(s => s.path === this.path()));
}
