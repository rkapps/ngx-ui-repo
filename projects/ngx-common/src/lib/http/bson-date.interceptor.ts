import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';

/**
 * Converts MongoDB extended-JSON dates in API responses back to ISO strings.
 *
 * Domain structs whose dates use the backend's `serialize_as_bson_datetime` (so Mongo stores real
 * BSON dates) also serialize that way to JSON — `{"$date": {"$numberLong": "1759…"}}` instead of
 * `"2026-10-07T…Z"` — which `new Date()`/`DatePipe` can't read (NaN / errors). This rewrites any
 * such value, at any depth, so the rest of the app keeps seeing plain ISO strings.
 */
export const bsonDateInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    map(event => {
      if (event instanceof HttpResponse && event.body !== null && typeof event.body === 'object') {
        normalizeBsonDates(event.body);
      }
      return event;
    }),
  );

/** In place: replaces `{ $date: … }` objects with ISO strings (the body is freshly parsed JSON). */
export function normalizeBsonDates(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = normalizeBsonDates(value[i]);
    return value;
  }
  if (value === null || typeof value !== 'object') return value;

  const iso = bsonDateToIso(value as Record<string, unknown>);
  if (iso !== undefined) return iso;

  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) obj[key] = normalizeBsonDates(obj[key]);
  return obj;
}

/** ISO string for an extended-JSON date (canonical `$numberLong`, relaxed string, or millis); else undefined. */
function bsonDateToIso(obj: Record<string, unknown>): string | undefined {
  const keys = Object.keys(obj);
  if (keys.length !== 1 || keys[0] !== '$date') return undefined;
  const date = obj['$date'];
  let millis: number;
  if (typeof date === 'string') return date; // relaxed form is already ISO-8601
  if (typeof date === 'number') millis = date;
  else if (date && typeof date === 'object' && typeof (date as Record<string, unknown>)['$numberLong'] === 'string') {
    millis = Number((date as Record<string, string>)['$numberLong']);
  } else {
    return undefined;
  }
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined;
}
