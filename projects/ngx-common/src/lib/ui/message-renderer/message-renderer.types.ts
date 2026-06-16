export type Signal = 'up' | 'down' | 'neutral';

export interface ContextSection       { type: 'context';       title?: string; content: string; }
export interface MetricCard           { label: string; value: string; benchmark: string; status: Signal; }
export interface MetricCardsSection   { type: 'metric_cards';  title?: string; data: MetricCard[]; }
export interface BarChartItem         { name: string; value: number; signal?: Signal; }
export interface BarChartSection      { type: 'bar_chart';     title?: string; data: BarChartItem[]; }
export interface TableCell            { value: string; signal?: Signal; }
export interface TableSection         { type: 'table';         title?: string; headers: string[]; rows: TableCell[][]; }
export interface InsightCard          { number: number; title: string; evidence: string; source?: string; }
export interface InsightCardsSection  { type: 'insight_cards'; title?: string; data: InsightCard[]; }

export interface EconomicSignalItem   { label: string; value: string; date?: string; source?: string; signal?: Signal; }
export interface EconomicSignalsSection { type: 'economic_signals'; title?: string; data: EconomicSignalItem[]; }

export interface SentimentItem        { source: string; rating: string; signal?: Signal; theme?: string; }
export interface ConsumerBuzzSection  { type: 'consumer_buzz'; title?: string; sentiment: SentimentItem[]; related_searches?: string[]; }

export type Section =
    | ContextSection
    | MetricCardsSection
    | BarChartSection
    | TableSection
    | InsightCardsSection
    | EconomicSignalsSection
    | ConsumerBuzzSection;

export interface StructuredResponse { sections: Section[]; }
