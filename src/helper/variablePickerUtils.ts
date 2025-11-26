import { Diagram } from '@syncfusion/ej2-react-diagrams';
import { ExecutionContext, Variable, VariableGroup } from '../types';
import { getNodeConfig } from './utilities';

// ------ VARIBALE PICKER DATA UTILS ------

/** Try multiple common places where a project's ExecutionContext might store outputs */
function pickNodeOutputFromContext(context: any, nodeId: string): any {
  if (!context) return undefined;
  // Common shapes we've seen across workflow engines
  return (
    context.outputs?.[nodeId] ??
    context.results?.[nodeId] ??
    context.nodeOutputs?.[nodeId] ??
    context.nodes?.[nodeId]?.output ??
    context[nodeId]?.output ??
    context[nodeId] // last-resort: direct bucket
  );
}

/** Derive node type/name from Diagram node (best-effort, with safe fallbacks) */
function getNodeIdentity(
  diagram: Diagram,
  nodeId: string
): { nodeType: string; nodeName: string } {
  const node: any =
    (diagram as any).nameTable?.[nodeId] ??
    ((diagram as any).nodes || []).find((n: any) => n.id === nodeId);

  const nodeConfig = getNodeConfig(node);
  // Prefer explicit category/type fields first, then fall back to label text
  const nodeType =
    nodeConfig?.nodeType ??
    'Node';

  // Prefer explicit displayName/name fields first, then fall back to label or id
  const nodeName =
    nodeConfig?.displayName ??
    nodeId;

  return { nodeType, nodeName };
}

/** Produce VariableGroup for a single node using raw output in context */
export function getNodeOutputAsVariableGroup(
  nodeId: string,
  diagram: Diagram,
  context: ExecutionContext
): VariableGroup | null {
  const raw = pickNodeOutputFromContext(context, nodeId);
  if (raw === undefined) return null; // no output yet for this node
  const variables = flattenJsonToVariables(raw); // emits all leaves, incl. arrays

  const { nodeType, nodeName } = getNodeIdentity(diagram, nodeId);
  return {
    nodeId,
    nodeType,
    nodeName,
    variables,
  };
}

/** Return all predecessor groups (BFS using EJ2 APIs with safe fallback) */
export const getAvailableVariablesForNode = (
  nodeId: string,
  diagram: Diagram,
  context: ExecutionContext
): VariableGroup[] => {
  if (!diagram) return [];

  const predecessors = new Set<string>();
  const queue: string[] = [nodeId];

  const getInEdges = typeof (diagram as any).getInEdges === 'function'
    ? (id: string) => ((diagram as any).getInEdges(id) || []) as string[]
    : (_: string) => [] as string[];

  const getConnector = typeof (diagram as any).getConnectorObject === 'function'
    ? (cid: string) => (diagram as any).getConnectorObject(cid)
    : (_: string): null=> null;

  const allConnectors: any[] = ((diagram as any).connectors || []) as any[];

  while (queue.length) {
    const current = queue.shift()!;

    // Prefer EJ2 API
    const inEdgeIds = getInEdges(current);
    if (inEdgeIds.length) {
      inEdgeIds.forEach((connId) => {
        const conn = getConnector(connId);
        const src = conn?.sourceID;
        if (src && !predecessors.has(src)) {
          predecessors.add(src);
          queue.push(src);
        }
      });
      continue;
    }

    // Fallback scan
    for (const c of allConnectors) {
      if (c?.targetID === current && c?.sourceID) {
        const src = c.sourceID as string;
        if (!predecessors.has(src)) {
          predecessors.add(src);
          queue.push(src);
        }
      }
    }
  }

  const groups = Array.from(predecessors)
    .map((pid) => getNodeOutputAsVariableGroup(pid, diagram, context))
    .filter(Boolean) as VariableGroup[];

  return groups;
};

// ------ JSON VISUALIZER UTILS ------

/** Convert bracket indices to dots, split, and coerce numeric segments */
function normalizeToSegments(key: string): Array<string | number> {
  const normalized = key.replace(/\[(\d+)\]/g, '.$1');
  return normalized
    .split('.')
    .filter(Boolean)
    .map((seg) => {
      const n = Number(seg);
      return Number.isInteger(n) && String(n) === seg ? n : seg;
    });
}

/** Ensure an array has at least (idx + 1) length */
function ensureArrayLength(arr: any[], idx: number) {
  while (arr.length <= idx) arr.push(undefined);
}

/** Convert a plain object with numeric keys to an array, preserving indices */
function objectToArray(obj: Record<string, any>): any[] {
  const out: any[] = [];
  for (const k of Object.keys(obj)) {
    if (/^\d+$/.test(k)) {
      out[Number(k)] = obj[k];
    }
  }
  return out;
}

/** Format a preview for primitives (store full, untruncated) */
function formatPreview(value: any): string | undefined {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value; // keep full string; UI will truncate visually
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined; // containers previewed at parent level
}

/** Infer a simple variable type string */
function inferType(value: any): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value === 'object' ? 'object' : typeof value;
}

/** Build nested JSON from Variable[] using dot/bracket keys (array‑aware) */
export function buildJsonFromVariables(variables: Variable[]): any {
  const root: any = {};

  for (const v of variables) {
    const segs = normalizeToSegments(v.key || '');
    if (segs.length === 0) continue;

    let cur: any = root;

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const isLast = i === segs.length - 1;

      if (isLast) {
        const leafValue = coerceLeafValue(v);
        if (typeof seg === 'number') {
          if (!Array.isArray(cur)) {
            // Convert object-like current to array-like in place
            const arr = objectToArray(cur || {});
            for (const k of Object.keys(cur || {})) delete cur[k];
            arr.forEach((val, idx) => (cur[idx] = val));
          }
          ensureArrayLength(cur, seg);
          cur[seg] = leafValue;
        } else {
          cur[seg] = leafValue;
        }
        continue;
      }

      const nextSeg = segs[i + 1];
      const wantArray = typeof nextSeg === 'number';

      if (typeof seg === 'number') {
        // Ensure current is array
        if (!Array.isArray(cur)) {
          const arr = objectToArray(cur || {});
          for (const k of Object.keys(cur || {})) delete cur[k];
          arr.forEach((val, idx) => (cur[idx] = val));
        }
        ensureArrayLength(cur, seg);
        const next = cur[seg];
        if (
          next === undefined ||
          next === null ||
          (wantArray && !Array.isArray(next)) ||
          (!wantArray && Array.isArray(next)) ||
          typeof next !== 'object'
        ) {
          cur[seg] = wantArray ? [] : {};
        }
        cur = cur[seg];
      } else {
        // seg is key on object
        const current = cur[seg];
        if (
          current === undefined ||
          current === null ||
          (wantArray && !Array.isArray(current)) ||
          (!wantArray && Array.isArray(current)) ||
          typeof current !== 'object'
        ) {
          cur[seg] = wantArray ? [] : {};
        }
        cur = cur[seg];
      }
    }
  }

  return root;
}

/** Walk raw JSON and emit Variables for every leaf key */
export function flattenJsonToVariables(
  root: any,
  baseKey = '',
  basePath = '$'
): Variable[] {
  const out: Variable[] = [];

  const visit = (val: any, keyParts: (string | number)[], path: string) => {
    const t = inferType(val);

    if (t === 'object') {
      for (const k of Object.keys(val)) {
        const nextParts = [...keyParts, k];
        const nextPath = path === '$' ? `$.${k}` : `${path}.${k}`;
        visit(val[k], nextParts, nextPath);
      }
      return;
    }

    if (t === 'array') {
      (val as any[]).forEach((item, idx) => {
        const nextParts = [...keyParts, idx];
        const nextPath = `${path}[${idx}]`;
        visit(item, nextParts, nextPath);
      });
      return;
    }

    // Primitive leaf → emit
    const dotKey = keyParts
      .map((p) => (typeof p === 'number' ? String(p) : p))
      .join('.');
    out.push({
      key: dotKey,             // e.g., "fruits.1.details.type"
      path,                    // e.g., "$.fruits[1].details.type"
      type: t as any,          // keep your Variable['type'] compatibility
      preview: formatPreview(val),
    } as Variable);
  };

  // Root may be a primitive; give it a friendly key
  if (inferType(root) === 'object' || inferType(root) === 'array') {
    visit(root, baseKey ? [baseKey] : [], basePath);
  } else {
    out.push({
      key: baseKey || 'value',
      path: basePath,
      type: inferType(root) as any,
      preview: formatPreview(root),
    } as Variable);
  }

  return out;
}

// Normalize type label
function normType(t: any): string {
  return typeof t === 'string' ? t.toLowerCase() : t;
}

// Coerce preview into the correct primitive based on v.type
function coerceLeafValue(v: Variable): any {
  const t = normType((v as any).type);
  const p = (v as any).preview;

  switch (t) {
    case 'number': {
      const n = typeof p === 'number' ? p : Number(p);
      return Number.isFinite(n) ? n : null; // fall back if preview isn't numeric
    }
    case 'boolean': {
      if (typeof p === 'boolean') return p;
      if (typeof p === 'string') {
        const s = p.trim().toLowerCase();
        if (s === 'true') return true;
        if (s === 'false') return false;
      }
      return null; // unknown boolean preview → null
    }
    case 'null':
      return null;
    case 'string':
      return typeof p === 'string' ? p : String(p ?? '');
    // For object/array/any we can't reconstruct full structure from a leaf;
    // keep preview (string) or null. The container nodes show correct types/counts.
    default:
      return p ?? null;
  }
}

// ------ VARIABLE PICKER DOM UTIL ------

// Insert text at caret for EJ2 input/textarea
export function insertAtCaret(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLElement,
  text: string
): { nextValue: string; nextCaret: number } {
  // Input / textarea case
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const nextValue = el.value.slice(0, start) + text + el.value.slice(end);
    const nextCaret = start + text.length;
    return { nextValue, nextCaret };
  }

  // Contenteditable / generic HTMLElement case: insert text at caret inside the element
  try {
    const doc = (el.ownerDocument || document) as Document;
    const selection = doc.getSelection ? doc.getSelection() : window.getSelection();
    if (selection && selection.rangeCount > 0) {
      let range = selection.getRangeAt(0);
      // If current selection is not inside our element, move caret to end of element
      if (!el.contains(range.commonAncestorContainer)) {
        const r = doc.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        selection.removeAllRanges();
        selection.addRange(r);
        range = r;
      }

      // Insert text node
      const textNode = doc.createTextNode(text);
      range.deleteContents();
      range.insertNode(textNode);
      // Move caret after inserted node
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // No selection available — append to existing HTML to avoid creating new wrapper nodes
      try {
        // Preserve existing markup and simply append the token string
        (el as HTMLElement).innerHTML = (el as HTMLElement).innerHTML + text;
      } catch (e) {
        // Fallback to node append if innerHTML assignment fails
        el.appendChild(doc.createTextNode(text));
      }
    }
  } catch (e) {
    // ignore insertion errors
  }

  const nextValue = (el as HTMLElement).innerHTML ?? '';
  return { nextValue, nextCaret: -1 };
}

// Find the native EJ2 input/textarea inside the TextBox wrapper
export function findNativeInput(container: HTMLElement | null) {
  if (!container) return null;
  return container.querySelector(
    'input.e-input, textarea.e-input'
  ) as HTMLInputElement | HTMLTextAreaElement | null;
}

// Ensure a portal root for the popup
export function ensurePortalRoot(): HTMLElement {
  let root = document.getElementById('popup-portal-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'popup-portal-root';
    document.body.appendChild(root);
  }
  return root;
}