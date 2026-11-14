import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { postEventStream, type StreamEvent } from '../http/event-stream';
import type { TurnResponse } from '../models/turn-execution';
import { API_BASE_URL } from './api-url.token';
import type { ChatTemplate } from './chat-template.service';
import type { Origin } from '../models/origin';
import type { ConversationStrategy, HistoryMode } from './conversation.service';

export type ExecutionType = 'single_agent' | 'pipeline' | 'pipeline_agent';

export const EXECUTION_TYPE_LABELS: Record<ExecutionType, string> = {
  single_agent: 'Single agent',
  pipeline: 'Pipeline',
  pipeline_agent: 'Pipeline agent',
};

/** `pipeline.type` values the backend understands: `"deterministic"`, anything else runs as dynamic. */
export type PipelineType = 'deterministic' | 'dynamic';
/** An LLM preset's id (`LlmPreset.id`); the list comes from `/admin/llm_presets`. */
export type Preset = string;

export interface LlmConfig {
  llm: string | null;
  model: string | null;
  preset: Preset | null;
}

/**
 * LLM generation parameters (backend `LlmParameters`). Every field is optional: an unset one falls
 * through to the next level when merged. `reasoning_effort` is the backend's `ReasoningEffort`.
 */
export interface LlmParameters {
  temperature?: number | null;
  max_tokens?: number | null;
  reasoning_effort?: string | null;
  enable_cache?: boolean | null;
}

/** A preset as offered in an agent's Preset dropdown. */
export interface PresetChoice {
  id: Preset;
  summary: string;
}


/** A named set of LLM parameters (`GET /platform/llm_presets`); `LlmConfig.preset` refers to its `id`. */
export interface LlmPreset {
  id: string;
  summary?: string;
  description: string;
  origin: Origin;
  enabled: boolean;
  version: number | null;
  /** Position in lists, ascending; presets without one come last. */
  sort_order?: number | null;
  parameters: LlmParameters;
}

/** Preset list order: `sort_order` ascending (unset last), then id. */
export function byPresetOrder(a: Pick<LlmPreset, 'id' | 'sort_order'>, b: Pick<LlmPreset, 'id' | 'sort_order'>): number {
  const ao = a.sort_order ?? Number.POSITIVE_INFINITY;
  const bo = b.sort_order ?? Number.POSITIVE_INFINITY;
  return ao !== bo ? (ao < bo ? -1 : 1) : a.id.localeCompare(b.id);
}

export interface AvailableAgent {
  id: string;
  llm_config: LlmConfig | null;
  relay_tool_output: boolean | null;
}

export interface PipelineStage {
  name: string;
  parallel: boolean;
  sub_agents: AvailableAgent[];
}

export interface PipelineConfig {
  type: string;
  available_agents: AvailableAgent[];
  stages: PipelineStage[];
  /** Produces the final output from the collected outputs; unset returns them merged (a parent pipeline synthesizes). */
  synthesizer?: AvailableAgent | null;
}

export interface AgentConversationConfig {
  default_strategy: ConversationStrategy;
  allowed_strategies: ConversationStrategy[];
  history_mode: HistoryMode | null;
  max_turns: number | null;
}

/** Full agent configuration (`agents.json` / agent config collection). */
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  llm_config: LlmConfig | null;
  /** When `false` the agent is skipped at startup / not offered to users. */
  enabled: boolean;
  /** Live version number, set when a version is promoted; null for agents never versioned. Server-owned. */
  version: number | null;
  origin: Origin;
  standalone: boolean;
  execution: ExecutionType;
  system_prompt: string;
  tools: string[];
  mcp_tools: string[];
  conversation: AgentConversationConfig | null;
  pipeline: PipelineConfig | null;
  response_format_schema: unknown | null;
  /** How each turn is delivered beyond the screen; runs once per turn, not seen by the orchestrator. */
  delivery?: DeliveryConfig | null;
}

/** Beyond the screen: `pdf` attaches a PDF (synthesized without streaming); `email` also emails it to the user. */
export type Deliverable = 'pdf' | 'email';

export interface DeliveryConfig {
  /** Decides per turn what the user asked for. */
  agent: AvailableAgent;
  /** What may be delivered beyond the screen; the agent's decision is clamped to this. */
  allowed: Deliverable[];
}

export interface ModelConfig {
  id: string;
  enabled: boolean;
  /** Tokens the provider accepts as input; null when unknown. */
  context_window: number | null;
  /** Hard cap the provider enforces on output; null when unknown. */
  max_output_tokens: number | null;
}

/**
 * One price for a provider's model from a date on (`GET /{scope}/model_prices`). The price in effect
 * is the latest `effective_from` on or before today. Amounts are decimal strings ("5.00").
 */
export interface ModelPrice {
  id: string;
  currency: string;
  /** Always "per_million_tokens". */
  unit: string;
  /** Provider id (e.g. "anthropic"). */
  provider: string;
  model: string;
  /** `YYYY-MM-DD`. */
  effective_from: string;
  input: string;
  output: string;
  cached_input: string | null;
  cache_write: string | null;
  reasoning: string | null;
}

/** Full LLM provider configuration, including disabled providers and models. */
export interface ProviderConfig {
  id: string;
  llm: string;
  enabled: boolean;
  api_key_env: string | null;
  base_url_env: string | null;
  models: ModelConfig[];
  default_model: string;
}

/** One MCP server (backend `MCPServerConfig`, an entry of `mcp_servers_config.json`). */
export interface McpServerConfig {
  id: string;
  /** Logical server name, used to namespace its tool definitions (e.g. `weather`). */
  name: string;
  /** HTTP endpoint of the MCP server. */
  url: string;
  /** Name of the environment variable holding the server's Bearer token. */
  api_key_env: string;
  /** Header to send the token in; the backend's default when null. */
  auth_header_name: string | null;
  /** The only tools from this server exposed to agents. */
  enabled_tools: string[];
}

/** Where an agent stands in the draft → promote flow (`snake_case` from the backend). */
export type AgentStatus = 'live' | 'draft' | 'live_with_draft';

/** `GET /admin/agents` row: the live config (or the draft's, if never promoted) plus version state. */
export interface AgentConfigResponse {
  config: AgentConfig;
  status: AgentStatus;
  /** Null for agents never versioned (imported) or never promoted. */
  live_version: number | null;
  draft_version: number | null;
}

/**
 * `POST /admin/agents/test` body (the backend's `AgentConfigTestRequest`): run `agent_id` with the
 * given `llm_config` (provider/model/preset) and `configsm` holding the config of every agent in the run (the test
 * agent and its sub-agents — each the chosen draft or the live config), continuing from `prev_response_id` for
 * multi-turn tests. Nothing is saved.
 */
export interface AgentTestRequest {
  agent_id: string;
  prompt: string;
  /** Provider, model and preset for the run; a null preset keeps the agent's own (or the server default). */
  llm_config: LlmConfig;
  prev_response_id: string | null;
  configsm: Record<string, AgentConfig>;
}

/** A test-run stream chunk: the chat chunk format; the final chunk also carries the full execution. */
/** Backend `AgentConfigTestResponseChunk`; `execution` (the full TurnResponse) comes on the final chunk. */
export interface AgentTestChunk {
  id: string;
  content: string;
  thought: string;
  status: string;
  is_final: boolean;
  execution: TurnResponse | null;
}

/** Serde's default enum names (no rename on the backend). */
export type VersionStatus = 'Draft' | 'Promoted';

/** One version of an agent's config. Starts as a Draft (editable); promoting freezes it and makes it live. */
export interface AgentConfigVersion {
  /** `{agent_id}-{version}` — internal; the API addresses versions by agent id + number. */
  id: string;
  agent_id: string;
  version: number;
  status: VersionStatus;
  config: AgentConfig;
  created_at: string;
  created_by: string;
  created_by_email: string;
  note: string | null;
}

/** A registry tool an agent can be given — the schema sent to the LLM (`/admin/tools`). */
export interface ToolDefinition {
  /** Always `"function"` for current providers. */
  type: string;
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: unknown;
}

/** Which providers a page manages: the active tenant's (`/admin`) or the platform-wide ones (`/platform`). */
export type ConfigScope = 'admin' | 'platform';

/** Result of a cache refresh. `mcp_failures`: MCP servers that failed to rebuild, if the backend reports them. */
export interface RefreshCacheResponse {
  mcp_failures?: { server: string; error: string }[];
}

/** Read-only admin view of server configuration; admin-only on the backend. */
@Injectable({ providedIn: 'root' })
export class AdminConfigService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly auth = inject(AuthService);

  /** Every agent — live ones and draft-only ones — with its version status (`GET /{scope}/agents`). */
  getAgents(scope: ConfigScope = 'admin'): Observable<AgentConfigResponse[]> {
    return this.http.get<AgentConfigResponse[]>(`${this.base}/${scope}/agents`);
  }

  /** Platform only: save these agent configs (`POST /platform/agents/import`). Empty response = success. */
  importAgents(configs: AgentConfig[]): Observable<void> {
    return this.http.post<void>(`${this.base}/platform/agents/import`, configs);
  }

  // ── Agent versions (draft → promote) ──

  /** New agent: creates it with a v1 draft (only the id is checked — must be unused). */
  createAgent(config: AgentConfig): Observable<AgentConfigVersion> {
    return this.http.post<AgentConfigVersion>(`${this.base}/admin/agents`, config);
  }

  /** Opens an existing agent for editing: returns its draft, creating one if needed. */
  openAgentDraft(agentId: string): Observable<AgentConfigVersion> {
    return this.http.post<AgentConfigVersion>(`${this.base}/admin/agents/${encodeURIComponent(agentId)}/versions`, null);
  }

  getAgentVersions(agentId: string): Observable<AgentConfigVersion[]> {
    return this.http.get<AgentConfigVersion[]>(`${this.base}/admin/agents/${encodeURIComponent(agentId)}/versions`);
  }

  /** Test run — `POST /admin/agents/test`, streamed like a chat turn; nothing is saved. Unsubscribe to stop. */
  testAgent(request: AgentTestRequest): Observable<StreamEvent<AgentTestChunk>> {
    return postEventStream<AgentTestChunk>(`${this.base}/admin/agents/test`, request, () => this.auth.getIdToken(), this.base);
  }

  /** Makes a draft the live version (the backend validates it first). */
  promoteAgentDraft(agentId: string, version: number): Observable<AgentConfigVersion> {
    return this.http.post<AgentConfigVersion>(`${this.base}/admin/agents/${encodeURIComponent(agentId)}/versions/${version}/promote`, null);
  }

  /** Discards a draft (drafts only); for a never-promoted agent this removes the agent. */
  discardAgentDraft(agentId: string, version: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/agents/${encodeURIComponent(agentId)}/versions/${version}`);
  }

  /** Saves a draft's config (409 if the version isn't a draft any more). */
  saveAgentDraft(agentId: string, version: number, config: AgentConfig, note: string | null = null): Observable<void> {
    return this.http.put<void>(`${this.base}/admin/agents/${encodeURIComponent(agentId)}/versions/${version}`, { config, note });
  }

  /** Registry tools (stored in an agent's `tools`; MCP tools come from `getMcpTools`). */
  getTools(): Observable<ToolDefinition[]> {
    return this.http.get<ToolDefinition[]>(`${this.base}/admin/tools`);
  }

  /** Tools exposed by the configured MCP servers (stored in an agent's `mcp_tools`). */
  getMcpTools(): Observable<ToolDefinition[]> {
    return this.http.get<ToolDefinition[]>(`${this.base}/admin/mcp_tools`);
  }

  getProviders(scope: ConfigScope = 'admin'): Observable<ProviderConfig[]> {
    return this.http.get<ProviderConfig[]>(`${this.base}/${scope}/providers`);
  }

  /**
   * Replace one provider config — its fields and its whole `models` list, so enabling/disabling and
   * adding/editing/deleting models all go through here. Returns the saved config.
   */
  updateProvider(config: ProviderConfig, scope: ConfigScope = 'admin'): Observable<ProviderConfig> {
    return this.http.put<ProviderConfig>(`${this.base}/${scope}/providers/${encodeURIComponent(config.id)}`, config);
  }

  /** Platform: every chat template (`GET /platform/chat_templates`). */
  getChatTemplates(): Observable<ChatTemplate[]> {
    return this.http.get<ChatTemplate[]>(`${this.base}/platform/chat_templates`);
  }

  /** Platform: save these chat templates (`POST /platform/chat_templates/import`). Empty response = success. */
  importChatTemplates(templates: ChatTemplate[]): Observable<void> {
    return this.http.post<void>(`${this.base}/platform/chat_templates/import`, templates);
  }

  /** Every MCP server config (`GET /{scope}/mcp_server_configs`). */
  getMcpServerConfigs(scope: ConfigScope = 'platform'): Observable<McpServerConfig[]> {
    return this.http.get<McpServerConfig[]>(`${this.base}/${scope}/mcp_server_configs`);
  }

  /** Platform: save these MCP server configs (`POST /platform/mcp_server_configs/import`). Empty response = success. */
  importMcpServerConfigs(configs: McpServerConfig[]): Observable<void> {
    return this.http.post<void>(`${this.base}/platform/mcp_server_configs/import`, configs);
  }

  /** Every model price, current and past (`GET /{scope}/model_prices`). */
  getModelPrices(scope: ConfigScope = 'admin'): Observable<ModelPrice[]> {
    return this.http.get<ModelPrice[]>(`${this.base}/${scope}/model_prices`);
  }

  /** Platform only: save these model prices (`POST /platform/model_prices/import`). Empty response = success. */
  importModelPrices(prices: ModelPrice[]): Observable<void> {
    return this.http.post<void>(`${this.base}/platform/model_prices/import`, prices);
  }

  /** Platform: every LLM preset (`GET /platform/llm_presets`). */
  getLlmPresets(scope: ConfigScope = 'platform'): Observable<LlmPreset[]> {
    return this.http.get<LlmPreset[]>(`${this.base}/${scope}/llm_presets`);
  }

  /**
   * The presets an agent can pick: the enabled ones from `/admin/llm_presets`, in `sort_order`. A failed load
   * gives none (logged), so the dropdown offers just its default plus any preset already set.
   */
  getPresetChoices(): Observable<PresetChoice[]> {
    return this.getLlmPresets('admin').pipe(
      map(list =>
        list
          .filter(p => p.enabled)
          .sort(byPresetOrder)
          .map(p => ({ id: p.id, summary: p.summary ?? '' })),
      ),
      catchError(err => {
        console.error('Failed to load LLM presets', err);
        return of([]);
      }),
    );
  }

  /** Platform: save these LLM presets (`POST /platform/llm_presets/import`). Empty response = success. */
  importLlmPresets(presets: LlmPreset[]): Observable<void> {
    return this.http.post<void>(`${this.base}/platform/llm_presets/import`, presets);
  }

  /** Platform only: save these provider configs (`POST /platform/providers/import`). Empty response = success. */
  importProviders(configs: ProviderConfig[]): Observable<void> {
    return this.http.post<void>(`${this.base}/platform/providers/import`, configs);
  }

  /** Force the backend to refresh its in-memory config cache from storage. Empty/204 response = success. */
  refreshCache(): Observable<RefreshCacheResponse | null> {
    return this.http.post<RefreshCacheResponse | null>(`${this.base}/admin/config/refresh`, null);
  }
}
