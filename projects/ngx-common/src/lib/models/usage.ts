export interface UsageDetail {
  input_tokens: number;
  cached_read_tokens: number;
  cached_write_tokens: number;
  tool_use_tokens: number;
  reasoning_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface ConversationUsage {
  id: string;
  uid: string;
  title: string;
  conversation_type: string;
  llm: string;
  model: string;
  strategy: string;
  template_id: string | null;
  agent_id: string | null;
  created_at: string;
  last_updated_at: string;
  usage: UsageDetail | null;
  input_tokens_cost: number;
  cached_read_tokens_cost: number;
  cached_write_tokens_cost: number;
  output_tokens_cost: number;
  total_tokens_cost: number;
}

export interface TurnUsage {
  id: string;
  conversation_id: string;
  sequence: number;
  user_prompt: string;
  created_at: string;
  usage: UsageDetail | null;
  input_tokens_cost: number;
  cached_read_tokens_cost: number;
  cached_write_tokens_cost: number;
  output_tokens_cost: number;
  total_tokens_cost: number;
}
