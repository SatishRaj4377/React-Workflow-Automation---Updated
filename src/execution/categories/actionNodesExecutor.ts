import { ExecutionContext, NodeConfig, NodeExecutionResult } from '../../types';
import { NodeModel } from '@syncfusion/ej2-react-diagrams';
import { showErrorToast, showToast } from '../../components/Toast';
import { resolveTemplate } from '../../utilities/expression';
import { createDocxFromHtml, appendHtmlToDocx, downloadBlob } from '../../utilities/wordExecutionUtils';

export async function executeActionCategory(
  _node: NodeModel,
  nodeConfig: NodeConfig,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  switch (nodeConfig.nodeType) {
    case 'HTTP Request':
      return executeHttpRequestNode(nodeConfig, context);
    case 'Word':
      return executeWordNode(nodeConfig, context);
    case 'Excel':
      return executeExcelNode(nodeConfig, context);
    case 'Notify':
      return executeNotifyNode(nodeConfig, context);

    default:
      return { success: false, error: `Unsupported trigger node type: ${nodeConfig.nodeType}` };
  }
}

// ---------------- Word ----------------
async function executeWordNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  try {
    const gen = (nodeConfig.settings?.general ?? {}) as any;
    const op = String(gen.operation ?? '').trim();

    // Validate configuration
    const validation = validateWordConfig(gen);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { fileSource, defaultFileKey, fileName } = validation;

    // Dispatch by operation
    switch (op) {
      case 'Read': {
        return await executeWordReadOperation(gen, nodeConfig, context, fileName, fileSource);
      }

      case 'Write': {
        return await executeWordWriteOperation(gen, nodeConfig, context);
      }

      case 'Update (Mapper)': {
        return await executeWordUpdateOperation(gen, nodeConfig, context);
      }

      default: {
        const msg = 'Word: Unsupported or missing operation.';
        showErrorToast('Word: Operation error', msg);
        return { success: false, error: msg };
      }
    }
  } catch (err: any) {
    const message = (err?.message ?? `${err}`)?.toString();
    return { success: false, error: message };
  }
}

// ---------------- Notify ----------------
async function executeNotifyNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  const gen = (nodeConfig.settings?.general ?? {}) as any;
  const rawTitle = String(gen.title ?? 'Notification');
  const rawMessage = String(gen.message ?? '').trim();
  const rawType = String(gen.type ?? 'info') as 'success' | 'error' | 'info' | 'warning';

  // Resolve templates
  const title = resolveTemplate(rawTitle, { context });
  const content = resolveTemplate(rawMessage, { context });

  // Show toast using modern variant
  showToast({ id: `notify-${Date.now()}`, title, content, type: rawType, variant: 'notification' });

  // Sound cue
  const { playNotificationSound } = await import('../../utilities/soundUtils');
  playNotificationSound(rawType);

  const out: NodeExecutionResult = { success: true, data: { shown: true, title, content, type: rawType, variant: 'notification' } };
  try {
    const raw = String((nodeConfig.settings as any)?.general?.chatResponse ?? '').trim();
    const inputResolvedValue = raw ? resolveTemplate(raw, { context }) : '';
    if (typeof window !== 'undefined' && inputResolvedValue) {
      window.dispatchEvent(new CustomEvent('wf:chat:assistant-response', { detail: { text: inputResolvedValue, triggeredFrom:'Notify Node' } }));
    }
  } catch {}
  return out;
}

// ---------------- Excel ----------------
async function executeExcelNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  try {
    const gen = (nodeConfig.settings?.general ?? {}) as any;
    const op = String(gen.operation ?? '').trim();

    // Validate configuration
    const validation = validateExcelConfig(gen);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const { fileSource, defaultFileKey, fileName } = validation;

    const XLSX = (await import('xlsx')).default || (await import('xlsx'));

    // Dispatch by operation
    switch (op) {
      case 'Create Sheet': {
        return await executeExcelCreateSheet(gen, nodeConfig, context, XLSX);
      }

      case 'Delete Sheet': {
        return await executeExcelDeleteSheet(gen, nodeConfig, context, XLSX);
      }

      case 'Append Row': {
        return await executeExcelAppendRow(gen, nodeConfig, context, XLSX);
      }

      case 'Update Row': {
        return await executeExcelUpdateRow(gen, nodeConfig, context, XLSX);
      }

      case 'Delete Row/Column': {
        return await executeExcelDeleteRowColumn(gen, nodeConfig, context, XLSX);
      }

      case 'Get Rows': {
        return await executeExcelGetRows(gen, nodeConfig, context, XLSX);
      }

      default: {
        const msg = 'Excel: Unsupported or missing operation.';
        showErrorToast('Excel: Operation error', msg);
        return { success: false, error: msg };
      }
    }
  } catch (err: any) {
    const message = (err?.message ?? `${err}`)?.toString();
    return { success: false, error: message };
  }
}

// ---------------- HTTP Request ----------------
async function executeHttpRequestNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  try {
    const general = (nodeConfig.settings?.general ?? {}) as any;

    // Resolve and validate URL with query params
    const urlResult = validateAndBuildUrl(general, context);
    if (!urlResult.valid) {
      return { success: false, error: urlResult.error };
    }
    const { urlObj, method, qpArray } = urlResult;

    // Resolve headers
    const headersResult = resolveHeaders(general, context);
    if (headersResult.error) {
      return { success: false, error: headersResult.error };
    }

    // Execute the request and process response
    return await executeHttpFetch(urlObj, method, headersResult.data, qpArray, context);
  } catch (err: any) {
    const message = (err?.message ?? `${err}`)?.toString();
    showErrorToast('HTTP Request Failed', message);
    return { success: false, error: message };
  }
}

// ----- Helper Methods --------------

// Validates and builds the URL with query parameters
function validateAndBuildUrl(general: any, context: ExecutionContext): { valid: boolean; error?: string; urlObj?: URL; method?: string; qpArray?: Array<{ key: string; value: string }> } {
  const rawUrl = resolveTemplate(String(general.url ?? ''), { context }).trim();
  if (!rawUrl) {
    const msg = 'HTTP Request: Please provide a URL.';
    showErrorToast('HTTP Request Missing URL', msg);
    return { valid: false, error: msg };
  }

  const method = 'GET';
  const qpArray: Array<{ key: string; value: string }> = Array.isArray(general.queryParams) ? general.queryParams : [];

  let urlObj: URL;
  try {
    urlObj = new URL(rawUrl);
  } catch {
    const msg = 'HTTP Request: Invalid URL. Provide a valid absolute URL starting with http(s)://';
    showErrorToast('HTTP Request Invalid URL', msg);
    return { valid: false, error: msg };
  }
  if (!/^https?:$/i.test(urlObj.protocol)) {
    const msg = 'HTTP Request: Only http(s) URLs are supported.';
    showErrorToast('HTTP Request Unsupported Protocol', msg);
    return { valid: false, error: msg };
  }

  for (const row of qpArray) {
    const name = resolveTemplate(String(row?.key ?? ''), { context }).trim();
    if (!name) continue;
    const value = resolveTemplate(String(row?.value ?? ''), { context });
    urlObj.searchParams.append(name, String(value));
  }

  return { valid: true, urlObj, method, qpArray };
}

// Resolves and parses headers from JSON string
function resolveHeaders(general: any, context: ExecutionContext): { error?: string; data?: Record<string, string> } {
  if (general.headers && String(general.headers).trim().length > 0) {
    try {
      const headersStr = resolveTemplate(String(general.headers), { context });
      const parsed = JSON.parse(headersStr || '{}');
      const headers = Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, v != null ? String(v) : ''])
      );
      return { data: headers };
    } catch (e: any) {
      const msg = 'HTTP Request: Headers must be valid JSON.';
      showErrorToast('HTTP Request Invalid Headers', msg);
      return { error: msg };
    }
  }
  return { data: undefined };
}

// Executes the HTTP fetch and processes the response
async function executeHttpFetch(urlObj: URL, method: string, headers: Record<string, string> | undefined, qpArray: Array<{ key: string; value: string }>, context: ExecutionContext): Promise<NodeExecutionResult> {
  const requestInit: RequestInit = { method, headers };

  const startedAt = Date.now();
  const response = await fetch(urlObj.toString(), requestInit);
  const elapsedMs = Date.now() - startedAt;

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { responseHeaders[k] = v; });

  const contentType = response.headers.get('content-type') || '';
  let bodyJson: any = null;
  let bodyText: string | null = null;
  try {
    if (/json/i.test(contentType)) {
      bodyJson = await response.json();
    } else {
      bodyText = await response.text();
    }
  } catch {
    try {
      bodyText = await response.text();
    } catch {
      bodyText = null;
    }
  }

  const resultPayload = {
    url: urlObj.toString(),
    method,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    elapsedMs,
    request: {
      queryParams: qpArray.map(q => ({
        key: resolveTemplate(String(q?.key ?? ''), { context }).trim(),
        value: resolveTemplate(String(q?.value ?? ''), { context }),
      })),
      headers: headers ?? {},
    },
    response: {
      headers: responseHeaders,
      contentType,
    },
    body: bodyJson ?? bodyText,
  };

  if (!response.ok) {
    const msg = `HTTP ${response.status} ${response.statusText}`;
    return { success: false, error: msg, data: resultPayload } as NodeExecutionResult;
  }

  return { success: true, data: resultPayload };
}

// Validates the Word node configuration settings
function validateWordConfig(gen: any): { valid: boolean; error?: string; fileSource?: string; defaultFileKey?: string; fileName?: string } {
  const fileSource = String(gen.fileSource ?? '').trim();
  const defaultFileKey = String(gen.defaultFileKey ?? '').trim();
  const fileName = String(gen.fileName ?? '').trim();

  if (!fileSource || (!defaultFileKey && fileSource === 'default') || (!fileName && fileSource === 'device')) {
    const msg = 'Word: Please select a document (upload or choose a template) in the configuration panel.';
    showErrorToast('Word: No document selected', msg);
    return { valid: false, error: msg };
  }

  const op = String(gen.operation ?? '').trim();
  if (!op) {
    const msg = 'Word: Please choose an operation (Write, Read, or Update).';
    showErrorToast('Word: Operation missing', msg);
    return { valid: false, error: msg };
  }

  return { valid: true, fileSource, defaultFileKey, fileName };
}

// Executes the Word Read operation
async function executeWordReadOperation(gen: any, nodeConfig: NodeConfig, context: ExecutionContext, fileName: string, fileSource: string): Promise<NodeExecutionResult> {
  const buf = await loadSelectedWordFile(gen, nodeConfig);
  // Extract plain text from all XML parts
  const { default: PizZip } = await import('pizzip');
  const zip = new PizZip(buf);
  const keys = Object.keys(zip.files).filter(k => k.startsWith('word/') && k.endsWith('.xml'));
  const pieces: string[] = [];
  for (const k of keys) {
    const xml = zip.file(k)?.asText() || '';
    const text = xml.replace(/<[^>]+>/g, '');
    pieces.push(text);
  }
  const fullText = pieces.join('\n').trim();
  const out: NodeExecutionResult = { success: true, data: { fileName, source: fileSource, operation: 'Read', text: fullText, length: fullText.length } };
  dispatchChatResponse(nodeConfig, context, 'Word Node');
  return out;
}

// Executes the Word Write operation
async function executeWordWriteOperation(gen: any, nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  const write = (gen.write ?? {}) as any;
  const mode: 'Append' | 'Overwrite' = (write.mode === 'Overwrite' ? 'Overwrite' : 'Append');
  const rawHtml = String(write.content ?? '').trim();
  
  if (!rawHtml) {
    const msg = 'Word Write: Enter content in the editor before running.';
    showErrorToast('Word: No content', msg);
    return { success: false, error: msg };
  }

  // Resolve {{variables}} in HTML
  const resolvedHtml = resolveTemplate(rawHtml, { context });

  let downloaded = false;
  try {
    let outBlob: Blob;

    if (mode === 'Append') {
      try {
        const originalBuf = await loadSelectedWordFile(gen, nodeConfig);
        outBlob = await appendHtmlToDocx(originalBuf, resolvedHtml);
      } catch {
        // Fallback when original cannot be loaded
        outBlob = await createDocxFromHtml(resolvedHtml);
      }
    } else {
      // Overwrite
      outBlob = await createDocxFromHtml(resolvedHtml);
    }

    const baseName = (String(gen.fileName ?? 'Document')).replace(/\.(docx?|DOCX?)$/, '');
    const suffix = mode === 'Append' ? '-appended.docx' : '-overwritten.docx';
    const safeName = baseName.concat(suffix);
    downloadBlob(outBlob, safeName);
    downloaded = true;
  } catch (e: any) {
    console.error('DOCX generation failed:', e);
    showErrorToast('Word: DOCX export failed', e?.message || 'Could not generate file');
  }

  const out: NodeExecutionResult = {
    success: true,
    data: {
      operation: 'Write',
      mode,
      html: rawHtml,
      resolvedHtml,
      downloaded,
    },
  };
  dispatchChatResponse(nodeConfig, context, 'Word Node');
  return out;
}

// Executes the Word Update operation
async function executeWordUpdateOperation(gen: any, nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  const update = (gen.update ?? {}) as any;
  const rawValues = (update.values ?? {}) as Record<string, any>;
  const keys = Object.keys(rawValues || {});
  if (keys.length === 0) {
    const msg = 'Word Update: No placeholders provided to update the document.';
    showErrorToast('Word: Missing placeholders', msg);
    return { success: false, error: msg };
  }

  // Resolve each value through the template system
  const dataMap: Record<string, any> = {};
  for (const k of keys) {
    const val = resolveTemplate(String(rawValues[k] ?? ''), { context });
    if (val === undefined || val === null || String(val).length === 0) {
      const msg = `Word Update: Value missing for placeholder "${k}".`;
      showErrorToast('Word: Value missing', msg);
      return { success: false, error: msg };
    }
    dataMap[k] = val;
  }

  const buf = await loadSelectedWordFile(gen, nodeConfig);
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'),
    import('docxtemplater'),
  ]);
  try {
    const zip = new PizZip(buf);
    const doc = new (Docxtemplater as any)(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      // Avoid MultiError on missing tags; render missing values as empty strings
      nullGetter: () => '',
    });
    doc.setData(dataMap);
    doc.render();
    const out: Blob = doc.getZip().generate({ type: 'blob' });
    const baseName = (String(gen.fileName ?? 'Document')).replace(/\.(docx?|DOCX?)$/, '');
    const outName = baseName.concat('-updated.docx');
    downloadBlob(out, outName);
    const res: NodeExecutionResult = {
      success: true,
      data: { operation: 'Update', placeholders: Object.keys(dataMap), downloadedFile: outName },
    };
    dispatchChatResponse(nodeConfig, context, 'Word Node');
    return res;
  } catch (e: any) {
    // Surface meaningful docxtemplater MultiError details when available
    const details = Array.isArray(e?.errors)
      ? e.errors.map((er: any) => er?.properties?.explanation || er?.message).filter(Boolean).join('; ')
      : '';
    const message = details || e?.message || 'Template replacement failed.';
    showErrorToast('Word Update Failed', message);
    return { success: false, error: message };
  }
}

// Builds default files list dynamically (mirror UI logic)
function loadDefaultWordFiles(): Array<{ key: string; name: string; url: string }> {
  try {
    const ctx = (require as any).context('../../data/Word Files', false, /\.docx?$/i);
    const keys = ctx.keys();
    return keys.map((k: string) => {
      const url: string = ctx(k)?.default || ctx(k);
      const file = k.split('/').pop() || k;
      const base = file.replace(/\.(docx?|DOCX?)$/, '');
      const name = base.replace(/[\-_]+/g, ' ').trim();
      const key = base.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return { key, name, url };
    });
  } catch {
    return [];
  }
}

// Loads the selected Word file as ArrayBuffer
async function loadSelectedWordFile(gen: any, nodeConfig: NodeConfig): Promise<ArrayBuffer> {
  const fileSource = String(gen.fileSource ?? '').trim();
  const defaultFileKey = String(gen.defaultFileKey ?? '').trim();
  if (fileSource === 'default') {
    try {
      const files = loadDefaultWordFiles();
      const match = files.find(f => f.key === defaultFileKey);
      if (!match) throw new Error('Unknown default template key');
      const res = await fetch(match.url);
      if (!res.ok) throw new Error(`Failed to load template (HTTP ${res.status})`);
      return await res.arrayBuffer();
    } catch (e: any) {
      const message = e?.message || 'Unable to load the selected template.';
      showErrorToast('Word: Load failed', message);
      throw e;
    }
  }

  // Handle device upload selected in the current session using blob URL persisted in settings
  if (fileSource === 'device') {
    const blobUrl = String((nodeConfig.settings?.general as any)?.deviceFileUrl || '').trim();
    if (!blobUrl) {
      const msg = 'Word: Local file is not available at runtime. Reattach the file in the node settings and run again.';
      showErrorToast('Word: Missing local file', msg);
      throw new Error(msg);
    }
    try {
      const res = await fetch(blobUrl);
      if (!res.ok) throw new Error(`Failed to access local file (HTTP ${res.status})`);
      return await res.arrayBuffer();
    } catch (e: any) {
      const message = e?.message || 'Unable to read the local file. Please reattach it.';
      showErrorToast('Word: Local file error', message);
      throw e;
    }
  }

  const msg = 'Word: Unknown file source.';
  showErrorToast('Word: Load failed', msg);
  throw new Error(msg);
}

// Dispatches chat response event if configured
function dispatchChatResponse(nodeConfig: NodeConfig, context: ExecutionContext, triggeredFrom: string) {
  try {
    const raw = String((nodeConfig.settings as any)?.general?.chatResponse ?? '').trim();
    const inputResolvedValue = raw ? resolveTemplate(raw, { context }) : '';
    if (typeof window !== 'undefined' && inputResolvedValue) {
      window.dispatchEvent(new CustomEvent('wf:chat:assistant-response', { detail: { text: inputResolvedValue, triggeredFrom } }));
    }
  } catch {}
}

// Validates the Excel node configuration settings
function validateExcelConfig(gen: any): { valid: boolean; error?: string; fileSource?: string; defaultFileKey?: string; fileName?: string } {
  const fileSource = String(gen.fileSource ?? '').trim();
  const defaultFileKey = String(gen.defaultFileKey ?? '').trim();
  const fileName = String(gen.fileName ?? '').trim();

  if (!fileSource || (!defaultFileKey && fileSource === 'default') || (!fileName && fileSource === 'device')) {
    const msg = 'Excel: Please select a document (upload or choose a template) in the configuration panel.';
    showErrorToast('Excel: No document selected', msg);
    return { valid: false, error: msg };
  }

  const op = String(gen.operation ?? '').trim();
  if (!op) {
    const msg = 'Excel: Please choose an operation.';
    showErrorToast('Excel: Operation missing', msg);
    return { valid: false, error: msg };
  }

  return { valid: true, fileSource, defaultFileKey, fileName };
}

// Executes the Excel Create Sheet operation
async function executeExcelCreateSheet(gen: any, nodeConfig: NodeConfig, context: ExecutionContext, XLSX: any): Promise<NodeExecutionResult> {
  const title = resolveTemplate(String(gen.title ?? ''), { context }).trim();
  if (!title) {
    const msg = 'Create Sheet: Please provide a Title.';
    showErrorToast('Excel Missing Fields', msg);
    return { success: false, error: msg };
  }

  // Optional headers
  const headers: string[] = Array.isArray(gen.create?.headers) ? gen.create.headers : [];

  let wb;
  try {
    const buf = await loadSelectedExcelFile(gen, nodeConfig);
    wb = XLSX.read(buf, { type: 'array' });
  } catch {
    // If failing to read, start a new workbook
    wb = XLSX.utils.book_new();
  }

  // If sheet exists, we still proceed but mark createdNew=false
  const exists = (wb.SheetNames || []).includes(title);
  const ws = XLSX.utils.aoa_to_sheet(headers && headers.length ? [headers] : [['']]);
  if (exists) {
    // Replace existing sheet content with (optionally) headers
    wb.Sheets[title] = ws;
  } else {
    XLSX.utils.book_append_sheet(wb, ws, title);
  }

  const outName = await saveWorkbook(wb, exists ? '-sheet-updated' : '-sheet-created', String(gen.fileName ?? 'Workbook'));
  return {
    success: true,
    data: { createdNew: !exists, sheetName: title, headersApplied: headers.length > 0, downloadedFile: outName },
  };
}

// Executes the Excel Delete Sheet operation
async function executeExcelDeleteSheet(gen: any, nodeConfig: NodeConfig, context: ExecutionContext, XLSX: any): Promise<NodeExecutionResult> {
  const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
  if (!sheetName) {
    const msg = 'Delete Sheet: Select a sheet to delete.';
    showErrorToast('Excel Missing Fields', msg);
    return { success: false, error: msg };
  }
  const buf = await loadSelectedExcelFile(gen, nodeConfig);
  const wb = XLSX.read(buf, { type: 'array' });
  const idx = wb.SheetNames.indexOf(sheetName);
  if (idx === -1) {
    // Treat as success: nothing to delete
    return { success: true, data: { deleted: false, reason: 'not-found', sheetName } };
  }
  wb.SheetNames.splice(idx, 1);
  delete (wb.Sheets as any)[sheetName];
  const outName = await saveWorkbook(wb, '-sheet-deleted', String(gen.fileName ?? 'Workbook'));
  return { success: true, data: { deleted: true, sheetName, downloadedFile: outName } };
}

// Executes the Excel Append Row operation
async function executeExcelAppendRow(gen: any, nodeConfig: NodeConfig, context: ExecutionContext, XLSX: any): Promise<NodeExecutionResult> {
  const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
  if (!sheetName) {
    const msg = 'Append Row: Select a sheet.';
    showErrorToast('Excel Missing Fields', msg);
    return { success: false, error: msg };
  }
  const buf = await loadSelectedExcelFile(gen, nodeConfig);
  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.Sheets[sheetName]) {
    const msg = `Append Row: Sheet "${sheetName}" not found.`;
    showErrorToast('Excel Sheet Not Found', msg);
    return { success: false, error: msg };
  }
  const ws = wb.Sheets[sheetName];
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const headers: string[] = (aoa[0] || []).map((h: any) => String(h));
  if (!headers.length) {
    const msg = 'Append Row: No column headers found. Create headers in row 1 and try again.';
    showErrorToast('Excel Headers Missing', msg);
    return { success: false, error: msg };
  }

  // Build row in header order
  const appendValues = (gen.appendValues ?? {}) as Record<string, any>;
  const row: any[] = headers.map((h) => resolveTemplate(String(appendValues[h] ?? ''), { context }));
  if (aoa.length === 0) aoa.push(headers);
  aoa.push(row);
  const nextWs = XLSX.utils.aoa_to_sheet(aoa);
  wb.Sheets[sheetName] = nextWs;
  const outName = await saveWorkbook(wb, '-row-appended', String(gen.fileName ?? 'Workbook'));
  return { success: true, data: { appended: true, headers, downloadedFile: outName } };
}

// Executes the Excel Update Row operation
async function executeExcelUpdateRow(gen: any, nodeConfig: NodeConfig, context: ExecutionContext, XLSX: any): Promise<NodeExecutionResult> {
  const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
  const matchColumn = resolveTemplate(String(gen.update?.matchColumn ?? ''), { context }).trim();
  if (!sheetName || !matchColumn) {
    const msg = 'Update Row: Provide Sheet Name and Column to match.';
    showErrorToast('Excel Missing Fields', msg);
    return { success: false, error: msg };
  }
  const buf = await loadSelectedExcelFile(gen, nodeConfig);
  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.Sheets[sheetName]) {
    const msg = `Update Row: Sheet "${sheetName}" not found.`;
    showErrorToast('Excel Sheet Not Found', msg);
    return { success: false, error: msg };
  }
  const ws = wb.Sheets[sheetName];
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const headers: string[] = (aoa[0] || []).map((h: any) => String(h));
  const colIndex = headers.indexOf(matchColumn);
  if (colIndex === -1) {
    const msg = `Update Row: Match column "${matchColumn}" not found in headers.`;
    showErrorToast('Excel Header Missing', msg);
    return { success: false, error: msg };
  }
  const rawValuesMap = (gen.update?.values ?? {}) as Record<string, any>;
  const hasMatchKey = Object.prototype.hasOwnProperty.call(rawValuesMap, matchColumn);
  const matchValue = hasMatchKey ? resolveTemplate(String(rawValuesMap[matchColumn] ?? ''), { context }).trim() : '';
  if (!matchValue) {
    const msg = `Update Row: Provide a value under "${matchColumn}" in Values to locate the row.`;
    showErrorToast('Excel Missing Match Value', msg);
    return { success: false, error: msg };
  }

  let foundRow = -1;
  for (let r = 1; r < aoa.length; r++) {
    const cellVal = String(aoa[r]?.[colIndex] ?? '').trim();
    if (cellVal === matchValue) { foundRow = r; break; }
  }
  if (foundRow === -1) {
    const msg = `Update Row: No row matched where "${matchColumn}" equals "${matchValue}".`;
    showErrorToast('Excel No Match', msg);
    return { success: false, error: msg };
  }

  // Apply updates (exclude match column)
  const next = aoa.slice();
  const row = (next[foundRow] = Array.isArray(next[foundRow]) ? next[foundRow].slice() : []);
  for (const [k, v] of Object.entries(rawValuesMap)) {
    if (k === matchColumn) continue;
    const idx = headers.indexOf(k);
    if (idx >= 0) row[idx] = resolveTemplate(String(v ?? ''), { context });
  }
  const nextWs = XLSX.utils.aoa_to_sheet(next);
  wb.Sheets[sheetName] = nextWs;
  const outName = await saveWorkbook(wb, '-row-updated', String(gen.fileName ?? 'Workbook'));
  return { success: true, data: { updated: true, rowIndex: foundRow + 1, downloadedFile: outName } };
}

// Executes the Excel Delete Row/Column operation
async function executeExcelDeleteRowColumn(gen: any, nodeConfig: NodeConfig, context: ExecutionContext, XLSX: any): Promise<NodeExecutionResult> {
  const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
  const target = String(gen.delete?.target ?? 'Row');
  const startIndex = Math.max(1, Number(gen.delete?.startIndex ?? 1));
  const count = Math.max(1, Number(gen.delete?.count ?? 1));
  if (!sheetName) {
    const msg = 'Delete Row/Column: Provide Sheet Name.';
    showErrorToast('Excel Missing Fields', msg);
    return { success: false, error: msg };
  }
  const buf = await loadSelectedExcelFile(gen, nodeConfig);
  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.Sheets[sheetName]) {
    const msg = `Delete Row/Column: Sheet "${sheetName}" not found.`;
    showErrorToast('Excel Sheet Not Found', msg);
    return { success: false, error: msg };
  }
  const ws = wb.Sheets[sheetName];
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  let next = aoa.slice();
  if (target === 'Column') {
    // Remove columns [startIndex-1 .. startIndex+count-2] from every row
    const s = Math.max(0, startIndex - 1);
    const e = s + count; // exclusive
    next = next.map((row) => {
      const r = Array.isArray(row) ? row.slice() : [];
      r.splice(s, count);
      return r;
    });
  } else {
    // Remove rows [startIndex .. startIndex+count-1] (1-based with row0 as header)
    const s = Math.max(1, startIndex); // never delete header (row 0)
    next.splice(s, count);
  }
  const nextWs = XLSX.utils.aoa_to_sheet(next);
  wb.Sheets[sheetName] = nextWs;
  const outName = await saveWorkbook(wb, target === 'Column' ? '-columns-deleted' : '-rows-deleted', String(gen.fileName ?? 'Workbook'));
  return { success: true, data: { deleted: true, target, startIndex, count, downloadedFile: outName } };
}

// Executes the Excel Get Rows operation
async function executeExcelGetRows(gen: any, nodeConfig: NodeConfig, context: ExecutionContext, XLSX: any): Promise<NodeExecutionResult> {
  const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
  if (!sheetName) {
    const msg = 'Get Row(s): Provide Sheet Name.';
    showErrorToast('Excel Missing Fields', msg);
    return { success: false, error: msg };
  }
  const buf = await loadSelectedExcelFile(gen, nodeConfig);
  const wb = XLSX.read(buf, { type: 'array' });
  if (!wb.Sheets[sheetName]) {
    const msg = `Get Row(s): Sheet "${sheetName}" not found.`;
    showErrorToast('Excel Sheet Not Found', msg);
    return { success: false, error: msg };
  }
  const ws = wb.Sheets[sheetName];
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,   // <-- use formatted text exactly as shown in Excel
    defval: ''    // <-- keep empty cells as empty string
  });
  const headers: string[] = (aoa[0] || []).map((h: any) => String(h));
  if (!headers.length) {
    const msg = 'Get Row(s): No columns found. Create headers in row 1 and try again.';
    showErrorToast('Excel Headers Missing', msg);
    return { success: false, error: msg };
  }
  const rows = (aoa.slice(1) || []).map((r) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { obj[h] = r?.[i]; });
    return obj;
  });

  const filters = Array.isArray(gen.getRows?.filters) ? gen.getRows.filters : [];
  const logic = String(gen.getRows?.combineWith ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
  const resolvedFilters = filters
    .map((f: any) => ({
      column: String(f?.column ?? '').trim(),
      value: resolveTemplate(String(f?.value ?? ''), { context }),
    }))
    .filter((f: any) => f.column.length > 0);

  let outRows = rows;
  if (resolvedFilters.length > 0) {
    outRows = rows.filter((row) => {
      const checks = resolvedFilters.map((f: any) => String(row[f.column] ?? '').trim() === String(f.value).trim());
      return logic === 'OR' ? checks.some(Boolean) : checks.every(Boolean);
    });
  }

  return { success: true, data: { count: outRows.length, headers, rows: outRows } };
}

// Builds default Excel files list dynamically (mirror UI logic)
function loadDefaultExcelFiles(): Array<{ key: string; name: string; url: string }> {
  try {
    const ctx = (require as any).context('../../data/Excel Files', false, /\.(xlsx?|XLSX?)$/i);
    const keys = ctx.keys();
    return keys.map((k: string) => {
      const url: string = ctx(k)?.default || ctx(k);
      const file = k.split('/').pop() || k;
      const base = file.replace(/\.(xlsx?|XLSX?)$/, '');
      const name = base.replace(/[\-_]+/g, ' ').trim();
      const key = base.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return { key, name, url };
    });
  } catch {
    return [];
  }
}

// Loads the selected Excel file as ArrayBuffer
async function loadSelectedExcelFile(gen: any, nodeConfig: NodeConfig): Promise<ArrayBuffer> {
  const fileSource = String(gen.fileSource ?? '').trim();
  const defaultFileKey = String(gen.defaultFileKey ?? '').trim();
  if (fileSource === 'default') {
    const files = loadDefaultExcelFiles();
    const match = files.find((f) => f.key === defaultFileKey);
    if (!match) {
      const msg = 'Excel: Unknown default template key';
      showErrorToast('Excel: Load failed', msg);
      throw new Error(msg);
    }
    const res = await fetch(match.url);
    if (!res.ok) throw new Error(`Failed to load template (HTTP ${res.status})`);
    return await res.arrayBuffer();
  }
  if (fileSource === 'device') {
    const blobUrl = String(gen.deviceFileUrl || '').trim();
    if (!blobUrl) {
      const msg = 'Excel: Local file is not available at runtime. Reattach the file and run again.';
      showErrorToast('Excel: Missing local file', msg);
      throw new Error(msg);
    }
    const res = await fetch(blobUrl);
    if (!res.ok) throw new Error(`Failed to access local file (HTTP ${res.status})`);
    return await res.arrayBuffer();
  }
  const msg = 'Excel: Unknown file source.';
  showErrorToast('Excel: Load failed', msg);
  throw new Error(msg);
}

// Downloads the workbook with a suffix
async function saveWorkbook(wb: any, suffix: string, fileName: string): Promise<string> {
  const XLSX = (await import('xlsx')).default || (await import('xlsx'));
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const baseName = (fileName || 'Workbook').replace(/\.(xlsx?|XLSX?)$/, '');
  const outName = `${baseName}${suffix}.xlsx`;
  downloadBlob(blob, outName);
  return outName;
}
