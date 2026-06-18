import { Component, input, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { MarkdownPipe } from '../chat/markdown.pipe';
import { Section, StructuredResponse, TableCell } from './message-renderer.types';
import { ContextSectionComponent } from './sections/context-section.component';
import { MetricCardsSectionComponent } from './sections/metric-cards-section.component';
import { BarChartSectionComponent } from './sections/bar-chart-section.component';
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
        TableSectionComponent,
        InsightCardsSectionComponent,
        EconomicSignalsSectionComponent,
        ConsumerBuzzSectionComponent,
    ],
    templateUrl: './message-renderer.component.html',
})
export class MessageRendererComponent {
    content = input.required<string>();

    protected readonly copiedIndex = signal<number | null>(null);

    protected copySection(index: number, section: unknown): void {
        const text = this.formatSection(section as Section);
        navigator.clipboard.writeText(text).then(() => {
            this.copiedIndex.set(index);
            setTimeout(() => this.copiedIndex.set(null), 2000);
        });
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

    get parsed(): StructuredResponse | null {
        let raw = this.content().trim();
        if (raw.startsWith('```')) {
            raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }
        if (!raw.startsWith('{')) return null;
        try {
            const obj = JSON.parse(raw);
            return Array.isArray(obj?.sections) ? obj : null;
        } catch {
            return null;
        }
    }
}
