import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

@Component({
  selector: 'twang-datepicker',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './twang-datepicker.html',
  styleUrl: './twang-datepicker.css',
})
export class TwangDatepickerComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly placeholder = input('Select date');
  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly mode = signal<'day' | 'month' | 'year'>('day');
  protected readonly popoverStyle = signal<Record<string, string>>({});

  private readonly _today = new Date();
  protected readonly todayYear = this._today.getFullYear();
  protected readonly todayMonth = this._today.getMonth();
  protected readonly todayDay = this._today.getDate();

  protected readonly viewYear = signal(this.todayYear);
  protected readonly viewMonth = signal(this.todayMonth);
  protected readonly yearPageStart = signal(Math.floor(this.todayYear / 16) * 16);

  protected readonly monthAbbr = MONTH_ABBR;
  protected readonly dayLabels = DAY_LABELS;

  protected readonly displayValue = computed(() => {
    const v = this.value();
    if (!v) return '';
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d) return '';
    return `${MONTH_ABBR[m - 1]} ${d}, ${y}`;
  });

  protected readonly selectedParts = computed(() => {
    const v = this.value();
    if (!v) return null;
    const [y, m, d] = v.split('-').map(Number);
    if (!y || !m || !d) return null;
    return { year: y, month: m - 1, day: d };
  });

  protected readonly headerLabel = computed(() =>
    `${MONTH_NAMES[this.viewMonth()]} ${this.viewYear()}`
  );

  protected readonly yearRange = computed(() =>
    Array.from({ length: 16 }, (_, i) => this.yearPageStart() + i)
  );

  protected readonly dayGrid = computed((): (number | null)[] => {
    const year = this.viewYear();
    const month = this.viewMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    if (!this.host.nativeElement.contains(e.target as Node)) {
      this.close();
    }
  }

  protected toggleOpen(e: MouseEvent): void {
    e.stopPropagation();
    if (this.open()) {
      this.close();
    } else {
      const sel = this.selectedParts();
      if (sel) {
        this.viewYear.set(sel.year);
        this.viewMonth.set(sel.month);
        this.yearPageStart.set(Math.floor(sel.year / 16) * 16);
      }
      this.mode.set('day');
      const btn = this.host.nativeElement.querySelector('button') as HTMLElement;
      const rect = btn.getBoundingClientRect();
      const popoverWidth = 288; // w-72
      const left = rect.left + popoverWidth > window.innerWidth
        ? Math.max(0, rect.right - popoverWidth)
        : rect.left;
      this.popoverStyle.set({ top: `${rect.bottom + 6}px`, left: `${left}px` });
      this.open.set(true);
    }
  }

  protected clear(e: MouseEvent): void {
    e.stopPropagation();
    this.valueChange.emit('');
  }

  protected close(): void {
    this.open.set(false);
  }

  protected prevMonth(): void {
    let m = this.viewMonth() - 1;
    let y = this.viewYear();
    if (m < 0) { m = 11; y--; }
    this.viewMonth.set(m);
    this.viewYear.set(y);
  }

  protected nextMonth(): void {
    let m = this.viewMonth() + 1;
    let y = this.viewYear();
    if (m > 11) { m = 0; y++; }
    this.viewMonth.set(m);
    this.viewYear.set(y);
  }

  protected prevYear(): void { this.viewYear.update(y => y - 1); }
  protected nextYear(): void { this.viewYear.update(y => y + 1); }
  protected prevYearPage(): void { this.yearPageStart.update(s => s - 16); }
  protected nextYearPage(): void { this.yearPageStart.update(s => s + 16); }

  protected showMonthView(): void { this.mode.set('month'); }
  protected showYearView(): void { this.mode.set('year'); }

  protected selectDay(day: number): void {
    const y = this.viewYear();
    const m = this.viewMonth() + 1;
    const pad = (n: number) => String(n).padStart(2, '0');
    this.valueChange.emit(`${y}-${pad(m)}-${pad(day)}`);
    this.close();
  }

  protected selectMonth(monthIdx: number): void {
    this.viewMonth.set(monthIdx);
    this.mode.set('day');
  }

  protected selectYear(year: number): void {
    this.viewYear.set(year);
    this.yearPageStart.set(Math.floor(year / 16) * 16);
    this.mode.set('month');
  }

  protected isSelectedDay(day: number): boolean {
    const sel = this.selectedParts();
    return !!sel && sel.year === this.viewYear() && sel.month === this.viewMonth() && sel.day === day;
  }

  protected isToday(day: number): boolean {
    return this.todayYear === this.viewYear() && this.todayMonth === this.viewMonth() && this.todayDay === day;
  }

  protected dayClasses(day: number): string {
    if (this.isSelectedDay(day)) return 'bg-primary-600 text-white font-semibold';
    if (this.isToday(day)) return 'bg-primary-50 text-primary-700 font-semibold ring-1 ring-inset ring-primary-300';
    return 'text-text hover:bg-primary-50/70 hover:text-primary-700';
  }

  protected monthClasses(monthIdx: number): string {
    const sel = this.selectedParts();
    if (sel?.month === monthIdx && sel?.year === this.viewYear()) return 'bg-primary-600 text-white font-semibold';
    if (monthIdx === this.todayMonth && this.viewYear() === this.todayYear) return 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-300';
    return 'text-text hover:bg-primary-50/70 hover:text-primary-700';
  }

  protected yearClasses(year: number): string {
    const sel = this.selectedParts();
    if (sel?.year === year) return 'bg-primary-600 text-white font-semibold';
    if (year === this.todayYear) return 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-300';
    return 'text-text hover:bg-primary-50/70 hover:text-primary-700';
  }
}
