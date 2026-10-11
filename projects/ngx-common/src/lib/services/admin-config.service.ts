import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { postEventStream } from '../http/event-stream';
import type { TurnResponse } from '../models/turn-execution';
import { API_BASE_URL } from './api-url.token';
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
export type Preset = 'fast' | 'balanced' | 'data' | 'precise' | 'thorough' | 'local';

export interface LlmConfig {
  llm: string | null;
  model: string | null;
  preset: Preset | null;
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
  followup_agent: string | null;
  persisted_blackboard_keys: string[] | null;
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
  response_format_schema_path: string;
  response_format_schema: unknown | null;
}

export interface ModelConfig {
  id: string;
  enabled: boolean;
  input_cost: number;
  cached_read_cost: number;
  cached_write_cost: number;
  output_cost: number;
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
 * `POST /admin/agents/test` body (the backend's `AgentRunConfigRequest`): run `agent_id` with the
 * given provider/model and `configsm` holding the config of every agent in the run (the test
 * agent and its sub-agents — each the chosen draft or the live config), continuing from `prev_response_id` for
 * multi-turn tests. Nothing is saved.
 */
export interface AgentTestRequest {
  agent_id: string;
  llm: string;
  model: string;
  /** Preset override; null keeps the agent's own (or the server default). */
  preset: Preset | null;
  prompt: string;
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

  /** Every agent — live ones and draft-only ones — with its version status. */
  getAgents(): Observable<AgentConfigResponse[]> {
    return this.http.get<AgentConfigResponse[]>(`${this.base}/admin/agents`);
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
  testAgent(request: AgentTestRequest): Observable<AgentTestChunk> {
    return postEventStream<AgentTestChunk>(`${this.base}/admin/agents/test`, request, () => this.auth.getIdToken());
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

  getProviders(): Observable<ProviderConfig[]> {
    return this.http.get<ProviderConfig[]>(`${this.base}/admin/providers`);
  }

  /** Force the backend to refresh its in-memory config cache from storage. Empty/204 response = success. */
  refreshCache(): Observable<RefreshCacheResponse | null> {
    return this.http.post<RefreshCacheResponse | null>(`${this.base}/admin/config/refresh`, null);
  }
}
