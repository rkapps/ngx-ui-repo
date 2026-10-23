export type Signal = 'up' | 'down' | 'neutral' | 'warning';
/** How a report number is displayed (rustic-report `Format`). Percent values are percentage points. */
export type ReportFormat = 'number' | 'integer' | 'currency' | 'percent' | 'percent_change' | 'multiple';

export interface ContextSection       { type: 'context';           title?: string; group?: string; content: string; }
/** Old shape: string `value`/`change` and `status`. rustic-report: `value` number or text with `format`, numeric `change` with `change_format`, `signal`. */
export interface MetricCard           { label: string; value: string | number; benchmark?: string; change?: string | number; status?: Signal; signal?: Signal; format?: ReportFormat; change_format?: ReportFormat; }
export interface MetricCardsSection   { type: 'metric_cards';      title?: string; group?: string; data: MetricCard[]; }
export interface BarChartItem         { name: string; value?: number; values?: number[]; signal?: Signal; }
/** Series names: `groups` (old shape) or `series` (rustic-report). */
export interface BarChartSection      { type: 'bar_chart';         title?: string; group?: string; unit?: string; format?: string; orientation?: string; groups?: string[]; series?: string[]; data: BarChartItem[]; }
/** `values` may hold null (no data at that point — the line breaks there). */
export interface LineChartItem        { name: string; value?: number; values?: (number | null)[]; signal?: Signal; }
/** Old shape: `groups` (x labels) + `data`. rustic-report: `x` + `series: [{ name, values }]`. */
export interface LineSeries           { name: string; values: (number | null)[]; }
export interface LineChartSection     { type: 'line_chart';        title?: string; group?: string; unit?: string; format?: string; groups?: string[]; data: LineChartItem[]; x?: string[]; series?: LineSeries[]; }
/** Unified chart section — data_type selects the renderer: "comparison" -> bar chart, "time_series" -> line chart. */
export interface ChartItem            { name: string; value?: number; values?: number[]; signal?: Signal; }
export interface ChartSection         { type: 'chart';             title?: string; group?: string; data_type?: 'comparison' | 'time_series'; unit?: string; format?: string; groups?: string[]; data: ChartItem[]; }
/** rustic-report cells have a number or text `value` plus an optional `format`; older ones are text. */
export interface TableCell            { value: string | number; format?: ReportFormat; signal?: Signal; indicator?: 'dot' | 'arrow' | 'badge'; note?: string; }
export type ColumnAlign = 'left' | 'right' | 'center';
export type TableRowType = 'data' | 'subtotal' | 'grand_total';
export interface TableRow             { row_type?: TableRowType; cells: (TableCell | string)[]; }
export type TableRowInput = TableCell[] | TableRow | Record<string, TableCell | string>;
export interface TableSection         { type: 'table';             title?: string; group?: string; layout?: 'row' | 'column'; headers?: string[]; column_align?: ColumnAlign[]; rows?: TableRowInput[]; totals?: TableRowInput[]; }
/** Always renders as a column-layout table with signal badges — the explicit counterpart to `table` + group containing "technical". */
export interface TechnicalsSection    { type: 'technicals';        title?: string; group?: string; headers?: string[]; column_align?: ColumnAlign[]; rows?: TableRowInput[]; }
/** `number` is absent in rustic-report (cards are numbered by position). */
export interface InsightCard          { number?: number | string; title: string; evidence: string; source?: string; signal?: Signal; }
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
/** One card per subject with short labelled values — rustic-report's successor to `positioning`. */
export interface ProfileItem          { label: string; value: string; signal?: Signal; }
export interface Profile              { subject: string; items: ProfileItem[]; }
export interface ProfilesSection      { type: 'profiles';          title?: string; group?: string; data: Profile[]; }
/** Current value against a target, per subject — rustic-report's successor to `price_targets`. The change is computed here. */
export interface TargetItem           { subject: string; current: number; target: number; label?: string; }
export interface TargetsSection       { type: 'targets';           title?: string; group?: string; format?: ReportFormat; data: TargetItem[]; }
/** Scores by source — rustic-report's successor to `consumer_buzz` (numeric ratings, `related` instead of `related_searches`). */
export interface Rating               { source: string; rating: number; max_rating: number; signal?: Signal; theme?: string; }
export interface RatingsSection       { type: 'ratings';           title?: string; group?: string; data: Rating[]; related?: string[]; }
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
    | ProfilesSection
    | TargetsSection
    | RatingsSection
    | SuggestedPromptsSection;

export interface StructuredResponse { sections: Section[]; }
