// src/helper/expression.ts
// Centralized evaluation for {{ ... }} tokens supporting $.a.b and $.a[0].b paths.

import { ExecutionContext } from '../types';

type EvalOptions = {
  context: ExecutionContext;
};

function normalizePath(path: string): string {
  // Turn `fruits[0].name` → `fruits.0.name`
  return path.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
}

function getAtPath(root: any, dotPath: string): any {
  if (!root || !dotPath) return undefined;
  const segs = dotPath.split('.').filter(Boolean).map(s => {
    const n = Number(s);
    return Number.isInteger(n) && String(n) === s ? n : s;
  });
  let cur: any = root;
  for (const seg of segs) {
    if (cur == null) return undefined;
    cur = cur[seg as keyof typeof cur];
  }
  return cur;
}

/** Scan results in creation/execution order and return first match for the path. */
function resolveAcrossResults(context: ExecutionContext, dollarPath: string): any {
  const dotPath = normalizePath(dollarPath);
  const results = context?.results ?? {};

  const segs = dotPath.split('.').filter(Boolean);

  // Case 1: "NodeName#nodeId.rest" -> resolve directly from that node's output
  if (segs.length > 0 && segs[0].includes('#')) {
    const parts = segs[0].split('#');
    const nodeIdPart = parts[1];
    const rest = segs.slice(1).join('.');
    if (nodeIdPart && Object.prototype.hasOwnProperty.call(results, nodeIdPart)) {
      const root = results[nodeIdPart];
      return rest ? getAtPath(root, rest) : root;
    }
  }

  // Case 2: try exact path across all node outputs
  for (const nodeId of Object.keys(results)) {
    const hit = getAtPath(results[nodeId], dotPath);
    if (hit !== undefined) return hit;
  }

  // Case 3a: Resolve by display name via diagram (if available)
  if (segs.length > 1) {
    const label = segs[0];
    const rest = segs.slice(1).join('.');
    const diagram: any = (context as any)?.diagram;
    const nodes: any[] = diagram?.nodes ?? [];
    const match = nodes.find((n: any) => {
      const cfg = (n?.addInfo as any)?.nodeConfig;
      return cfg?.displayName === label || n?.id === label;
    });
    if (match && Object.prototype.hasOwnProperty.call(results, match.id)) {
      const root = results[match.id];
      const hit = rest ? getAtPath(root, rest) : root;
      if (hit !== undefined) return hit;
    }
  }

  // Case 3b: As a last resort, ignore the first segment and try across all nodes
  if (segs.length > 1) {
    const rest = segs.slice(1).join('.');
    for (const nodeId of Object.keys(results)) {
      const hit = getAtPath(results[nodeId], rest);
      if (hit !== undefined) return hit;
    }
  }

  // Fallback to variables (also allow label/skipping)
  const vars = context?.variables ?? {};
  const varHit = getAtPath(vars, dotPath);
  if (varHit !== undefined) return varHit;
  if (segs.length > 1) {
    const rest = segs.slice(1).join('.');
    const varHit2 = getAtPath(vars, rest);
    if (varHit2 !== undefined) return varHit2;
  }
  return undefined;
}

/** Evaluate a bare expression (no outer {{ }}), supporting:
 *   - "$.a.b" or "$.a[0].b" -> resolves across results/variables
 *   - arbitrary JS using "context", "results", "variables", "$get(path)"
 */
export function evaluateExpression(expr: string, opts: EvalOptions): any {
  if (!expr || typeof expr !== 'string') return expr;

  const trimmed = expr.trim();

  // Fast-path: "$.something"
  if (trimmed.startsWith('$.')) {
    const path = trimmed.slice(2);           // drop "$."
    return resolveAcrossResults(opts.context, path);
  }

  // Allow a tiny JS scope if users put expressions (rare inside tokens, but nice to have)
  const scope = {
    context: opts.context,
    results: opts.context?.results ?? {},
    variables: opts.context?.variables ?? {},
    $get: (p: string) => resolveAcrossResults(opts.context, p.startsWith('$.') ? p.slice(2) : p),
  };

  try {
    const fn = new Function(
      'scope',
      `"use strict";
       const { context, results, variables, $get } = scope;
       return ( ${trimmed} );`
    );
    return fn(scope);
  } catch {
    return undefined;
  }
}

/** Replace every {{ ... }} with its evaluated value (stringified if needed). */
export function resolveTemplate(template: string, opts: EvalOptions): string {
  if (typeof template !== 'string') return template as unknown as string;
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, inner) => {
    const val = evaluateExpression(inner, opts);
    return val == null ? '' : String(val);
  });
}

/** Deep evaluation: objects/arrays -> resolve all nested strings with {{ ... }} */
export function deepEvaluate<T = any>(input: T, opts: EvalOptions): T {
  if (typeof input === 'string') {
    return resolveTemplate(input, opts) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map(it => deepEvaluate(it, opts)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const out: any = Array.isArray(input) ? [] : {};
    for (const k of Object.keys(input as any)) {
      out[k] = deepEvaluate((input as any)[k], opts);
    }
    return out as T;
  }
  return input;
}
