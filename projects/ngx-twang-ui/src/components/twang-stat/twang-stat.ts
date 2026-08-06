import { Component, input } from '@angular/core';

/** Small label/value block, e.g. for a row of KPI figures under a headline number. */
@Component({
  selector: 'twang-stat',
  standalone: true,
  templateUrl: './twang-stat.html',
})
export class TwangStatComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  /** Overrides the default value text color (e.g. `text-emerald-600` for a positive figure). */
  readonly valueClass = input('text-text');
}
