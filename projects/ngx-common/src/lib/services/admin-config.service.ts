import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-url.token';
import type { Origin } from '../models/origin';
import type { ConversationStrategy, HistoryMode } from './conversation.service';

export type ExecutionType = 'single_agent' | 'pipeline' | 'pipeline_agent';
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

/** Read-only admin view of server configuration; admin-only on the backend. */
@Injectable({ providedIn: 'root' })
export class AdminConfigService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  getAgents(): Observable<AgentConfig[]> {
    return this.http.get<AgentConfig[]>(`${this.base}/admin/agents`);
  }

  getProviders(): Observable<ProviderConfig[]> {
    return this.http.get<ProviderConfig[]>(`${this.base}/admin/providers`);
  }
}
