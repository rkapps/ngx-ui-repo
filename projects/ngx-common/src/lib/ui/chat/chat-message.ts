import type { StreamAttachment } from '../../http/event-stream';

export interface ChatMessage {
  id: string;
  userContent: string;
  assistantContent: string;
  sequence?: number;
  streaming?: boolean;
  /** Non-fatal errors reported while the response streamed in, shown under it. */
  errors?: string[];
  /** A file made for this response (e.g. the report PDF), shown as a download card. */
  attachment?: StreamAttachment;
  /** Why a requested file couldn't be made, shown as a note. */
  attachmentFailed?: string;
}
