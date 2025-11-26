import emailjs from '@emailjs/browser';
import { ExecutionContext, NodeConfig, NodeExecutionResult } from '../../types';
import { NodeModel } from '@syncfusion/ej2-react-diagrams';
import { showErrorToast, showToast } from '../../components/Toast';
import { resolveTemplate } from '../../helper/expression';
import { createDocxFromHtml, appendHtmlToDocx, downloadBlob } from '../../helper/wordExecutionUtils';

export async function executeActionOrToolCategory(
  _node: NodeModel,
  nodeConfig: NodeConfig,
  context: ExecutionContext
): Promise<NodeExecutionResult> {
  switch (nodeConfig.nodeType) {
    case 'EmailJS':
      return executeEmailJsNode(nodeConfig, context);
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

// ---------------- EmailJS ----------------
async function executeEmailJsNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  try {
    // 1) Read minimal required config
    const auth = nodeConfig.settings?.authentication ?? {};
    const gen = nodeConfig.settings?.general ?? {};

    const publicKey = (auth.publicKey ?? '').trim();
    const serviceId = (auth.serviceId ?? '').trim();
    const templateId = (auth.templateId ?? '').trim();

    // 2) Validate required fields (toast + cancel)
    const missing: string[] = [];
    if (!publicKey) missing.push('Public Key');
    if (!serviceId) missing.push('Service ID');
    if (!templateId) missing.push('Template ID');

    if (missing.length) {
      const msg = `Please provide: ${missing.join(', ')}.`;
      showErrorToast('EmailJS: Missing required fields', msg);
      return { success: false, error: msg };
    }

    // 3) Collect and resolve template variables
    const kvs = Array.isArray(gen.emailjsVars) ? gen.emailjsVars : [];
    // Filter out rows without a key, but count how many we dropped to warn once.
    const cleaned = kvs.filter((r: any) => (r?.key ?? '').toString().trim().length > 0);
    const dropped = kvs.length - cleaned.length;
    if (dropped > 0) {
      // soft warning; do not fail execution
      showErrorToast('EmailJS: Ignoring empty variable names',
        `Ignored ${dropped} variable row(s) with empty key.`);
    }

    // Resolve every value through your templating system so expressions work:
    // VariablePickerTextBox typically stores strings with {{ ... }} expressions.
    const templateParams: Record<string, any> = {};
    for (const row of cleaned) {
      const k = row.key.toString().trim();
      const raw = (row.value ?? '').toString();
      const resolved = resolveTemplate(raw, { context }); // expands {{ ... }} using current run context
      // Keep the raw empty string as valid; users may intentionally set ""
      templateParams[k] = resolved;
    }

    // 4) Enforce EmailJS dynamic vars payload limit (~50 KB, exclude attachments)
    const approxBytes = new Blob([JSON.stringify(templateParams)]).size;
    if (approxBytes > 50_000) {
      const msg = `Template variables exceed 50 KB (current ~${approxBytes} bytes). Reduce payload size.`;
      showErrorToast('EmailJS: Payload too large', msg);
      return { success: false, error: msg };
    }

    // 5) Send the email via EmailJS SDK.
    // Passing { publicKey } here is supported; EmailJS also allows global init with the same key.
    // Note: EmailJS rate-limits to ~1 request/second. Consider sequencing if users chain sends. [2](https://syncfusion-my.sharepoint.com/personal/satishraj_raju_syncfusion_com/Documents/Microsoft%20Copilot%20Chat%20Files/BaseExecutors.txt)
    const response = await emailjs.send(
      serviceId,
      templateId,
      templateParams,
      { publicKey } // ensures we don't depend on a prior global init
    );

    // 6) Return success payload (also stored to context by base class)
    return {
      success: true,
      data: {
        status: response?.status,     // e.g., 200
        text: response?.text,         // e.g., "OK"
        templateParams
      }
    };
  } catch (err: any) {
    // 7) Surface a clean error to the user
    const message = (err?.text || err?.message || `${err}`)?.toString();
    showErrorToast('EmailJS Send Failed', message);
    return { success: false, error: message };
  }
}

// ---------------- Word ----------------
async function executeWordNode(nodeConfig: NodeConfig, context: ExecutionContext): Promise<NodeExecutionResult> {
  try {
    const gen = (nodeConfig.settings?.general ?? {}) as any;
    const op = String(gen.operation ?? '').trim();

    // Validate a file was selected in config
    const fileSource = String(gen.fileSource ?? '').trim(); // 'default' | 'device'
    const defaultFileKey = String(gen.defaultFileKey ?? '').trim();
    const fileName = String(gen.fileName ?? '').trim();

    if (!fileSource || (!defaultFileKey && fileSource === 'default') || (!fileName && fileSource === 'device')) {
      const msg = 'Word: Please select a document (upload or choose a template) in the configuration panel.';
      showErrorToast('Word: No document selected', msg);
      return { success: false, error: msg };
    }

    if (!op) {
      const msg = 'Word: Please choose an operation (Write, Read, or Update).';
      showErrorToast('Word: Operation missing', msg);
      return { success: false, error: msg };
    }

    // Build default files list dynamically (mirror UI logic)
    const loadDefaultWordFiles = (): Array<{ key: string; name: string; url: string }> => {
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
    };

    // Helper: load the selected .docx as ArrayBuffer
    const loadSelectedFile = async (): Promise<ArrayBuffer> => {
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
    };

    // Dispatch by operation
    switch (op) {
      case 'Read': {
        const buf = await loadSelectedFile();
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
        try {
          const raw = String((nodeConfig.settings as any)?.general?.chatResponse ?? '').trim();
          const inputResolvedValue = raw ? resolveTemplate(raw, { context }) : '';
          if (typeof window !== 'undefined' && inputResolvedValue) {
            window.dispatchEvent(new CustomEvent('wf:chat:assistant-response', { detail: { text: inputResolvedValue, triggeredFrom:'Word Node' } }));
          }
        } catch {}
        return out;
      }

      case 'Write': {
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
              const originalBuf = await loadSelectedFile();
              outBlob = await appendHtmlToDocx(originalBuf, resolvedHtml);
            } catch {
              // Fallback when original cannot be loaded
              outBlob = await createDocxFromHtml(resolvedHtml);
            }
          } else {
            // Overwrite
            outBlob = await createDocxFromHtml(resolvedHtml);
          }

          const baseName = (fileName || 'Document').replace(/\.(docx?|DOCX?)$/, '');
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
        try {
          const raw = String((nodeConfig.settings as any)?.general?.chatResponse ?? '').trim();
          const inputResolvedValue = raw ? resolveTemplate(raw, { context }) : '';
          if (typeof window !== 'undefined' && inputResolvedValue) {
            window.dispatchEvent(new CustomEvent('wf:chat:assistant-response', { detail: { text: inputResolvedValue, triggeredFrom:'Word Node' } }));
          }
        } catch {}
        return out;
      }

      case 'Update (Mapper)': {
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

        const buf = await loadSelectedFile();
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
          const outName = (fileName || 'Document').replace(/\.(docx?|DOCX?)$/, '').concat('-updated.docx');
          downloadBlob(out, outName);
          const res: NodeExecutionResult = {
            success: true,
            data: { operation: 'Update', placeholders: Object.keys(dataMap), downloadedFile: outName },
          };
          try {
            const raw = String((nodeConfig.settings as any)?.general?.chatResponse ?? '').trim();
            const inputResolvedValue = raw ? resolveTemplate(raw, { context }) : '';
            if (typeof window !== 'undefined' && inputResolvedValue) {
              window.dispatchEvent(new CustomEvent('wf:chat:assistant-response', { detail: { text: inputResolvedValue, triggeredFrom:'Word Node' } }));
            }
          } catch {}
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
  const { playNotificationSound } = await import('../../helper/soundUtils');
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

    // Validate a file was selected in config (device or default)
    const fileSource = String(gen.fileSource ?? '').trim(); // 'default' | 'device'
    const defaultFileKey = String(gen.defaultFileKey ?? '').trim();
    const fileName = String(gen.fileName ?? '').trim();

    if (!fileSource || (!defaultFileKey && fileSource === 'default') || (!fileName && fileSource === 'device')) {
      const msg = 'Excel: Please select a document (upload or choose a template) in the configuration panel.';
      showErrorToast('Excel: No document selected', msg);
      return { success: false, error: msg };
    }

    if (!op) {
      const msg = 'Excel: Please choose an operation.';
      showErrorToast('Excel: Operation missing', msg);
      return { success: false, error: msg };
    }

    // Mirror UI: discover default Excel files from assets folder
    const loadDefaultExcelFiles = (): Array<{ key: string; name: string; url: string }> => {
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
    };

    // Helper: load selected Excel file as ArrayBuffer
    const loadSelectedFile = async (): Promise<ArrayBuffer> => {
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
    };

    // Helper: download workbook with suffix
    const saveWorkbook = async (wb: any, suffix: string) => {
      const XLSX = (await import('xlsx')).default || (await import('xlsx'));
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const baseName = (fileName || 'Workbook').replace(/\.(xlsx?|XLSX?)$/, '');
      const outName = `${baseName}${suffix}.xlsx`;
      downloadBlob(blob, outName);
      return outName;
    };

    const XLSX = (await import('xlsx')).default || (await import('xlsx'));

    // Dispatch by operation
    switch (op) {
      // -------- Create Sheet --------
      case 'Create Sheet': {
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
          const buf = await loadSelectedFile();
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

        const outName = await saveWorkbook(wb, exists ? '-sheet-updated' : '-sheet-created');
        return {
          success: true,
          data: { createdNew: !exists, sheetName: title, headersApplied: headers.length > 0, downloadedFile: outName },
        };
      }

      // -------- Delete Sheet --------
      case 'Delete Sheet': {
        const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
        if (!sheetName) {
          const msg = 'Delete Sheet: Select a sheet to delete.';
          showErrorToast('Excel Missing Fields', msg);
          return { success: false, error: msg };
        }
        const buf = await loadSelectedFile();
        const wb = XLSX.read(buf, { type: 'array' });
        const idx = wb.SheetNames.indexOf(sheetName);
        if (idx === -1) {
          // Treat as success: nothing to delete
          return { success: true, data: { deleted: false, reason: 'not-found', sheetName } };
        }
        wb.SheetNames.splice(idx, 1);
        delete (wb.Sheets as any)[sheetName];
        const outName = await saveWorkbook(wb, '-sheet-deleted');
        return { success: true, data: { deleted: true, sheetName, downloadedFile: outName } };
      }

      // -------- Append Row --------
      case 'Append Row': {
        const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
        if (!sheetName) {
          const msg = 'Append Row: Select a sheet.';
          showErrorToast('Excel Missing Fields', msg);
          return { success: false, error: msg };
        }
        const buf = await loadSelectedFile();
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
        const outName = await saveWorkbook(wb, '-row-appended');
        return { success: true, data: { appended: true, headers, downloadedFile: outName } };
      }

      // -------- Update Row --------
      case 'Update Row': {
        const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
        const matchColumn = resolveTemplate(String(gen.update?.matchColumn ?? ''), { context }).trim();
        if (!sheetName || !matchColumn) {
          const msg = 'Update Row: Provide Sheet Name and Column to match.';
          showErrorToast('Excel Missing Fields', msg);
          return { success: false, error: msg };
        }
        const buf = await loadSelectedFile();
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
        const outName = await saveWorkbook(wb, '-row-updated');
        return { success: true, data: { updated: true, rowIndex: foundRow + 1, downloadedFile: outName } };
      }

      // -------- Delete Row/Column --------
      case 'Delete Row/Column': {
        const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
        const target = String(gen.delete?.target ?? 'Row');
        const startIndex = Math.max(1, Number(gen.delete?.startIndex ?? 1));
        const count = Math.max(1, Number(gen.delete?.count ?? 1));
        if (!sheetName) {
          const msg = 'Delete Row/Column: Provide Sheet Name.';
          showErrorToast('Excel Missing Fields', msg);
          return { success: false, error: msg };
        }
        const buf = await loadSelectedFile();
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
        const outName = await saveWorkbook(wb, target === 'Column' ? '-columns-deleted' : '-rows-deleted');
        return { success: true, data: { deleted: true, target, startIndex, count, downloadedFile: outName } };
      }

      // -------- Get Row(s) --------
      case 'Get Rows': {
        const sheetName = resolveTemplate(String(gen.sheetName ?? ''), { context }).trim();
        if (!sheetName) {
          const msg = 'Get Row(s): Provide Sheet Name.';
          showErrorToast('Excel Missing Fields', msg);
          return { success: false, error: msg };
        }
        const buf = await loadSelectedFile();
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

    // 1) Resolve base URL from templates/variables
    const rawUrl = resolveTemplate(String(general.url ?? ''), { context }).trim();
    if (!rawUrl) {
      const msg = 'HTTP Request: Please provide a URL.';
      showErrorToast('HTTP Request Missing URL', msg);
      return { success: false, error: msg };
    }

    // 2) Normalize method to GET (UI supports only GET for now)
    const method = 'GET';

    // 3) Build query string from name/value pairs, both support VariablePicker
      const qpArray: Array<{ key: string; value: string }> = Array.isArray(general.queryParams)
        ? general.queryParams
        : [];

      // Build a strict absolute URL (no implicit base). Throw if invalid.
      let urlObj: URL;
      try {
        urlObj = new URL(rawUrl); // requires absolute URL like https://api.example.com
      } catch {
        const msg = 'HTTP Request: Invalid URL. Provide a valid absolute URL starting with http(s)://';
        showErrorToast('HTTP Request Invalid URL', msg);
        return { success: false, error: msg };
      }
      if (!/^https?:$/i.test(urlObj.protocol)) {
        const msg = 'HTTP Request: Only http(s) URLs are supported.';
        showErrorToast('HTTP Request Unsupported Protocol', msg);
        return { success: false, error: msg };
      }

      for (const row of qpArray) {
        const name = resolveTemplate(String(row?.key ?? ''), { context }).trim();
        if (!name) continue; // ignore empty keys
        const value = resolveTemplate(String(row?.value ?? ''), { context });
        urlObj.searchParams.append(name, String(value));
      }

    // 4) Resolve and parse headers JSON (optional)
    let headers: Record<string, string> | undefined = undefined;
    if (general.headers && String(general.headers).trim().length > 0) {
      try {
        const headersStr = resolveTemplate(String(general.headers), { context });
        const parsed = JSON.parse(headersStr || '{}');
        // Coerce values to strings for Fetch headers
        headers = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [k, v != null ? String(v) : ''])
        );
      } catch (e: any) {
        const msg = 'HTTP Request: Headers must be valid JSON.';
        showErrorToast('HTTP Request Invalid Headers', msg);
        return { success: false, error: msg };
      }
    }

    const requestInit: RequestInit = { method, headers };

    const startedAt = Date.now();
    const response = await fetch(urlObj.toString(), requestInit);
    const elapsedMs = Date.now() - startedAt;

    // Read response headers as plain object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => { responseHeaders[k] = v; });

    // Heuristic to parse JSON bodies safely
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
      // If parsing fails, fall back to text
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
      // Treat HTTP errors as failure but still return payload for debugging/variables
      const msg = `HTTP ${response.status} ${response.statusText}`;
      return { success: false, error: msg, data: resultPayload } as NodeExecutionResult;
    }

    return { success: true, data: resultPayload };
  } catch (err: any) {
    const message = (err?.message ?? `${err}`)?.toString();
    showErrorToast('HTTP Request Failed', message);
    return { success: false, error: message };
  }
}
