export interface LlmProvider {
  id: string;
  llm: string;
  models: string[];
  default_model: string;
}
