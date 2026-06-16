import { Component, input } from '@angular/core';
import { MarkdownPipe } from '../chat/markdown.pipe';
import { StructuredResponse } from './message-renderer.types';
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
