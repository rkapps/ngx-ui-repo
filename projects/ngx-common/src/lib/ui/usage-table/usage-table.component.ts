import { Component, DestroyRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DataService } from '../../services/data.services';
import { ConversationUsage, TurnUsage } from '../../models/usage';
import {
  TwangTreeTableComponent,
  type TwangTreeTableColumn,
  type TwangTreeTableNode,
  type TwangTableFooterCell,
} from 'ngx-twang-ui';
import { LucideAngularModule } from 'lucide-angular';

interface UsageRow {
    label?: string;
    convType?: string;
    llm?: string;
    model?: string;
    lastUpdatedAt?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
    executionTimeMs: number;
}

@Component({
    selector: 'app-usage-table',
    standalone: true,
    host: { class: 'flex flex-col flex-1 min-h-0 overflow-auto min-w-0' },
    imports: [TwangTreeTableComponent, LucideAngularModule],
    templateUrl: './usage-table.component.html',
})
export class UsageTableComponent {

    private dataService = inject(DataService);
    private destroyRef = inject(DestroyRef);

    filterType = input<string>('all');
    filterLlm = input<string>('all');
    filterStartDate = input<string>('');
    filterEndDate = input<string>('');
    /** Client-side only (the backend doesn't support it) — case-insensitive substring match on title. */
    filterTitle = input<string>('');
    /** When set, shows usage for that specific conversation only (ignores filter inputs). */
    conversationId = input<string | null>(null);

    treeNodes = signal<TwangTreeTableNode<UsageRow>[]>([]);
    filteredTreeNodes = computed<TwangTreeTableNode<UsageRow>[]>(() => {
        const query = this.filterTitle().toLowerCase();
        if (!query) return this.treeNodes();
        return this.treeNodes().filter(n => (n.label ?? '').toLowerCase().includes(query));
    });
    loading = signal(false);
    preservedCollapsed = signal<ReadonlySet<string> | null>(null);
    private loadedIds = new Set<string>();
    private previousCollapsed = new Set<string>();

    private readonly tree = viewChild<TwangTreeTableComponent<UsageRow>>('tree');
    allExpanded = signal(false);

    toggleExpandAll(): void {
        const tree = this.tree();
        if (!tree) return;
        if (this.allExpanded()) {
            tree.collapseAll();
            this.allExpanded.set(false);
        } else {
            tree.expandAll();
            this.allExpanded.set(true);
        }
    }

    readonly columns: TwangTreeTableColumn<UsageRow>[] = [
        {
            id: 'title',
            header: 'Conversation',
            isLabelColumn: true,
            value: r => r.label ?? '',
            fillRemaining: true,
            minWidth: '250px',
        },
        { id: 'convType', header: 'Type', value: r => r.convType ?? '', width: '80px' },
        { id: 'llm', header: 'LLM', value: r => r.llm ?? '', width: '100px' },
        {
            id: 'model', header: 'Model', value: r => r.model ?? '', width: '380px', cellTruncate: false,
            cellClass: 'whitespace-normal break-words',
        },
        {
            id: 'lastUpdatedAt', header: 'Last Update', value: r => r.lastUpdatedAt ?? '', sortable: true,
            format: v => {
                if (!v) return '';
                const d = new Date(v as string);
                const pad = (n: number) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            },
            width: '160px',
        },
        {
            id: 'inputTokens', header: 'In Tokens', value: r => r.inputTokens,
            format: v => Number(v).toLocaleString(), align: 'right', width: '100px',
        },
        {
            id: 'inputCost', header: 'In Cost', value: r => r.inputCost,
            format: v => '$' + Number(v).toFixed(4), align: 'right', width: '96px',
        },
        {
            id: 'outputTokens', header: 'Out Tokens', value: r => r.outputTokens,
            format: v => Number(v).toLocaleString(), align: 'right', width: '100px',
        },
        {
            id: 'outputCost', header: 'Out Cost', value: r => r.outputCost,
            format: v => '$' + Number(v).toFixed(4), align: 'right', width: '96px',
        },
        {
            id: 'totalTokens', header: 'Tokens', value: r => r.totalTokens, sortable: true,
            format: v => Number(v).toLocaleString(), align: 'right', width: '100px',
        },
        {
            id: 'totalCost', header: 'Cost', value: r => r.totalCost, sortable: true,
            format: v => '$' + Number(v).toFixed(4), align: 'right', width: '110px',
        },
        {
            id: 'executionTime', header: 'Time (s)', value: r => r.executionTimeMs, sortable: true,
            format: v => (Number(v) / 1000).toFixed(2) + 's', align: 'right', width: '120px',
        },
    ];

    footer = computed<TwangTableFooterCell[]>(() => {
        const nodes = this.filteredTreeNodes();
        const t = nodes.reduce((acc, n) => {
            const row = (n.summary ?? n.data) as UsageRow | null;
            if (!row) return acc;
            return {
                inputTokens: acc.inputTokens + row.inputTokens,
                outputTokens: acc.outputTokens + row.outputTokens,
                totalTokens: acc.totalTokens + row.totalTokens,
                inputCost: acc.inputCost + row.inputCost,
                outputCost: acc.outputCost + row.outputCost,
                totalCost: acc.totalCost + row.totalCost,
                executionTimeMs: acc.executionTimeMs + row.executionTimeMs,
            };
        }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, inputCost: 0, outputCost: 0, totalCost: 0, executionTimeMs: 0 });
        return [
            { text: `Total (${nodes.length})` },
            { text: '', width: '80px', minWidth: '80px' },
            { text: '', width: '100px', minWidth: '100px' },
            { text: '', width: '180px', minWidth: '180px' },
            { text: '', width: '160px', minWidth: '160px' },
            { text: t.inputTokens.toLocaleString(), align: 'right', width: '100px', minWidth: '100px' },
            { text: '$' + t.inputCost.toFixed(4), align: 'right', width: '96px', minWidth: '96px' },
            { text: t.outputTokens.toLocaleString(), align: 'right', width: '100px', minWidth: '100px' },
            { text: '$' + t.outputCost.toFixed(4), align: 'right', width: '96px', minWidth: '96px' },
            { text: t.totalTokens.toLocaleString(), align: 'right', width: '100px', minWidth: '100px' },
            { text: '$' + t.totalCost.toFixed(4), align: 'right', width: '80px', minWidth: '80px' },
            { text: (t.executionTimeMs / 1000).toFixed(2) + 's', align: 'right', width: '90px', minWidth: '90px' },
        ];
    });

    constructor() {
        effect(() => {
            // Track all filter inputs so the effect re-runs when any changes.
            const convId = this.conversationId();
            this.filterType();
            this.filterLlm();
            this.filterStartDate();
            this.filterEndDate();
            if (convId === '') return;
            // Call load() outside the reactive context so its internal signal
            // writes (loading.set, treeNodes.set, etc.) are not blocked.
            untracked(() => this.load());
        });
    }

    load() {
        this.loading.set(true);
        this.loadedIds.clear();
        this.previousCollapsed = new Set();
        this.preservedCollapsed.set(null);
        this.treeNodes.set([]);
        this.allExpanded.set(false);
        const convId = this.conversationId();

        if (convId) {
            this.loadSingleConversation(convId);
        } else {
            this.loadFiltered();
        }
    }

    onCollapsedChange(collapsed: ReadonlySet<string>): void {
        // Preserve collapsed state so treeNodes updates don't reset expand/collapse
        this.preservedCollapsed.set(collapsed);

        // Find nodes that were just expanded (present in previous collapsed, absent in new)
        for (const id of this.previousCollapsed) {
            if (!collapsed.has(id) && !id.startsWith('__sentinel__') && !this.loadedIds.has(id)) {
                this.loadedIds.add(id);
                this.dataService.getUsageTurns(id)
                    .pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe({
                        next: (turns) => {
                            const executionTimeMs = turns.reduce((sum, t) => sum + (t.execution_time_ms ?? 0), 0);
                            this.treeNodes.update(nodes =>
                                nodes.map(n => {
                                    if (n.id !== id) return n;
                                    return {
                                        ...n,
                                        summary: n.summary ? { ...n.summary, executionTimeMs } : n.summary,
                                        children: turns.map(t => this.buildTurnNode(t)),
                                    };
                                })
                            );
                        },
                    });
            }
        }
        this.previousCollapsed = new Set(collapsed);
    }

    private loadSingleConversation(convId: string) {
        this.dataService.getUsageConversations()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
                next: (convs) => {
                    const conv = convs.find(c => c.id === convId);
                    if (!conv) { this.treeNodes.set([]); this.loading.set(false); return; }
                    const nodes = [this.buildConvNode(conv)];
                    this.treeNodes.set(nodes);
                    this.seedPreviousCollapsed(nodes);
                    this.loading.set(false);
                },
                error: () => this.loading.set(false),
            });
    }

    private loadFiltered() {
        const type = this.filterType();
        const llm = this.filterLlm();
        this.dataService.getUsageConversations({
            conversationType: type === 'all' ? undefined : type,
            llm: llm === 'all' ? undefined : llm,
            startDate: this.filterStartDate() || undefined,
            endDate: this.filterEndDate() || undefined,
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
            next: (convs) => {
                const nodes = convs.map(c => this.buildConvNode(c));
                this.treeNodes.set(nodes);
                this.seedPreviousCollapsed(nodes);
                this.loading.set(false);
            },
            error: () => this.loading.set(false),
        });
    }

    private seedPreviousCollapsed(nodes: TwangTreeTableNode<UsageRow>[]): void {
        const collapsed = new Set<string>();
        const walk = (list: TwangTreeTableNode<UsageRow>[]) => {
            for (const node of list) {
                if (node.children?.length) {
                    collapsed.add(node.id);
                    walk(node.children);
                }
            }
        };
        walk(nodes);
        this.previousCollapsed = collapsed;
    }

    private buildConvNode(conv: ConversationUsage): TwangTreeTableNode<UsageRow> {
        const u = conv.usage;
        const totalTokens = u?.total_tokens ?? 0;
        const convRow: UsageRow = {
            label: conv.title,
            convType: conv.conversation_type,
            llm: conv.llm,
            model: conv.model,
            lastUpdatedAt: conv.created_at,
            inputTokens: (u?.input_tokens ?? 0) + (u?.cached_read_tokens ?? 0) + (u?.cached_write_tokens ?? 0),
            outputTokens: u?.output_tokens ?? 0,
            totalTokens,
            inputCost: (conv.input_tokens_cost ?? 0) + (conv.cached_read_tokens_cost ?? 0) + (conv.cached_write_tokens_cost ?? 0),
            outputCost: conv.output_tokens_cost ?? 0,
            totalCost: conv.total_tokens_cost ?? 0,
            executionTimeMs: 0,
        };
        if (totalTokens === 0) {
            return { id: conv.id, label: conv.title, depth: 0, data: convRow };
        }
        return {
            id: conv.id,
            label: conv.title,
            depth: 0,
            summary: convRow,
            children: [{ id: '__sentinel__' + conv.id, label: '', depth: 1, data: null as unknown as UsageRow }],
        };
    }

    private buildTurnNode(t: TurnUsage): TwangTreeTableNode<UsageRow> {
        const u = t.usage;
        const label = t.user_prompt ? `${t.sequence}. ${t.user_prompt}` : `Turn ${t.sequence}`;
        return {
            id: t.id,
            label,
            depth: 1,
            data: {
                label,
                lastUpdatedAt: t.created_at,
                inputTokens: (u?.input_tokens ?? 0) + (u?.cached_read_tokens ?? 0) + (u?.cached_write_tokens ?? 0),
                outputTokens: u?.output_tokens ?? 0,
                totalTokens: u?.total_tokens ?? 0,
                inputCost: (t.input_tokens_cost ?? 0) + (t.cached_read_tokens_cost ?? 0) + (t.cached_write_tokens_cost ?? 0),
                outputCost: t.output_tokens_cost ?? 0,
                totalCost: t.total_tokens_cost ?? 0,
                executionTimeMs: t.execution_time_ms ?? 0,
            },
        };
    }
}
