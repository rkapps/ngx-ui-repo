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
        const cols = row.sections.length >= 3 ? 'md:grid-cols-2 3xl:grid-cols-3' : 'md:grid-cols-2';
        return `grid grid-cols-1 ${cols} gap-4 items-start`;
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
            rows.push({ sections: group, paired: group.length > 1 });
            i += group.length;
        }
        return rows;
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
                for (const item of section.data ?? []) {
                    if (item.values?.length) {
                        const vals = (section.groups ?? []).map((g, i) => `${g}: ${item.values![i]}`).join(', ');
                        lines.push(`${item.name} — ${vals}`);
                    } else {
                        lines.push(`${item.name}: ${item.value}`);
                    }
                }
                break;
            case 'line_chart':
                for (const item of section.data ?? []) {
                    if (item.values?.length) {
                        const vals = (section.groups ?? []).map((g, i) => `${g}: ${item.values![i]}`).join(', ');
                        lines.push(`${item.name} — ${vals}`);
                    } else {
                        lines.push(`${item.name}: ${item.value}`);
                    }
                }
                break;
            case 'table': {
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
