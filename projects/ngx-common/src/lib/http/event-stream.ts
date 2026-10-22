import { Observable } from 'rxjs';
import { normalizeBsonDates } from './bson-date.interceptor';

/** A file the server made for a turn (e.g. the report PDF): a download URL, or the bytes inline. */
export interface StreamAttachment {
  file_name: string;
  mime: string;
  size: number;
  /** Absolute URL to fetch it from (with the bearer token); resolved against the API base. */
  url?: string;
  /** The file itself, base64-encoded (test runs, which aren't saved). */
  base64?: string;
}

/**
 * One event of a turn stream:
 * - `message` — a chunk (content, status, the final response);
 * - `error` — a non-fatal error; the stream keeps going;
 * - `attachment` — a file is ready (download card);
 * - `attachment_failed` — a file was asked for but couldn't be made.
 * The server ends the stream with `done`.
 */
export type StreamEvent<T> =
  | { type: 'message'; data: T }
  | { type: 'error'; message: string }
  | { type: 'attachment'; attachment: StreamAttachment }
  | { type: 'attachment_failed'; reason: string };

/**
 * POSTs `body` as JSON and emits each Server-Sent Event as a `StreamEvent` as it arrives
 * (`event:` / `data:` lines, a blank line ends an event). Reads until `event: done`, `[DONE]` or
 * the end of the response — not just the final chunk, since attachments follow it. Only a failed
 * request (non-2xx, network) errors the observable; `event: error` is passed on as an event.
 *
 * `fetch` (not HttpClient) so the response can be read incrementally; that also bypasses the
 * interceptors, so the bearer token and BSON-date normalisation are applied here. A relative
 * attachment `url` is resolved against `apiBase`. Unsubscribing aborts the request.
 */
export function postEventStream<T>(
  url: string,
  body: unknown,
  getToken: () => Promise<string | null>,
  apiBase = '',
): Observable<StreamEvent<T>> {
  return new Observable<StreamEvent<T>>(subscriber => {
    const controller = new AbortController();

    (async () => {
      try {
        const token = await getToken();
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const text = await response.text().catch(() => '');
          subscriber.error(Object.assign(new Error(errorText(text) || `HTTP ${response.status}`), { status: response.status }));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventType = '';
        let eventData = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              eventType = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              eventData += trimmed.slice(5).trim();
            } else if (trimmed === '') {
              // Blank line: dispatch the buffered event.
              const data = eventData;
              const type = eventType || 'message';
              eventData = '';
              eventType = '';
              if (type === 'done' || data === '[DONE]') {
                subscriber.complete();
                return;
              }
              if (!data) continue;
              const event = toEvent<T>(type, data, apiBase);
              if (event) subscriber.next(event);
            }
          }
        }
        subscriber.complete();
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return; // unsubscribed
        subscriber.error(err);
      }
    })();

    return () => controller.abort();
  });
}

function toEvent<T>(type: string, data: string, apiBase: string): StreamEvent<T> | null {
  switch (type) {
    case 'error':
      return { type: 'error', message: errorText(data) || 'Something went wrong.' };
    case 'attachment_failed': {
      const json = parseJson(data);
      const reason = typeof json?.['reason'] === 'string' ? json['reason'] : data;
      return { type: 'attachment_failed', reason };
    }
    case 'attachment': {
      const json = parseJson(data);
      if (!json || typeof json['file_name'] !== 'string') return null;
      const attachment = json as unknown as StreamAttachment;
      if (attachment.url && !/^https?:\/\//.test(attachment.url)) attachment.url = apiBase + attachment.url;
      return { type: 'attachment', attachment };
    }
    case 'message': {
      const json = parseJson(data);
      return json ? { type: 'message', data: normalizeBsonDates(json) as T } : null; // not JSON (e.g. a keep-alive) — skip
    }
    default:
      return null; // unknown event types are ignored
  }
}

function parseJson(data: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(data);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** An error body as text: plain text as-is, or the `message` / `detail` / `error` of a JSON body. */
function errorText(text: string): string {
  const json = parseJson(text);
  const detail = json?.['message'] ?? json?.['detail'] ?? json?.['error'];
  return typeof detail === 'string' ? detail : text;
}

/** Saves an attachment: fetches `url` with the bearer token, or decodes the inline bytes. */
export async function saveAttachment(attachment: StreamAttachment, getToken: () => Promise<string | null>): Promise<void> {
  let blob: Blob;
  if (attachment.base64) {
    const bytes = Uint8Array.from(atob(attachment.base64), c => c.charCodeAt(0));
    blob = new Blob([bytes], { type: attachment.mime });
  } else if (attachment.url) {
    const token = await getToken();
    const response = await fetch(attachment.url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error(`Download failed (HTTP ${response.status})`);
    blob = await response.blob();
  } else {
    throw new Error('Nothing to download.');
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = attachment.file_name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
