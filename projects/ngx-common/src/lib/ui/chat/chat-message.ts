export interface ChatMessage {
  id: string;
  userContent: string;
  assistantContent: string;
  sequence?: number;
  streaming?: boolean;
}
