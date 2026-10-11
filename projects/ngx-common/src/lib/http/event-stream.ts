import { Observable } from 'rxjs';
import { normalizeBsonDates } from './bson-date.interceptor';

/**
 * POSTs `body` as JSON and emits each Server-Sent Event's JSON `data` as it arrives — the same
 * framing as the conversation turn stream (`event:` / `data:` lines, blank line ends an event,
 * `[DONE]` or a chunk with `is_final: true` ends the stream, `event: error` fails it).
 *
 * `fetch` (not HttpClient) so the response can be read incrementally; that also bypasses the
 * interceptors, so the bearer token and BSON-date normalisation are applied here. Unsubscribing
 * aborts the request.
 */
export function postEventStream<T extends { is_final?: boolean }>(
  url: string,
  body: unknown,
  getToken: () => Promise<string | null>,
): Observable<T> {
  return new Observable<T>(subscriber => {
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
          subscriber.error(Object.assign(new Error(text || `HTTP ${response.status}`), { status: response.status }));
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
              const type = eventType;
              eventData = '';
              eventType = '';
              if (!data) continue;
              if (data === '[DONE]') {
                subscriber.complete();
                return;
              }
              if (type === 'error') {
                subscriber.error(new Error(data));
                return;
              }
              let chunk: T;
              try {
                chunk = normalizeBsonDates(JSON.parse(data)) as T;
              } catch {
                continue; // not JSON (e.g. a keep-alive) — skip
              }
              subscriber.next(chunk);
              if (chunk.is_final) {
                subscriber.complete();
                return;
              }
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
