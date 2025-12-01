import { ExecutionContext, NodeConfig, NodeExecutionResult } from '../../types';
import { showErrorToast } from '../../components/Toast';
import { evaluateExpression, resolveTemplate } from '../../utilities/expression'
import { UNARY_COMPARATORS, NUMERIC_RIGHT_COMPARATORS, PAIR_COMPARATORS, REGEX_COMPARATORS, KEY_PROP_COMPARATORS, resolveValue, parsePairValues, compareValues, toTimestamp } from '../../utilities/conditionUtils';
import { NodeModel } from '@syncfusion/ej2-react-diagrams';

export async function executeConditionCategory(
  _node: NodeModel,
  nodeConfig: NodeConfig,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  // Route within condition category by node type
  switch (nodeConfig.nodeType) {
    case 'If Condition':
      return executeIfConditionNode(nodeConfig, context);
    case 'Switch Case':
      return executeSwitchNode(nodeConfig, context);
    case 'Filter':
      return executeFilterNode(nodeConfig, context);
    case 'Loop':
      return executeLoopNode(_node, nodeConfig, context);
    case 'Stop':
      return executeStopNode(nodeConfig, context);
    default:
      return { success: false, error: `Unsupported condition node type: ${nodeConfig.nodeType}` };
  }
}

// ---------------- Do Nothing / Stop ----------------
function executeStopNode(nodeConfig?: NodeConfig, context?: ExecutionContext): NodeExecutionResult {
  // Mark success and signal the designer via output. Since Stop node has no outgoing ports,
  // the branch ends naturally. If needed later, the engine can watch this flag to abort all branches.
  const res: NodeExecutionResult = {
    success: true,
    data: {
      stopped: true,
      reason: 'Stop node executed',
      at: new Date().toISOString(),
    },
  };
  try {
    const raw = String((nodeConfig as any)?.settings?.general?.chatResponse ?? '').trim();
    const inputResolvedValue = raw ? resolveTemplate(raw, { context: context as ExecutionContext }) : '';
    if (typeof window !== 'undefined' && inputResolvedValue) {
      window.dispatchEvent(new CustomEvent('wf:chat:assistant-response', { detail: { text: inputResolvedValue, triggeredFrom:'Stop Node' } }));
    }
  } catch {}
  return res;
}

// ---------------- If Condition ----------------
async function executeIfConditionNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  const toast = (title: string, detail: string) => showErrorToast(title, detail);
  const isBlank = (s: unknown) => (typeof s !== 'string') || s.trim().length === 0;

  try {
    // Prefer structured rows; fallback to legacy single expression
    const rows = Array.isArray(nodeConfig.settings?.general?.conditions)
      ? (nodeConfig.settings!.general!.conditions as Array<{ left: string; comparator: string; right: string; joiner?: 'AND' | 'OR' }>)
      : null;

    if (!rows || rows.length === 0) {
      const raw = nodeConfig.settings?.general?.condition ?? '';
      const prepared = resolveTemplate(String(raw), { context }).trim();
      if (!prepared) {
        const msg = 'If Condition: Please configure at least one condition row or a valid expression.';
        toast('If Condition Missing', msg);
        return { success: false, error: msg };
      }
      const result = !!new Function('context', 'evaluateExpression', '"use strict"; return ( ' + prepared + ' );')(context, evaluateExpression);
      return { success: true, data: { conditionResult: result, rowResults: [result], evaluatedAt: new Date().toISOString() } };
    }

    // 1) VALIDATE rows (fail-fast with exact error)
    for (let idx = 0; idx < rows.length; idx++) {
      const { left, comparator, right } = rows[idx];
      const rowNo = idx + 1;

      // 1.a) Left must be provided for ALL comparators (including unary). An empty field = misconfiguration.
      if (isBlank(left)) {
        const msg = `Row ${rowNo}: "Value 1" is required.`;
        toast('If Condition: Missing Input', msg);
        return { success: false, error: msg };
      }

      // 1.b) If comparator needs a right operand, ensure "Value 2" is present
      if (!UNARY_COMPARATORS.has(comparator) && isBlank(right)) {
        const msg = `Row ${rowNo}: "Value 2" is required for "${comparator}".`;
        toast('If Condition: Missing Input', msg);
        return { success: false, error: msg };
      }

      // 1.c) Regex validation
      if (REGEX_COMPARATORS.has(comparator) && !isBlank(right)) {
        try { new RegExp(String(resolveValue(right, context))); } catch (e: any) {
          const msg = `Row ${rowNo}: Invalid regular expression in "Value 2" — ${e?.message ?? 'syntax error'}.`;
          toast('If Condition: Invalid Regex', msg);
          return { success: false, error: msg };
        }
      }

      // 1.d) Pair validation ("between")
      if (PAIR_COMPARATORS.has(comparator) && !isBlank(right)) {
        const rv = resolveValue(right, context);
        const [a, b] = parsePairValues(rv);
        if (a == null || b == null || (String(a).length === 0) || (String(b).length === 0)) {
          const msg = `Row ${rowNo}: "${comparator}" expects two values (e.g., "min,max").`;
          toast('If Condition: Invalid Range', msg);
          return { success: false, error: msg };
        }
      }

      // 1.e) Numeric‑right validation for length/compare
      if (NUMERIC_RIGHT_COMPARATORS.has(comparator) && !isBlank(right)) {
        const num = Number(resolveValue(right, context));
        if (Number.isNaN(num)) {
          const msg = `Row ${rowNo}: "Value 2" must be a number for "${comparator}".`;
          toast('If Condition: Invalid Number', msg);
          return { success: false, error: msg };
        }
      }

      // 1.f) Key/property right required & non-empty string
      if (KEY_PROP_COMPARATORS.has(comparator) && !isBlank(right)) {
        const rtxt = String(resolveValue(right, context)).trim();
        if (!rtxt) {
          const msg = `Row ${rowNo}: "Value 2" must be a non-empty key/property name.`;
          toast('If Condition: Invalid Field', msg);
          return { success: false, error: msg };
        }
      }
    }

    // Evaluate rows
    const rowResults: boolean[] = [];
    let cumulative = true;

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      
      // Resolve left; for unary ops we still resolve left (exist/empty checks), right only when needed
      const leftVal = resolveValue(row.left ?? '', context);
      const rightVal = UNARY_COMPARATORS.has(row.comparator) ? undefined : resolveValue(row.right ?? '', context);

      // Extra type validations on resolved values (date/numeric between) for better messages
      if (row.comparator === 'is between' || row.comparator === 'is not between') {
        // Try numeric first, then date
        const [a, b] = parsePairValues(rightVal);
        const lv = leftVal;
        const bothNum = !Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && !Number.isNaN(Number(lv));
        const bothDate = !Number.isNaN(toTimestamp(a)) && !Number.isNaN(toTimestamp(b)) && !Number.isNaN(toTimestamp(lv));
        if (!bothNum && !bothDate) {
          const msg = `Row ${idx + 1}: "${row.comparator}" requires numeric or date values (e.g., "10,20" or "2024-01-01,2024-12-31").`;
          toast('If Condition: Invalid Range', msg);
          return { success: false, error: msg };
        }
      }

      if (REGEX_COMPARATORS.has(row.comparator)) {
        try { new RegExp(String(rightVal)); } catch (e: any) {
          const msg = `Row ${idx + 1}: Invalid regular expression — ${e?.message ?? 'syntax error'}.`;
          toast('If Condition: Invalid Regex', msg);
          return { success: false, error: msg };
        }
      }

      // Compare
      const ok = compareValues(leftVal, row.comparator, rightVal);
      rowResults.push(ok);
      // Fold with AND/OR
      cumulative = idx === 0 ? ok : (row.joiner === 'OR' ? (cumulative || ok) : (cumulative && ok));
    }

    return {
      success: true,
      data: { conditionResult: Boolean(cumulative), rowResults, evaluatedAt: new Date().toISOString() }
    };

  } catch (error: any) {
    const msg = `If Condition execution failed: ${error?.message ?? String(error)}`;
    showErrorToast('If Condition Failed', msg);
    return { success: false, error: msg };
  }
}

// ---------------- Switch Case ----------------
async function executeSwitchNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  try {
    const gen = nodeConfig.settings?.general ?? {};
    const rules = Array.isArray(gen.rules) ? (gen.rules as Array<{ left: string; comparator: string; right: string }>) : [];
    const enableDefault: boolean = !!gen.enableDefaultPort;

    if (rules.length === 0) {
      const msg = 'Switch Case: Please add at least one case.';
      showErrorToast('Switch Case Missing', msg);
      return { success: false, error: msg };
    }

    // Validate inputs upfront (similar to IF strictness)
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const rowNo = i + 1;
      if (!r || !String(r.left ?? '').trim()) {
        const msg = `Switch Case: Row ${rowNo} — "Value 1" is required.`;
        showErrorToast('Switch Case Missing', msg);
        return { success: false, error: msg };
      }
      if (!UNARY_COMPARATORS.has(r.comparator) && !String(r.right ?? '').trim()) {
        const msg = `Switch Case: Row ${rowNo} — "Value 2" is required for "${r.comparator}".`;
        showErrorToast('Switch Case Missing', msg);
        return { success: false, error: msg };
      }
      if (r.comparator === 'matches regex' && String(r.right ?? '').trim()) {
        try { new RegExp(String(resolveValue(r.right, context))); } catch (e: any) {
          const msg = `Switch Case: Row ${rowNo} — Invalid regex: ${e?.message ?? 'syntax error'}.`;
          showErrorToast('Switch Case Invalid Regex', msg);
          return { success: false, error: msg };
        }
      }
    }

    // Evaluate first-match
    const rowResults: boolean[] = [];
    let matchedIndex: number = -1;

    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const leftVal = resolveValue(r.left ?? '', context);
      const rightVal = UNARY_COMPARATORS.has(r.comparator) ? undefined : resolveValue(r.right ?? '', context);
      const ok = compareValues(leftVal, r.comparator, rightVal);
      rowResults.push(ok);
      if (ok && matchedIndex === -1) matchedIndex = i;
    }

    const matchedPortId = matchedIndex >= 0
      ? `right-case-${matchedIndex + 1}`
      : (enableDefault ? 'right-case-default' : null);

    return {
      success: true,
      data: {
        matchedCaseIndex: matchedIndex >= 0 ? matchedIndex : null,
        matchedPortId,
        defaultTaken: matchedIndex < 0 && enableDefault,
        rowResults
      }
    };
  } catch (error: any) {
    const msg = `Switch Case execution failed: ${error?.message ?? String(error)}`;
    showErrorToast('Switch Case Failed', msg);
    return { success: false, error: msg };
  }
}

// ---------------- Filter ----------------
async function executeFilterNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  try {
    const gen = nodeConfig.settings?.general ?? {};

    // 1) Validate required input list expression (VariablePickerTextBox stores strings)
    const inputExpr = String(gen.input ?? '').trim();
    if (!inputExpr) {
      const msg = 'Filter: Please provide the Items (list) input.';
      showErrorToast('Filter Missing Input', msg);
      return { success: false, error: msg };
    }

    // 2) Resolve input expression -> must be an array
    const resolved = resolveValue(inputExpr, context);
    if (!Array.isArray(resolved)) {
      const got = resolved === null ? 'null' : typeof resolved;
      const msg = `Filter: Items input must resolve to an array. Got ${got}.`;
      showErrorToast('Filter Invalid Input', msg);
      return { success: false, error: msg };
    }
    const inputArr: any[] = resolved as any[];

    // 3) Prefer structured rows (same as IF), else legacy predicate string
    const rows = Array.isArray(gen.conditions)
      ? (gen.conditions as Array<{ left: string; comparator: string; right: string; joiner?: 'AND' | 'OR' }>)
      : null;

    if (!rows || rows.length === 0) {
      const conditionRaw = gen.predicate ?? gen.filterCondition;
      if (!conditionRaw) {
        const msg = 'Filter: Please configure at least one condition row or a predicate.';
        showErrorToast('Filter Missing Condition', msg);
        return { success: false, error: msg };
      }
      const predicateStr = resolveTemplate(String(conditionRaw), { context }).trim();
      const fn = new Function('item', 'context', 'evaluateExpression', '"use strict"; return ( ' + predicateStr + ' );');
      const filtered = inputArr.filter((item: any) => {
        try { return !!fn(item, context, evaluateExpression); } catch { return false; }
      });
      return { success: true, data: { filtered, count: filtered.length } };
    }

    // 4) Strict validation (reuse If Condition logic)
    const isBlank = (s: unknown) => (typeof s !== 'string') || s.trim().length === 0;
    for (let idx = 0; idx < rows.length; idx++) {
      const { left, comparator, right } = rows[idx];
      const rowNo = idx + 1;
      if (isBlank(left)) {
        const msg = `Row ${rowNo}: "Value 1" is required.`;
        showErrorToast('Filter: Missing Input', msg);
        return { success: false, error: msg };
      }
      if (!UNARY_COMPARATORS.has(comparator) && isBlank(right)) {
        const msg = `Row ${rowNo}: "Value 2" is required for "${comparator}".`;
        showErrorToast('Filter: Missing Input', msg);
        return { success: false, error: msg };
      }
      if (REGEX_COMPARATORS.has(comparator) && !isBlank(right)) {
        try { new RegExp(String(resolveValue(String(right), context))); } catch (e: any) {
          const msg = `Row ${rowNo}: Invalid regex — ${e?.message ?? 'syntax error'}.`;
          showErrorToast('Filter: Invalid Regex', msg);
          return { success: false, error: msg };
        }
      }
      if (PAIR_COMPARATORS.has(comparator) && !isBlank(right)) {
        const rv = resolveValue(String(right), context);
        const [a, b] = parsePairValues(rv);
        if (a == null || b == null || String(a).length === 0 || String(b).length === 0) {
          const msg = `Row ${rowNo}: "${comparator}" expects two values (e.g., "min,max").`;
          showErrorToast('Filter: Invalid Range', msg);
          return { success: false, error: msg };
        }
        // Accept either numeric or date ranges
        const sampleLeft = resolveValue(String(rows[idx].left ?? ''), context);
        const numericOk = !Number.isNaN(Number(a)) && !Number.isNaN(Number(b)) && !Number.isNaN(Number(sampleLeft));
        const dateOk = !Number.isNaN(toTimestamp(a)) && !Number.isNaN(toTimestamp(b)) && !Number.isNaN(toTimestamp(sampleLeft));
        if (!numericOk && !dateOk) {
          const msg = `Row ${rowNo}: "${comparator}" requires numeric or date values (e.g., "10,20" or "2024-01-01,2024-12-31").`;
          showErrorToast('Filter: Invalid Range', msg);
          return { success: false, error: msg };
        }
      }
      if (NUMERIC_RIGHT_COMPARATORS.has(comparator) && !isBlank(right)) {
        const num = Number(resolveValue(String(right), context));
        if (Number.isNaN(num)) {
          const msg = `Row ${rowNo}: "Value 2" must be a number for "${comparator}".`;
          showErrorToast('Filter: Invalid Number', msg);
          return { success: false, error: msg };
        }
      }
      if (KEY_PROP_COMPARATORS.has(comparator) && !isBlank(right)) {
        const rtxt = String(resolveValue(String(right), context)).trim();
        if (!rtxt) {
          const msg = `Row ${rowNo}: "Value 2" must be a non-empty key/property name.`;
          showErrorToast('Filter: Invalid Field', msg);
          return { success: false, error: msg };
        }
      }
    }

    // 5) Evaluate conditions per item with $.item available
    const filtered: any[] = [];
    for (const item of inputArr) {
      // Expose current item as $.item
      const augmentedContext: ExecutionContext = {
        ...(context || {}),
        variables: { ...(context?.variables || {}), item },
      } as ExecutionContext;

      let cumulative = true;
      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const leftVal = resolveValue(row.left ?? '', augmentedContext);
        const rightVal = UNARY_COMPARATORS.has(row.comparator) ? undefined : resolveValue(row.right ?? '', augmentedContext);
        const ok = compareValues(leftVal, row.comparator, rightVal);
        cumulative = idx === 0 ? ok : (row.joiner === 'OR' ? (cumulative || ok) : (cumulative && ok));
      }
      if (cumulative) filtered.push(item);
    }

    return { success: true, data: { filtered, filteredCount: filtered.length } };
  } catch (error: any) {
    return { success: false, error: `Filter execution failed: ${error?.message ?? String(error)}` };
  }
}

// ---------------- Loop ----------------
export async function executeLoopNode(
  node: NodeModel,
  nodeConfig: NodeConfig,
  context: ExecutionContext,
): Promise<NodeExecutionResult> {
  try {
    const gen = nodeConfig.settings?.general ?? {};

    const inputExpr = String(gen.input ?? '').trim();
    if (!inputExpr) {
      const msg = 'Loop: Please provide the Items (list) input.';
      showErrorToast('Loop Missing Input', msg);
      return { success: false, error: msg };
    }

    const resolved = resolveValue(inputExpr, context);
    if (!Array.isArray(resolved)) {
      const got = resolved === null ? 'null' : typeof resolved;
      const msg = `Loop: Items input must resolve to an array. Got ${got}.`;
      showErrorToast('Loop Invalid Input', msg);
      return { success: false, error: msg };
    }

    const items = resolved as any[];
    const total = items.length;
    const nodeId = node.id as string;

    const rt: any = (context as any).__runtime ?? ((context as any).__runtime = {});
    const loops: Record<string, any[]> = rt.loopItems ?? (rt.loopItems = {});
    loops[nodeId] = items;

    (context.results as any)[nodeId] = {
      currentloopitem: total > 0 ? items[0] : {},     // object to expose the key even when empty
      currentLoopIndex: total > 0 ? 0 : null,         // 0-based
      currentLoopIteration: total > 0 ? 1 : null,     // 1-based
      currentLoopCount: total,
      currentLoopNodeId: nodeId,
      currentLoopIsFirst: total > 0 ? true : null,
      currentLoopIsLast:  total > 0 ? (total === 1) : null,
    };

    return {
      success: true,
      data: {
        items,
        count: total,
        currentloopitem: total > 0 ? items[0] : {},
        currentLoopIndex: total > 0 ? 0 : null,
        currentLoopIteration: total > 0 ? 1 : null,
        currentLoopCount: total,
        currentLoopNodeId: nodeId,
        currentLoopIsFirst: total > 0 ? true : null,
        currentLoopIsLast:  total > 0 ? (total === 1) : null,
      },
    };
  } catch (error: any) {
    return { success: false, error: `Loop execution failed: ${error?.message ?? String(error)}` };
  }
}

