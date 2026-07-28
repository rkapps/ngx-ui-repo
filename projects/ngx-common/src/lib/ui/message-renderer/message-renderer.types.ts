export type Signal = 'up' | 'down' | 'neutral' | 'warning';

export interface ContextSection       { type: 'context';           title?: string; group?: string; content: string; }
export interface MetricCard           { label: string; value: string; benchmark?: string; change?: string; status?: Signal; }
export interface MetricCardsSection   { type: 'metric_cards';      title?: string; group?: string; data: MetricCard[]; }
export interface BarChartItem         { name: string; value?: number; values?: number[]; signal?: Signal; }
export interface BarChartSection      { type: 'bar_chart';         title?: string; group?: string; unit?: string; format?: string; orientation?: string; groups?: string[]; data: BarChartItem[]; }
export interface LineChartItem        { name: string; value?: number; values?: number[]; signal?: Signal; }
export interface LineChartSection     { type: 'line_chart';        title?: string; group?: string; unit?: string; format?: string; groups?: string[]; data: LineChartItem[]; }
/** Unified chart section — data_type selects the renderer: "comparison" -> bar chart, "time_series" -> line chart. */
export interface ChartItem            { name: string; value?: number; values?: number[]; signal?: Signal; }
export interface ChartSection         { type: 'chart';             title?: string; group?: string; data_type?: 'comparison' | 'time_series'; unit?: string; format?: string; groups?: string[]; data: ChartItem[]; }
export interface TableCell            { value: string; signal?: Signal; indicator?: 'dot' | 'arrow'; note?: string; }
export interface TableSection         { type: 'table';             title?: string; group?: string; layout?: 'row' | 'column'; headers?: string[]; rows?: (TableCell[] | Record<string, TableCell | string>)[]; totals?: (TableCell[] | Record<string, TableCell | string>)[]; }
/** Always renders as a column-layout table with signal badges — the explicit counterpart to `table` + group containing "technical". */
export interface TechnicalsSection    { type: 'technicals';        title?: string; group?: string; headers?: string[]; rows?: (TableCell[] | Record<string, TableCell | string>)[]; }
export interface InsightCard          { number: number | string; title: string; evidence: string; source?: string; signal?: Signal; }
export interface InsightCardsSection  { type: 'insight_cards';     title?: string; group?: string; data: InsightCard[]; }
export interface EconomicSignalItem   { label: string; value: string; date?: string; source?: string; signal?: Signal; }
export interface EconomicSignalsSection { type: 'economic_signals'; title?: string; group?: string; data: EconomicSignalItem[]; }
export interface PositioningTheme     { label: string; value: string; signal?: Signal; }
export interface PositioningItem      { symbol: string; themes: PositioningTheme[]; }
export interface PositioningSection   { type: 'positioning';       title?: string; group?: string; data: PositioningItem[]; }
export interface SentimentItem        { source: string; icon?: string; rating: string; max_rating?: string; signal?: Signal; theme?: string; }
export interface ConsumerBuzzSection  { type: 'consumer_buzz';     title?: string; group?: string; sentiment: SentimentItem[]; related_searches?: string[]; }
export interface PriceTargetItem      { symbol: string; current: number; target: number; upside: number; consensus?: 'Buy' | 'Hold' | 'Sell'; }
export interface PriceTargetsSection  { type: 'price_targets';     title?: string; group?: string; data: PriceTargetItem[]; }
export interface SuggestedPromptsSection { type: 'suggested_prompts'; title?: string; group?: string; prompts?: string[]; prompt?: string[]; suggested_prompts?: string[]; }

export type Section =
    | ContextSection
    | MetricCardsSection
    | BarChartSection
    | LineChartSection
    | ChartSection
    | TableSection
    | TechnicalsSection
    | InsightCardsSection
    | EconomicSignalsSection
    | PositioningSection
    | ConsumerBuzzSection
    | PriceTargetsSection
    | SuggestedPromptsSection;

export interface StructuredResponse { sections: Section[]; }
