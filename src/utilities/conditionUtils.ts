import type { ExecutionContext, ConditionValueKind } from '../types';
import { evaluateExpression, resolveTemplate } from './expression';

/**
 * Compare two values using the selected comparator.
 * Handles strings, numbers, dates, time-of-day, arrays, and objects.
 */
export const compareValues = (left: any, comparator: string, right: any): boolean => {
  // Fast path for unary operators (right side not used)
  if (comparator === 'exists') return typeof left !== 'undefined';
  if (comparator === 'does not exist') return typeof left === 'undefined';
  if (comparator === 'is empty') return isValueEmpty(left);
  if (comparator === 'is not empty') return !isValueEmpty(left);
  if (comparator === 'is true') return Boolean(left) === true;
  if (comparator === 'is false') return Boolean(left) === false;

  // Determine kind; auto-upgrade to 'time' when the inputs look like time-only
  const DATE_TIME_COMPARATORS = new Set([
    'before', 'after', 'on or before', 'on or after', 'is between', 'is not between',
  ]);
  let kind = inferValueKind(left);
  if (DATE_TIME_COMPARATORS.has(comparator)) {
    const rightIsPair = comparator === 'is between' || comparator === 'is not between';
    const rightVal = rightIsPair ? parsePairValues(right) : right;
    const rightLooksTime = rightIsPair
      ? (isTimeOnlyString((rightVal as any)[0]) && isTimeOnlyString((rightVal as any)[1]))
      : isTimeOnlyString(rightVal);
    const leftLooksTime = isTimeOnlyString(left);
    if (leftLooksTime || rightLooksTime) kind = 'time';
  }

  const l = coerceToKind(left, kind);
  const r = (comparator === 'is between' || comparator === 'is not between')
    ? (() => {
        const [ra, rb] = parsePairValues(right);
        const r0 = coerceToKind(ra, kind);
        const r1 = coerceToKind(rb, kind);
        return [r0, r1];
      })()
    : coerceToKind(right, kind);

  switch (comparator) {
    case 'is equal to': return deepEqual(l, r);
    case 'is not equal to': return !deepEqual(l, r);

    case 'contains': return String(l).includes(String(r));
    case 'does not contain': return !String(l).includes(String(r));
    case 'starts with': return String(l).startsWith(String(r));
    case 'ends with': return String(l).endsWith(String(r));
    case 'matches regex': try { return new RegExp(String(r)).test(String(l)); } catch { return false; }

    case 'greater than': return Number(l) > Number(r);
    case 'greater than or equal to': return Number(l) >= Number(r);
    case 'less than': return Number(l) < Number(r);
    case 'less than or equal to': return Number(l) <= Number(r);
    case 'is between': {
      // Time-of-day handling: compare by HH:mm[:ss] regardless of date
      if (kind === 'time') {
        const lt = toTimeOfDayMs(l);
        const r0t = toTimeOfDayMs((r as any)[0]);
        const r1t = toTimeOfDayMs((r as any)[1]);
        if (!Number.isNaN(lt) && !Number.isNaN(r0t) && !Number.isNaN(r1t)) {
          const min = Math.min(r0t, r1t);
          const max = Math.max(r0t, r1t);
          return lt >= min && lt <= max;
        }
      }
      // Date handling: compare timestamps inclusively
      const lt = toTimestamp(l);
      const r0t = toTimestamp((r as any)[0]);
      const r1t = toTimestamp((r as any)[1]);
      const useDate = !Number.isNaN(lt) && !Number.isNaN(r0t) && !Number.isNaN(r1t);
      return useDate
        ? (lt >= Math.min(r0t, r1t) && lt <= Math.max(r0t, r1t))
        : (Number(l) >= Number((r as any)[0]) && Number(l) <= Number((r as any)[1]));
    }
    case 'is not between': {
      if (kind === 'time') {
        const lt = toTimeOfDayMs(l);
        const r0t = toTimeOfDayMs((r as any)[0]);
        const r1t = toTimeOfDayMs((r as any)[1]);
        if (!Number.isNaN(lt) && !Number.isNaN(r0t) && !Number.isNaN(r1t)) {
          const min = Math.min(r0t, r1t);
          const max = Math.max(r0t, r1t);
          return !(lt >= min && lt <= max);
        }
      }
      const lt = toTimestamp(l);
      const r0t = toTimestamp((r as any)[0]);
      const r1t = toTimestamp((r as any)[1]);
      const useDate = !Number.isNaN(lt) && !Number.isNaN(r0t) && !Number.isNaN(r1t);
      return useDate
        ? !(lt >= Math.min(r0t, r1t) && lt <= Math.max(r0t, r1t))
        : !(Number(l) >= Number((r as any)[0]) && Number(l) <= Number((r as any)[1]));
    }

    case 'before': return kind === 'time' ? (toTimeOfDayMs(l) < toTimeOfDayMs(r)) : (toTimestamp(l) < toTimestamp(r));
    case 'after': return kind === 'time' ? (toTimeOfDayMs(l) > toTimeOfDayMs(r)) : (toTimestamp(l) > toTimestamp(r));
    case 'on or before': return kind === 'time' ? (toTimeOfDayMs(l) <= toTimeOfDayMs(r)) : (toTimestamp(l) <= toTimestamp(r));
    case 'on or after': return kind === 'time' ? (toTimeOfDayMs(l) >= toTimeOfDayMs(r)) : (toTimestamp(l) >= toTimestamp(r));

    case 'contains value': return Array.isArray(l) ? l.some(x => deepEqual(x, r)) : String(l).includes(String(r));
    case 'length greater than': return (Array.isArray(l) || typeof l === 'string') ? (l as any).length > Number(r) : false;
    case 'length less than': return (Array.isArray(l) || typeof l === 'string') ? (l as any).length < Number(r) : false;
    case 'has key': return l && typeof l === 'object' && String(r) in l;
    case 'has property': return l && typeof l === 'object' && Object.prototype.hasOwnProperty.call(l, String(r));
    default: return false;
  }
};

// ISO date format like 2024-01-31 (optionally with time). Used to guess value type from text.
export const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?Z?)?$/;

/**
 * Turn many common date/time inputs into a timestamp (ms since epoch).
 * Accepts Date, numbers (seconds or ms), ISO strings, time-only strings, and common date formats.
 * Returns NaN when parsing fails.
 */
const parseDateToTimestamp = (x: any): number => {
  try {
    if (x instanceof Date) {
      const t = +x;
      return Number.isNaN(t) ? NaN : t;
    }

    if (typeof x === 'number' && Number.isFinite(x)) {
      // Heuristic: treat 10-digit numbers as seconds, 13+ as milliseconds
      return x < 1e11 ? x * 1000 : x;
    }

    let s = typeof x === 'string' ? x.trim() : String(x);
    if (!s) return NaN;

    // Normalize common typos like double colons in time (e.g., 09::00 -> 09:00)
    s = s.replace(/:{2,}/g, ':');

    // Try native ISO/Date.parse first
    let t = Date.parse(s);
    if (!Number.isNaN(t)) return t;

    // Time-only HH:mm[:ss]
    let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const now = new Date();
      const [, hh, mm, ss = '00'] = m;
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(hh), Number(mm), Number(ss));
      t = +dt;
      return Number.isNaN(t) ? NaN : t;
    }

    // Try YYYY/MM/DD or YYYY-MM-DD with optional time HH:mm[:ss]
    m = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const [, y, mo, d, hh = '00', mm = '00', ss = '00'] = m;
      const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
      t = +dt;
      return Number.isNaN(t) ? NaN : t;
    }

    // Try DD/MM/YYYY or DD-MM-YYYY with optional time HH:mm[:ss]
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) {
      const [, d, mo, y, hh = '00', mm = '00', ss = '00'] = m;
      const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
      t = +dt;
      return Number.isNaN(t) ? NaN : t;
    }

    // Numeric string (epoch seconds or millis)
    if (/^-?\d+$/.test(s)) {
      const n = Number(s);
      return Math.abs(n) < 1e11 ? n * 1000 : n;
    }

    return NaN;
  } catch {
    return NaN;
  }
};

// Is the text only a time (HH:mm or HH:mm:ss)?
const isTimeOnlyString = (s: any): boolean => {
  if (typeof s !== 'string') return false;
  const t = s.trim().replace(/:{2,}/g, ':');
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(t);
};

// Convert any supported date/time to milliseconds within the day (00:00 is 0, 23:59 ~ 86,399,000)
const toTimeOfDayMs = (x: any): number => {
  const ts = parseDateToTimestamp(x);
  if (Number.isNaN(ts)) return NaN;
  const d = new Date(ts);
  return d.getHours() * 3600000 + d.getMinutes() * 60000 + d.getSeconds() * 1000 + d.getMilliseconds();
};

/**
 * Resolve a user-entered string into a real value.
 * - If it starts with $. treat it as an expression and return the raw value from context
 * - If it is exactly a single {{ ... }} template, evaluate and return the raw value
 * - Otherwise, do string interpolation and return the resulting string
 */
export const resolveValue = (raw: string, context: ExecutionContext): any => {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();

  if (trimmed.startsWith('$.')) {
    // Direct $.path expression → evaluate and return raw value (could be object/array)
    return evaluateExpression(trimmed, { context });
  }

  const singleMustache = trimmed.match(/^\{\{\s*([^}]+)\s*\}\}$/);
  if (singleMustache) {
    // Entire content is a single template → evaluate and return raw value
    return evaluateExpression(singleMustache[1], { context });
  }

  // Mixed text → interpolate to a plain string
  return resolveTemplate(raw, { context });
};

/**
 * Guess the kind of a value.
 * Returns one of: string, number, boolean, date, time, array, object
 */
export const inferValueKind = (v: any): ConditionValueKind => {
  if (Array.isArray(v)) return 'array';
  if (v instanceof Date) return 'date';
  if (v !== null && typeof v === 'object') return 'object';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number' && !Number.isNaN(v)) return 'number';
  if (typeof v === 'string') {
    const ts = parseDateToTimestamp(v);
    if (!Number.isNaN(ts)) {
      // If the input looks like time-only (HH:mm or HH:mm:ss), treat as 'time'
      if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(v.replace(/\s+/g, '').replace(/:{2,}/g, ':'))) {
        return 'time';
      }
      return 'date';
    }
  }
  return 'string';
};

/**
 * Convert a value into the requested kind in a forgiving way.
 * - number: Number(v)
 * - boolean: "true"/"false" strings supported
 * - date: best-effort to create a Date
 * - time: also represented as a Date anchored to today
 * - array/object: parse JSON strings when possible
 */
export const coerceToKind = (v: any, kind: ConditionValueKind) => {
  try {
    switch (kind) {
      case 'number': return typeof v === 'number' ? v : Number(v);
      case 'boolean': {
        if (typeof v === 'boolean') return v;
        const s = String(v);
        if (/^true$/i.test(s)) return true;
        if (/^false$/i.test(s)) return false;
        return Boolean(v);
      }
      case 'date': {
        if (v instanceof Date) return v;
        const ts = parseDateToTimestamp(v);
        return Number.isNaN(ts) ? new Date(v) : new Date(ts);
      }
      case 'time': {
        // Represent time as a Date anchored to today for consistent comparisons
        const ts = parseDateToTimestamp(v);
        return new Date(ts);
      }
      case 'array': return Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : [v]);
      case 'object': return v && typeof v === 'object' ? v : (typeof v === 'string' ? JSON.parse(v) : { value: v });
      default: return typeof v === 'string' ? v : JSON.stringify(v);
    }
  } catch {
    // If conversion fails, return the original so comparisons can still run
    return v;
  }
};

export const deepEqual = (a: any, b: any) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return a === b; } };
export const toTimestamp = (x: any) => parseDateToTimestamp(x);

/**
 * Treat null/undefined as empty. Empty string/array/object are also empty.
 */
export const isValueEmpty = (x: any) => x == null
  ? true
  : Array.isArray(x) || typeof x === 'string'
    ? x.length === 0
    : typeof x === 'object'
      ? Object.keys(x).length === 0
      : false;

/**
 * Accept either a 2-length array or a comma separated string and return a pair.
 */
export const parsePairValues = (v: any): [any, any] => {
  if (Array.isArray(v) && v.length >= 2) return [v[0], v[1]];
  if (typeof v === 'string') {
    const parts = v.split(',').map(s => s.trim());
    if (parts.length >= 2) return [parts[0], parts[1]];
  }
  return [v, v];
};

/**
 * Guess value kind from the raw text the user typed (before resolving expressions).
 * This is only used to order the operator dropdown to the most relevant group.
 */
export const inferKindFromText = (raw: string): ConditionValueKind => {
  if (!raw || typeof raw !== 'string') return 'string';
  const s = raw.trim().replace(/:{2,}/g, ':');
  if (s.startsWith('[') && s.endsWith(']')) return 'array';
  if (s.startsWith('{') && s.endsWith('}')) return 'object';
  if (/^(true|false)$/i.test(s)) return 'boolean';
  if (!isNaN(Number(s)) && s !== '') return 'number';
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s)) return 'time';
  if (ISO_DATE_REGEX.test(s)) return 'date';
  return 'string';
};

// Map value kind to preferred operator group for dropdown filtering
export const getPreferredOperatorGroup = (kind: ConditionValueKind): string => {
  switch (kind) {
    case 'number': return 'Number';
    case 'boolean': return 'Boolean';
    case 'date': return 'Date';
    case 'time': return 'Time';
    case 'array': return 'Array';
    case 'object': return 'Object';
    default: return 'String';
  }
};