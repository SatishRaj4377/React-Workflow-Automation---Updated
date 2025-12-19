import { ExecutionContext, NodeConfig, NodeExecutionResult, ConditionComparator } from '../../types';
import { showErrorToast } from '../../components/Toast';
import { evaluateExpression, resolveTemplate } from '../../utilities/expression'
import { resolveValue, parsePairValues, compareValues, toTimestamp } from '../../utilities/conditionUtils';
import { UNARY_COMPARATORS, NUMERIC_RIGHT_COMPARATORS, PAIR_COMPARATORS, REGEX_COMPARATORS, KEY_PROP_COMPARATORS } from '../../constants';
import { NodeModel } from '@syncfusion/ej2-react-diagrams';

export async function executeConditionCategory(
  _node: NodeModel,
  nodeConfig: NodeConfig,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  // Route condition nodes to their handlers
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
  // Signal a graceful stop; no outgoing ports means the flow ends here
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
  
  try {
    // Get condition rows data
    const rowsOrResult = getIfRows(nodeConfig, context, toast);
    if (!Array.isArray(rowsOrResult)) return rowsOrResult;

    // Validate rows and stop on first error
    const validationError = validateRows(rowsOrResult, context, 'If Condition', toast);
    if (validationError) return validationError;

    // Compare each row and fold results using AND/OR
    const evaluated = evaluateRows(rowsOrResult, context);

    return { success: true, data: { conditionResult: Boolean(evaluated.cumulative), rowResults: evaluated.rowResults, evaluatedAt: new Date().toISOString() } };
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
    const rules = Array.isArray(gen.rules) ? (gen.rules as Array<{ left: string; comparator: ConditionComparator; right: string }>) : [];
    const enableDefault: boolean = !!gen.enableDefaultPort;

    if (rules.length === 0) {
      const msg = 'Switch Case: Please add at least one case.';
      showErrorToast('Switch Case Missing', msg);
      return { success: false, error: msg };
    }

    // Validate each rule for required inputs and formats
    const validateError = validateRows(
      rules.map(r => ({ ...r, joiner: 'OR' as const })),
      context,
      'If Condition',
      (t, d) => showErrorToast(t, d)
    );
    if (validateError) return validateError;

    // Evaluate rules and take the first matching case
    const rowResults: boolean[] = [];
    let matchedIndex: number = -1;

    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const leftVal = resolveValue(r.left ?? '', context);
      const rightVal = UNARY_COMPARATORS.has(r.comparator as ConditionComparator) ? undefined : resolveValue(r.right ?? '', context);
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

    // Ensure a list source is provided and resolves to an array
    const inputExpr = String(gen.input ?? '').trim();
    if (!inputExpr) {
      const msg = 'Filter: Please provide the Items (list) input.';
      showErrorToast('Filter Missing Input', msg);
      return { success: false, error: msg };
    }

    // Resolve the input to a runtime value and type-check it
    const resolved = resolveValue(inputExpr, context);
    if (!Array.isArray(resolved)) {
      const got = resolved === null ? 'null' : typeof resolved;
      const msg = `Filter: Items input must resolve to an array. Got ${got}.`;
      showErrorToast('Filter Invalid Input', msg);
      return { success: false, error: msg };
    }
    const inputArr: any[] = resolved as any[];

    // Use structured rows when present; otherwise execute the legacy predicate
    const rows = Array.isArray(gen.conditions)
      ? (gen.conditions as Array<{ left: string; comparator: ConditionComparator; right: string; joiner?: 'AND' | 'OR' }>)
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

    // Validate rows and stop on first error
    const validateError = validateRows(rows, context, 'Filter', (t, d) => showErrorToast(t, d));
    if (validateError) return validateError;

    // Evaluate each item with $.item available in the context
    const filtered: any[] = [];
    for (const item of inputArr) {
      const augmentedContext: ExecutionContext = {
        ...(context || {}),
        variables: { ...(context?.variables || {}), item },
      } as ExecutionContext;

      const evaluation = evaluateRows(rows, augmentedContext);
      if (evaluation.cumulative) filtered.push(item);
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

// ----- Helper Methods --------------

// Return structured rows or evaluate a legacy boolean expression
function getIfRows(
  nodeConfig: NodeConfig,
  context: ExecutionContext,
  toast: (t: string, d: string) => void
): Array<{ left: string; comparator: ConditionComparator; right: string; joiner?: 'AND' | 'OR' }>|NodeExecutionResult {
  const rows = Array.isArray(nodeConfig.settings?.general?.conditions)
    ? (nodeConfig.settings!.general!.conditions as Array<{ left: string; comparator: ConditionComparator; right: string; joiner?: 'AND' | 'OR' }>)
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
    return { success: true, data: { conditionResult: result, rowResults: [result], evaluatedAt: new Date().toISOString() } } as any;
  }
  return rows;
}

// Validate condition rows and return the first error if any
function validateRows(
  rows: Array<{ left: string; comparator: ConditionComparator; right: string; joiner?: 'AND' | 'OR' }>,
  context: ExecutionContext,
  title: 'If Condition'|'Filter',
  toast: (t: string, d: string) => void
): NodeExecutionResult | null {
  const isBlank = (s: unknown) => (typeof s !== 'string') || s.trim().length === 0;
  for (let index = 0; index < rows.length; index++) {
    const { left, comparator, right } = rows[index];
    const rowNumber = index + 1;

    if (isBlank(left)) {
      const message = `Row ${rowNumber}: "Value 1" is required.`;
      toast(`${title}: Missing Input`, message);
      return { success: false, error: message };
    }

    if (!UNARY_COMPARATORS.has(comparator as ConditionComparator) && isBlank(right)) {
      const message = `Row ${rowNumber}: "Value 2" is required for "${comparator}".`;
      toast(`${title}: Missing Input`, message);
      return { success: false, error: message };
    }

    if (REGEX_COMPARATORS.has(comparator as ConditionComparator) && !isBlank(right)) {
      try { new RegExp(String(resolveValue(right, context))); } catch (e: any) {
        const message = `Row ${rowNumber}: Invalid regular expression in "Value 2" — ${e?.message ?? 'syntax error'}.`;
        toast(`${title}: Invalid Regex`, message);
        return { success: false, error: message };
      }
    }

    if (PAIR_COMPARATORS.has(comparator as ConditionComparator) && !isBlank(right)) {
      const rightResolved = resolveValue(right, context);
      const [first, second] = parsePairValues(rightResolved);
      if (first == null || second == null || (String(first).length === 0) || (String(second).length === 0)) {
        const message = `Row ${rowNumber}: "${comparator}" expects two values (e.g., "min,max").`;
        toast(`${title}: Invalid Range`, message);
        return { success: false, error: message };
      }

      // Additional type check: allow only numeric or date ranges (same behavior as before)
      const leftResolved = resolveValue(String(rows[index].left ?? ''), context);
      const numbersOk = !Number.isNaN(Number(first)) && !Number.isNaN(Number(second)) && !Number.isNaN(Number(leftResolved));
      const datesOk = !Number.isNaN(toTimestamp(first)) && !Number.isNaN(toTimestamp(second)) && !Number.isNaN(toTimestamp(leftResolved));
      if (!numbersOk && !datesOk) {
        const message = `Row ${rowNumber}: "${comparator}" requires numeric or date values (e.g., "10,20" or "2024-01-01,2024-12-31").`;
        toast(`${title}: Invalid Range`, message);
        return { success: false, error: message };
      }
    }

    if (NUMERIC_RIGHT_COMPARATORS.has(comparator as ConditionComparator) && !isBlank(right)) {
      const numericRight = Number(resolveValue(right, context));
      if (Number.isNaN(numericRight)) {
        const message = `Row ${rowNumber}: "Value 2" must be a number for "${comparator}".`;
        toast(`${title}: Invalid Number`, message);
        return { success: false, error: message };
      }
    }

    if (KEY_PROP_COMPARATORS.has(comparator as ConditionComparator) && !isBlank(right)) {
      const rightText = String(resolveValue(right, context)).trim();
      if (!rightText) {
        const message = `Row ${rowNumber}: "Value 2" must be a non-empty key/property name.`;
        toast(`${title}: Invalid Field`, message);
        return { success: false, error: message };
      }
    }
  }
  return null;
}

// Evaluate condition rows and fold their results with AND/OR
function evaluateRows(
  rows: Array<{ left: string; comparator: ConditionComparator; right: string; joiner?: 'AND' | 'OR' }>,
  context: ExecutionContext
): { cumulative: boolean; rowResults: boolean[] } {
  const rowResults: boolean[] = [];
  let cumulative = true;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const leftValue = resolveValue(row.left ?? '', context);
    const rightValue = UNARY_COMPARATORS.has(row.comparator as ConditionComparator) ? undefined : resolveValue(row.right ?? '', context);

    const ok = compareValues(leftValue, row.comparator, rightValue);
    rowResults.push(ok);
    cumulative = index === 0 ? ok : (row.joiner === 'OR' ? (cumulative || ok) : (cumulative && ok));
  }

  return { cumulative, rowResults };
}


