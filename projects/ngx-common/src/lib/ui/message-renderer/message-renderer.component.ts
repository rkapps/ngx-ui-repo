import { Component, input, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { MarkdownPipe } from '../chat/markdown.pipe';
import { Section, StructuredResponse, TableCell } from './message-renderer.types';
import { ContextSectionComponent } from './sections/context-section.component';
import { MetricCardsSectionComponent } from './sections/metric-cards-section.component';
import { BarChartSectionComponent } from './sections/bar-chart-section.component';
import { LineChartSectionComponent } from './sections/line-chart-section.component';
import { TableSectionComponent } from './sections/table-section.component';
import { InsightCardsSectionComponent } from './sections/insight-cards-section.component';
import { EconomicSignalsSectionComponent } from './sections/economic-signals-section.component';
import { ConsumerBuzzSectionComponent } from './sections/consumer-buzz-section.component';
import { PositioningSectionComponent } from './sections/positioning-section.component';
import { PriceTargetsSectionComponent } from './sections/price-targets-section.component';

@Component({
    selector: 'app-message-renderer',
    standalone: true,
    imports: [
        JsonPipe,
        LucideAngularModule,
        MarkdownPipe,
        ContextSectionComponent,
        MetricCardsSectionComponent,
        BarChartSectionComponent,
        LineChartSectionComponent,
        TableSectionComponent,
        InsightCardsSectionComponent,
        EconomicSignalsSectionComponent,
        ConsumerBuzzSectionComponent,
        PositioningSectionComponent,
        PriceTargetsSectionComponent,
    ],
    templateUrl: './message-renderer.component.html',
})
export class MessageRendererComponent {
    content = input.required<string>();

    protected readonly copiedSection = signal<unknown>(null);

    protected copySection(section: unknown): void {
        const text = this.formatSection(section as Section);
        navigator.clipboard.writeText(text).then(() => {
            this.copiedSection.set(section);
            setTimeout(() => this.copiedSection.set(null), 2000);
        });
    }

    protected rowGridClass(row: { sections: Section[]; paired: boolean }): string {
        if (!row.paired) return '';
        if (row.sections.length === 2) {
            // Give insight_cards more width than a single paired sibling — it holds denser, more valuable content.
            const insightIdx = row.sections.findIndex(s => s.type === 'insight_cards');
            if (insightIdx !== -1) {
                const cols = insightIdx === 0 ? 'md:grid-cols-[2fr_1fr]' : 'md:grid-cols-[1fr_2fr]';
                return `grid grid-cols-1 ${cols} gap-4 items-start`;
            }
        }
        // price_targets is a narrow list — cap its width instead of flexing with the row (whatever
        // count that row has), and let the rest of the sections share the remaining space evenly.
        const targetsIdx = row.sections.findIndex(s => s.type === 'price_targets');
        if (targetsIdx !== -1) {
            const cols = this.priceTargetsCols(targetsIdx, row.sections.length);
            if (cols) return `grid grid-cols-1 ${cols} gap-4 items-start`;
        }
        const cols = row.sections.length >= 3 ? 'md:grid-cols-2 2xl:grid-cols-3' : 'md:grid-cols-2';
        return `grid grid-cols-1 ${cols} gap-4 items-start`;
    }

    // Enumerate complete class strings (rather than building the arbitrary value at runtime) so
    // Tailwind's JIT scanner — which only recognizes literal occurrences in source — includes them.
    private priceTargetsCols(idx: number, len: number): string {
        const templates: Record<string, string> = {
            '2:0': 'md:grid-cols-[minmax(0,25rem)_1fr]',
            '2:1': 'md:grid-cols-[1fr_minmax(0,25rem)]',
            '3:0': 'md:grid-cols-[minmax(0,25rem)_1fr_1fr]',
            '3:1': 'md:grid-cols-[1fr_minmax(0,25rem)_1fr]',
            '3:2': 'md:grid-cols-[1fr_1fr_minmax(0,25rem)]',
            '4:0': 'md:grid-cols-[minmax(0,25rem)_1fr_1fr_1fr]',
            '4:1': 'md:grid-cols-[1fr_minmax(0,25rem)_1fr_1fr]',
            '4:2': 'md:grid-cols-[1fr_1fr_minmax(0,25rem)_1fr]',
            '4:3': 'md:grid-cols-[1fr_1fr_1fr_minmax(0,25rem)]',
        };
        return templates[`${len}:${idx}`] ?? '';
    }

    get groupedRows(): Array<{ sections: Section[]; paired: boolean }> {
        const p = this.parsed;
        if (!p) return [];
        const rows: Array<{ sections: Section[]; paired: boolean }> = [];
        const secs = p.sections;
        let i = 0;
        while (i < secs.length) {
            const s = secs[i] as Section & { group?: string };
            const g = s.group || '';
            const group: Section[] = [s];
            if (g) {
                while (i + group.length < secs.length) {
                    const next = secs[i + group.length] as Section & { group?: string };
                    if ((next.group || '') === g) group.push(next);
                    else break;
                }
            }
            rows.push({ sections: this.orderPairedGroup(group), paired: group.length > 1 });
            i += group.length;
        }
        return rows;
    }

    // insight_cards always lands on the left (wider) side; price_targets always lands on the right.
    private orderPairedGroup(group: Section[]): Section[] {
        if (group.length !== 2) return group;
        const insightIdx = group.findIndex(s => s.type === 'insight_cards');
        if (insightIdx === 1) return [group[1], group[0]];
        const targetsIdx = group.findIndex(s => s.type === 'price_targets');
        if (targetsIdx === 0) return [group[1], group[0]];
        return group;
    }

    private formatSection(section: Section): string {
        const lines: string[] = [];
        if (section.title) lines.push(section.title, '');

        switch (section.type) {
            case 'context':
                lines.push(section.content);
                break;
            case 'metric_cards':
                for (const card of section.data ?? []) {
                    const bench = card.benchmark ? ` (vs ${card.benchmark})` : '';
                    lines.push(`${card.label}: ${card.value}${bench}`);
                }
                break;
            case 'bar_chart':
            case 'line_chart':
            case 'chart':
                for (const item of section.data ?? []) {
                    if (item.values?.length) {
                        const vals = (section.groups ?? []).map((g, i) => `${g}: ${item.values![i]}`).join(', ');
                        lines.push(`${item.name} — ${vals}`);
                    } else {
                        lines.push(`${item.name}: ${item.value}`);
                    }
                }
                break;
            case 'table':
            case 'technicals': {
                const headers = section.headers ?? [];
                const toCsv = (val: string) => val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val;
                if (headers.length) lines.push(headers.map(toCsv).join(','));
                for (const row of section.rows ?? []) {
                    const cells = Array.isArray(row) ? row : Object.values(row);
                    lines.push(cells.map((c: unknown) => {
                        const val = (c && typeof c === 'object' && 'value' in c) ? (c as TableCell).value : String(c ?? '');
                        return toCsv(val);
                    }).join(','));
                }
                break;
            }
            case 'positioning':
                for (const item of section.data ?? []) {
                    lines.push(item.symbol);
                    for (const theme of item.themes ?? []) {
                        lines.push(`  ${theme.label}: ${theme.value}`);
                    }
                }
                break;
            case 'price_targets':
                for (const item of section.data ?? []) {
                    const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v)); return isNaN(n) ? 0 : n; };
                    const upside = num(item.upside);
                    const sign = upside >= 0 ? '+' : '';
                    lines.push(`${item.symbol}: $${num(item.current).toFixed(2)} -> $${num(item.target).toFixed(2)} (${sign}${upside.toFixed(1)}%)${item.consensus ? ` — ${item.consensus}` : ''}`);
                }
                break;
            case 'insight_cards':
                for (const card of section.data ?? []) {
                    lines.push(`${card.number}. ${card.title}`);
                    lines.push(`   ${card.evidence}`);
                    if (card.source) lines.push(`   Source: ${card.source}`);
                    lines.push('');
                }
                break;
            case 'economic_signals':
                for (const item of section.data ?? []) {
                    const meta = [item.date, item.source].filter(Boolean).join(', ');
                    lines.push(`${item.label}: ${item.value}${meta ? ` (${meta})` : ''}`);
                }
                break;
            case 'consumer_buzz':
                for (const item of section.sentiment ?? []) {
                    lines.push(`${item.source}: ${item.rating}${item.theme ? ` — ${item.theme}` : ''}`);
                }
                if (section.related_searches?.length) {
                    lines.push('', 'Related: ' + section.related_searches.join(', '));
                }
                break;
        }
        return lines.join('\n');
    }

    get looksLikeJson(): boolean {
        const raw = this.content().trim();
        return raw.startsWith('{') || raw.startsWith('```');
    }

    private cleanJson(raw: string): string {
        return raw
            .replace(/:\s*--(?=[,\}\]\s\n])/g, ': null')   // object value: "key": --
            .replace(/\[\s*--/g, '[null')                   // first array element: [--
            .replace(/,\s*--/g, ', null');                  // subsequent array elements: , --
    }

    private extractPartialSections(raw: string): StructuredResponse | null {
        const arrStart = raw.indexOf('[', raw.indexOf('"sections"'));
        if (arrStart === -1) return null;
        const sections: unknown[] = [];
        let pos = arrStart + 1;
        while (pos < raw.length) {
            while (pos < raw.length && /[\s,]/.test(raw[pos])) pos++;
            if (pos >= raw.length || raw[pos] !== '{') break;
            let depth = 0, i = pos, inStr = false, esc = false;
            for (; i < raw.length; i++) {
                const c = raw[i];
                if (esc) { esc = false; continue; }
                if (c === '\\' && inStr) { esc = true; continue; }
                if (c === '"') { inStr = !inStr; continue; }
                if (inStr) continue;
                if (c === '{') depth++;
                else if (c === '}' && --depth === 0) {
                    try { sections.push(JSON.parse(raw.slice(pos, i + 1))); } catch { /* skip individual malformed section */ }
                    pos = i + 1;
                    break;
                }
            }
            if (depth > 0) break;
        }
        return sections.length ? { sections: sections as Section[] } : null;
    }

    get parsed(): StructuredResponse | null {
        let raw = this.content().trim();
        if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }
        if (!raw.startsWith('{')) return null;
        const cleaned = this.cleanJson(raw);
        try {
            const obj = JSON.parse(cleaned);
            return Array.isArray(obj?.sections) ? obj : null;
        } catch {
            // Full parse failed (truncated or residual syntax errors) — extract whatever sections are complete
            return this.extractPartialSections(cleaned);
        }
    }
}
