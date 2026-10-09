import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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

/** Read-only admin view of server configuration; admin-only on the backend. */
@Injectable({ providedIn: 'root' })
export class AdminConfigService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  getAgents(): Observable<AgentConfig[]> {
    return this.http.get<AgentConfig[]>(`${this.base}/admin/agents`);
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
}
