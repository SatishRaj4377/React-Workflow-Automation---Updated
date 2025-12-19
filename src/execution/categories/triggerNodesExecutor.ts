import { NodeModel } from '@syncfusion/ej2-react-diagrams';
import { ExecutionContext, NodeConfig, NodeExecutionResult } from '../../types';
import { showErrorToast } from '../../components/Toast';

export async function executeTriggerCategory(
  _node: NodeModel,
  nodeConfig: NodeConfig,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  switch (nodeConfig.nodeType) {
    case 'Chat':
      return executeChatTriggerNode();

    case 'Form':
      return executeFormTriggerNode(nodeConfig);

    case 'Manual Trigger':
      return {
        success: true,
        data: {
          triggered: true,
          triggeredAt: new Date().toISOString(),
          inputContext: context.variables
        }
      };

    default:
      return { success: false, error: `Unsupported trigger node type: ${nodeConfig.nodeType}` };
  }
}

// ---------------- Form Trigger ----------------
async function executeFormTriggerNode(nodeConfig: NodeConfig): Promise<NodeExecutionResult> {
  try {
    // Read config
    const title = ((nodeConfig.settings as any)?.general?.formTitle ?? '').trim();
    const description = (nodeConfig.settings as any)?.general?.formDescription ?? '';
    const fields = Array.isArray((nodeConfig.settings as any)?.general?.formFields)
      ? (nodeConfig.settings as any).general.formFields
      : [];

    // Validate config
    const validation = validateFormConfig(title, fields);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Wait for submit
    const submitted = await waitForFormSubmit(title, description, fields);

    // Map values
    const valueRows = mapFormValues(fields, submitted);

    // Build dictionary
    const data = buildFormDataDictionary(valueRows);

    // Final payload
    return {
      success: true,
      data: {
        triggered: true,
        submittedAt: submitted.at,
        title,
        description,
        values: valueRows,
        fields,
        data,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Form trigger failed';
    if (message === 'Form trigger cancelled') {
      return { success: false, error: message };
    }
    showErrorToast('Form Trigger Error', message);
    return { success: false, error: message };
  }
}

// ---------------- Chat Trigger ----------------
async function executeChatTriggerNode(): Promise<NodeExecutionResult> {
  try {
    const message = await waitForChatMessage();

    // Success payload
    return {
      success: true,
      data: {
        triggered: true,
        message,
        triggeredAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Chat trigger failed' };
  }
}

function slugify(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Helper: compute limited date details for reporting
function buildDateDetails(d: Date) {
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1-12
  const day = d.getDate(); // 1-31
  const weekday = d.getDay(); // 0-6 (0=Sunday)
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    year,
    month,
    day,
    weekday,
    weekdayName: weekdayNames[weekday]
  };
}

// ----- Helper Methods --------------

// Validates the form trigger configuration
function validateFormConfig(title: string, fields: any[]): { valid: boolean; error?: string } {
  const invalid = !title || fields.length === 0 || fields.some((f: any) => {
    if (!f || !f.type) return true;
    if (!f.label || String(f.label).trim() === '') return true;
    if (f.type === 'dropdown') {
      const opts = Array.isArray(f.options) ? f.options.filter((o: any) => String(o).trim() !== '') : [];
      if (opts.length === 0) return true;
    }
    return false;
  });
  if (invalid) {
    const msg = 'Form trigger misconfigured. Ensure title and valid fields (labels, options for dropdowns) are set.';
    showErrorToast('Form Trigger Configuration', msg);
    return { valid: false, error: msg };
  }
  return { valid: true };
}

// Waits for the form to be submitted or cancelled
async function waitForFormSubmit(title: string, description: string, fields: any[]): Promise<{ values: string[]; at: string }> {
  const waitForSubmit = () =>
    new Promise<{ values: string[]; at: string }>((resolve, reject) => {
      const onSubmitted = (e: Event) => {
        const ce = e as CustomEvent<{ values?: string[]; at?: string }>;
        const vals = Array.isArray(ce.detail?.values) ? ce.detail!.values : [];
        cleanup();
        resolve({ values: vals, at: ce.detail?.at || new Date().toISOString() });
      };
      const onCancel = () => {
        const err = new Error('Form trigger cancelled');
        cleanup(err);
      };
      const cleanup = (err?: Error) => {
        window.removeEventListener('wf:form:submitted', onSubmitted as EventListener);
        window.removeEventListener('wf:form:cancel', onCancel as EventListener);
        if (err) reject(err);
      };
      window.addEventListener('wf:form:submitted', onSubmitted as EventListener, { once: true });
      window.addEventListener('wf:form:cancel', onCancel as EventListener, { once: true });
    });

  const pending = waitForSubmit();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wf:form:open', { detail: { title, description, fields } }));
    window.dispatchEvent(new CustomEvent('wf:trigger:waiting', { detail: { type: 'Form' } }));
  }

  const submitted = await pending;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wf:trigger:resumed'));
  }

  return submitted;
}

// Maps submitted values back with labels and types
function mapFormValues(fields: any[], submitted: { values: string[]; at: string }): any[] {
  return fields.map((f: any, i: number) => {
    const label = f?.label ?? `field_${i + 1}`;
    const type = f?.type ?? 'text';
    const rawVal = submitted.values?.[i] ?? '';

    let details: Record<string, any> | undefined;
    if (type === 'date' && rawVal) {
      const d = new Date(rawVal);
      if (!isNaN(d.getTime())) details = buildDateDetails(d);
    }

    return details ? { label, type, value: rawVal, details } : { label, type, value: rawVal };
  });
}

// Builds dictionary by slugified label
function buildFormDataDictionary(valueRows: any[]): Record<string, any> {
  const byLabel: Record<string, any> = {};
  valueRows.forEach((r: { label: string; value: any; type?: string; details?: Record<string, any> }) => {
    const key = slugify(r.label);
    if (r.type === 'date') {
      const d = r.value ? new Date(r.value) : null;
      if (d && !isNaN(d.getTime())) {
        byLabel[key] = { value: r.value, ...buildDateDetails(d) };
        return;
      }
    }
    byLabel[key] = r.value;
  });
  return byLabel;
}

// Waits for a chat message or cancel
async function waitForChatMessage(): Promise<{ text: string; at: string }> {
  const waitForMessage = () =>
    new Promise<{ text: string; at: string }>((resolve, reject) => {
      const onMessage = (e: Event) => {
        const ce = e as CustomEvent<{ text?: string; at?: string }>;
        const text = (ce.detail?.text || '').trim();
        if (text.length > 0) {
          cleanup();
          resolve({ text, at: ce.detail?.at || new Date().toISOString() });
        }
      };
      const onCancel = () => {
        const err = new Error('Chat trigger cancelled');
        cleanup(err);
      };
      const cleanup = (err?: Error) => {
        window.removeEventListener('wf:chat:message', onMessage as EventListener);
        window.removeEventListener('wf:chat:cancel', onCancel as EventListener);
        if (err) reject(err);
      };
      window.addEventListener('wf:chat:message', onMessage as EventListener, { once: true });
      window.addEventListener('wf:chat:cancel', onCancel as EventListener, { once: true });
    });

  const pending = waitForMessage();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wf:chat:open', { detail: { reason: 'chat-trigger' } }));
    window.dispatchEvent(new CustomEvent('wf:chat:ready'));
  }

  return await pending;
}