import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { TextBoxComponent, NumericTextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { TooltipComponent } from '@syncfusion/ej2-react-popups';
import { UploaderComponent } from '@syncfusion/ej2-react-inputs';
import { VariablePickerTextBox } from '../components/VariablePickerTextBox';
import { createUploadHandler, createRemovalHandler, createPreviewHandler, buildUploaderFiles } from '../../../utilities/fileManagementUtils';

type Props = {
  settings: any; // selectedNode.settings.general
  onPatch: (patch: Record<string, any>) => void; // merges into settings.general
  variableGroups: any[];
};

const OPERATIONS = [
  'Create Sheet',
  'Delete Sheet',
  'Append Row',
  'Update Row',
  'Get Rows',
  'Delete Row/Column',
] as const;

// Discover default Excel files at build-time (webpack require.context)
function loadDefaultExcelFiles(): Array<{ key: string; name: string; url: string }> {
  try {
    const ctx = (require as any).context('../../../data/Excel Files', false, /\.(xlsx?|XLSX?)$/i);
    const keys = ctx.keys();
    return keys.map((k: string) => {
      const url: string = ctx(k)?.default || ctx(k);
      const file = k.split('/').pop() || k;
      const base = file.replace(/\.[^.]+$/, '');
      const name = base.replace(/[\-_]+/g, ' ').trim();
      const key = base.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return { key, name, url };
    });
  } catch {
    return [];
  }
}
const DEFAULT_EXCEL_FILES = loadDefaultExcelFiles();

const COMBINE_FILTERS = [
  { text: 'AND (match all)', value: 'AND' },
  { text: 'OR (match any)', value: 'OR' },
];

const ExcelNodeConfig: React.FC<Props> = ({ settings, onPatch, variableGroups }) => {
  // File state
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localFileUrl, setLocalFileUrl] = useState<string>('');
  const [previewError, setPreviewError] = useState<string>('');
  const uploaderRef = useRef<UploaderComponent | null>(null);

  // Spreadsheet meta
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [headersBySheet, setHeadersBySheet] = useState<Record<string, string[]>>({});
  const [inspecting, setInspecting] = useState(false);

  const operation: typeof OPERATIONS[number] | '' = settings.operation ?? '';

  // Default files dropdown
  const selectedDefaultKey: string | undefined = settings.defaultFileKey;
  const selectedDefault = useMemo(
    () => DEFAULT_EXCEL_FILES.find((f) => f.key === selectedDefaultKey),
    [selectedDefaultKey]
  );
  const fields = useMemo(() => ({ text: 'name', value: 'key' }), []);
  const defaultFileOptions = useMemo(
    () => DEFAULT_EXCEL_FILES.map(({ key, name }) => ({ key, name })),
    []
  );

  // Chosen file (device or default)
  const fileChosen = (settings?.fileSource === 'device' && !!(settings?.deviceFileUrl || localFile)) || !!selectedDefault;
  const chosenName = (settings?.fileSource === 'device' ? (settings?.fileName || localFile?.name) : selectedDefault?.name) || '';
  const chosenUrl = (settings?.fileSource === 'device' ? (settings?.deviceFileUrl || localFileUrl) : selectedDefault?.url) || '';

  const patch = (p: Record<string, any>) => onPatch(p);

  const colLetterToIndex = (s: string): number => {
    if (!s) return 0;
    let n = 0;
    const up = s.trim().toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const c = up.charCodeAt(i);
      if (c < 65 || c > 90) return 0;
      n = n * 26 + (c - 64);
    }
    return n;
  };
  const colIndexToLetter = (n: number): string => {
    if (!n || n < 1) return '';
    let s = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  // Uploader handlers
  const onUploaderSelected = useCallback(
    createUploadHandler({
      validExtensions: ['.xls', '.xlsx'],
      onFileSelected: (file, url) => {
        setLocalFile(file);
        setLocalFileUrl(url);
        patch({
          defaultFileKey: undefined,
          fileSource: 'device',
          fileName: file.name,
          deviceFileUrl: url,
          deviceFileMeta: { name: file.name, size: file.size, type: file.type },
        });
      },
      onError: setPreviewError,
      settings,
      setPreviewError,
    }),
    [settings]
  );

  const onUploaderRemoving = useCallback(
    createRemovalHandler({
      onFileRemoved: () => {
        setLocalFile(null);
        setLocalFileUrl('');
        setSheetNames([]);
        setHeadersBySheet({});
        patch({
          fileSource: undefined,
          fileName: undefined,
          defaultFileKey: undefined,
          deviceFileUrl: undefined,
          deviceFileMeta: undefined,
        });
      },
      settings,
      localFileUrl,
    }),
    [settings, localFileUrl]
  );

  const onRemoveChosen = useCallback(
    createRemovalHandler({
      onFileRemoved: () => {
        setLocalFile(null);
        setLocalFileUrl('');
        setSheetNames([]);
        setHeadersBySheet({});
        patch({
          fileSource: undefined,
          fileName: undefined,
          defaultFileKey: undefined,
          deviceFileUrl: undefined,
          deviceFileMeta: undefined,
        });
      },
      settings,
      localFileUrl,
    }),
    [settings, localFileUrl]
  );

  const onSelectDefault = (e: any) => {
    if (!e?.value) return;
    const sel = DEFAULT_EXCEL_FILES.find((d) => d.key === e.value);
    if (sel) {
      if (localFileUrl) URL.revokeObjectURL(localFileUrl);
      setLocalFile(null);
      setLocalFileUrl('');
      setPreviewError('');
      setSheetNames([]);
      setHeadersBySheet({});
      patch({ defaultFileKey: sel.key, fileSource: 'default', fileName: sel.name });
    }
  };

  // Preview (open/download)
  const onPreview = useCallback(
    createPreviewHandler({
      chosenUrl,
      localFile,
      localFileUrl,
      onError: setPreviewError,
    }),
    [chosenUrl, localFile, localFileUrl]
  );

  // Inspect workbook: list sheets and headers
  const inspectWorkbook = useCallback(async () => {
    if (!fileChosen) return;
    setInspecting(true);
    try {
      const XLSX = (await import('xlsx')).default || (await import('xlsx'));
      // Load buffer
      let buf: ArrayBuffer | null = null;
      if (localFile) {
        buf = await localFile.arrayBuffer();
      } else if (chosenUrl) {
        const resp = await fetch(chosenUrl);
        buf = await resp.arrayBuffer();
      }
      if (!buf) {
        setSheetNames([]);
        setHeadersBySheet({});
        return;
      }
      const wb = XLSX.read(buf, { type: 'array' });
      const names = wb.SheetNames || [];
      setSheetNames(names);
      const nextHeaders: Record<string, string[]> = {};
      for (const name of names) {
        const ws = wb.Sheets[name];
        if (!ws) continue;
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const headers: string[] = [];
        // Read first row as header (row = range.s.r)
        const headerRow = range.s.r;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r: headerRow, c });
          const cell = ws[addr];
          const v = cell?.v != null ? String(cell.v) : '';
          headers.push(v || `Column ${c - range.s.c + 1}`);
        }
        nextHeaders[name] = headers.filter((h) => String(h).trim() !== '');
      }
      setHeadersBySheet(nextHeaders);
    } catch (e) {
      setSheetNames([]);
      setHeadersBySheet({});
    } finally {
      setInspecting(false);
    }
  }, [fileChosen, chosenUrl, localFile]);

  // Auto-inspect when file changes or when operation that needs sheets is chosen
  useEffect(() => {
    if (!fileChosen) return;
    if (operation && operation !== 'Create Sheet') {
      void inspectWorkbook();
    }
  }, [fileChosen, operation, inspectWorkbook]);

  // ---------- Renders ----------
  const renderFilePicker = () => (
    <div className="config-section">
      <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
        <label className="config-label">Excel document</label>
        <TooltipComponent content="Upload an Excel file or select a default excel file.">
          <span className="e-icons e-circle-info help-icon"></span>
        </TooltipComponent>
      </div>

      {!selectedDefault && (
        <UploaderComponent
          ref={uploaderRef as any}
          autoUpload={false}
          multiple={false}
          allowedExtensions=".xls,.xlsx"
          selected={onUploaderSelected}
          removing={onUploaderRemoving}
          dropArea=".config-panel-content"
          showFileList={true}
          cssClass="word-uploader"
          files={buildUploaderFiles({ settings, localFile }) as any}
        />
      )}

      {!(settings?.fileSource === 'device' || !!localFile) && (
        <div style={{ marginTop: 10 }}>
          <DropDownListComponent
            value={selectedDefaultKey ?? ''}
            dataSource={defaultFileOptions}
            placeholder="Or select a sample file"
            change={onSelectDefault}
            popupHeight="240px"
            zIndex={1000000}
            fields={fields as any}
            width="100%"
          />
        </div>
      )}

      {(localFile || selectedDefault) && (
        <div className="textbox-info" style={{ marginTop: 8, display: 'flex', alignItems: 'center' }}>
          <ButtonComponent
            cssClass="flat-btn e-flat e-small"
            iconCss="e-icons e-trash"
            title="Remove file"
            style={{ marginRight: '10px' }}
            onClick={() => {
              onRemoveChosen();
            }}
          />
          <a onClick={onPreview} title="Download document" style={{ display: 'block', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chosenName}
          </a>
        </div>
      )}
      {previewError && <div className="textbox-info" style={{ color: 'var(--danger-color)' }}>{previewError}</div>}
    </div>
  );

  const renderOperationPicker = () => (
    <div className="config-section">
      <label className="config-label">Operation</label>
      <DropDownListComponent
        value={operation}
        dataSource={OPERATIONS as unknown as string[]}
        placeholder={fileChosen ? 'Select operation' : 'Choose a document first'}
        change={(e: any) => {
          patch({
            operation: e.value,
            create: undefined,
            update: undefined,
            appendValues: undefined,
            getRows: undefined,
            delete: undefined,
            sheetId: undefined,
            sheetName: undefined,
          });
        }}
        enabled={!!fileChosen}
        popupHeight="260px"
        zIndex={1000000}
      />
    </div>
  );

  const ej2Fields = useMemo(() => ({ text: 'text', value: 'value' }), []);

  // Sheet dropdown data source
  const sheetDataSource = useMemo(
    () => (sheetNames || []).map((t) => ({ text: t, value: t })),
    [sheetNames]
  );

  const renderSheetPicker = (placeholder = 'Select a sheet') => (
    <div className="config-section">
      <label className="config-label">Sheet</label>
      <DropDownListComponent
        value={settings.sheetName ?? ''}
        dataSource={sheetDataSource}
        placeholder={inspecting ? 'Loading sheets…' : sheetNames.length ? placeholder : 'No sheets found'}
        change={(e: any) => {
          if (e.value === settings.sheetName) return;
          patch({
            sheetName: e.value || '',
            // clear operation-specific state
            appendValues: undefined,
            update: undefined,
            delete: undefined,
            getRows: undefined,
          });
        }}
        enabled={!!fileChosen}
        popupHeight="240px"
        zIndex={1000000}
        fields={ej2Fields}
      />
      {inspecting && <div className="textbox-info">Analyzing workbook…</div>}
    </div>
  );

  // ----- Operation-specific bodies -----
  const renderCreateSheet = () => {
    const create = settings.create ?? {};
    const headers: string[] = Array.isArray(create.headers) ? create.headers : [];

    const setCreate = (p: any) => patch({ create: { ...(settings.create ?? {}), ...p } });
    const addHeader = () => setCreate({ headers: [...headers, ''] });
    const updateHeader = (i: number, val: string) => {
      const next = headers.slice();
      next[i] = val;
      setCreate({ headers: next });
    };
    const removeHeader = (i: number) => setCreate({ headers: headers.filter((_, idx) => idx !== i) });

    return (
      <>
        <div className="config-section">
          <label className="config-label">Title</label>
          <TextBoxComponent
            value={settings.title ?? ''}
            placeholder="New sheet title"
            change={(e: any) => patch({ title: e.value })}
            cssClass="config-input"
          />
        </div>

        <div className="config-section">
          <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
            <label className="config-label">Column headers (optional)</label>
            <TooltipComponent content="If provided, these will be written into row 1 of the new sheet (left to right).">
              <span className="e-icons e-circle-info help-icon"></span>
            </TooltipComponent>
          </div>

          {headers.length === 0 ? (
            <div className="textbox-info">No headers added. Click “Add header” to add one.</div>
          ) : (
            <div className="columns-grid">
              {headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <TextBoxComponent
                    value={h}
                    placeholder={`Header ${i + 1}`}
                    change={(e: any) => updateHeader(i, String(e.value ?? ''))}
                    cssClass="config-input"
                  />
                  <ButtonComponent
                    cssClass="flat-btn e-flat"
                    iconCss="e-icons e-trash"
                    onClick={() => removeHeader(i)}
                    title="Remove header"
                  />
                </div>
              ))}
            </div>
          )}

          <ButtonComponent className="add-field-btn e-primary" iconCss="e-icons e-plus" onClick={addHeader}>
            Add header
          </ButtonComponent>
        </div>
      </>
    );
  };

  const renderDeleteSheet = () => (
    <>
      {renderSheetPicker('Select a sheet to delete')}
    </>
  );

  const columnsForSelectedSheet = useMemo(() => {
    const name: string | undefined = settings.sheetName;
    if (!name) return [] as string[];
    return headersBySheet[name] || [];
  }, [settings.sheetName, headersBySheet]);

  const renderAppendRow = () => {
    const appendValues = settings.appendValues ?? {};
    const setValue = (col: string, val: string) => patch({ appendValues: { ...appendValues, [col]: val } });

    return (
      <>
        {renderSheetPicker()}
        <div className="config-section">
          <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
            <label className="config-label">Values to send</label>
            <TooltipComponent content="Provide values for columns to append a new row at the end.">
              <span className="e-icons e-circle-info help-icon"></span>
            </TooltipComponent>
          </div>

          {!settings.sheetName ? (
            <div className="textbox-info">Select a sheet to load columns.</div>
          ) : inspecting ? (
            <div className="textbox-info">Loading column headers…</div>
          ) : !columnsForSelectedSheet.length ? (
            <div className="textbox-info">No column headers found in the first row.</div>
          ) : (
            <div className="columns-grid">
              {columnsForSelectedSheet.map((col) => (
                <div key={col} className="column-value-row">
                  <div className="subtitle">{col}</div>
                  <VariablePickerTextBox
                    value={appendValues[col] ?? ''}
                    onChange={(val) => setValue(col, val)}
                    placeholder="Value"
                    cssClass="config-input"
                    variableGroups={variableGroups}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderUpdateRow = () => {
    const update = settings.update ?? {};
    const values = update.values ?? {};
    const setUpdate = (p: any) => patch({ update: { ...(settings.update ?? {}), ...p } });
    const selectedMatch = String(update.matchColumn ?? '');

    return (
      <>
        {renderSheetPicker()}
        <div className="config-section">
          <label className="config-label">Column to match on</label>
          <DropDownListComponent
            value={selectedMatch}
            dataSource={columnsForSelectedSheet}
            placeholder={!settings.sheetName ? 'Select a sheet first' : inspecting ? 'Loading columns…' : 'Select column'}
            change={(e: any) => {
              if (e.value === update.matchColumn) return;
              setUpdate({ matchColumn: e.value });
            }}
            enabled={!!settings.sheetName}
            popupHeight="240px"
            zIndex={1000000}
            fields={ej2Fields}
          />
        </div>

        <div className="config-section">
          <label className="config-label">Values to update</label>
          {!settings.sheetName ? (
            <div className="textbox-info">Select a sheet to load columns.</div>
          ) : inspecting ? (
            <div className="textbox-info">Loading column headers…</div>
          ) : !columnsForSelectedSheet.length ? (
            <div className="textbox-info">No columns available (first row empty).</div>
          ) : (
            <div className="columns-grid">
              {columnsForSelectedSheet.map((col) => (
                <div key={col} className="column-value-row">
                  <div className="subtitle">
                    {col}
                    {selectedMatch && selectedMatch === col ? <em>  (used to match)</em> : ''}
                  </div>
                  <VariablePickerTextBox
                    value={values[col] ?? ''}
                    onChange={(val) => setUpdate({ values: { ...values, [col]: val } })}
                    placeholder="New value"
                    cssClass="config-input"
                    variableGroups={variableGroups}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderDeleteRowOrColumn = () => {
    const del = settings.delete ?? {};
    const setDel = (p: any) => patch({ delete: { ...(settings.delete ?? {}), ...p } });
    const isRow = (del.target ?? 'Row') === 'Row';

    return (
      <>
        {renderSheetPicker()}

        <div className="config-section">
          <label className="config-label">To delete</label>
          <DropDownListComponent
            value={del.target ?? 'Row'}
            dataSource={['Row', 'Column']}
            change={(e: any) => setDel({ target: e.value })}
            popupHeight="200px"
            zIndex={1000000}
          />
        </div>

        <div className="config-section grid-2">
          <div>
            <label className="config-label">{isRow ? 'Start row number' : 'Start column (letter)'}</label>
            {isRow ? (
              <NumericTextBoxComponent
                value={del.startIndex ?? 1}
                min={1}
                format="n0"
                change={(e: any) => setDel({ startIndex: e.value })}
                cssClass="config-input"
              />
            ) : (
              <TextBoxComponent
                value={
                  del.startColumnLetter ?? (del.startIndex ? colIndexToLetter(del.startIndex) : 'A')
                }
                placeholder="A"
                change={(e: any) => {
                  const letter = String(e.value || '').toUpperCase().replace(/[^A-Z]/g, '');
                  const idx = colLetterToIndex(letter);
                  setDel({ startColumnLetter: letter || 'A', startIndex: idx || 1 });
                }}
                cssClass="config-input"
              />
            )}
          </div>
          <div>
            <label className="config-label">{isRow ? 'Number of rows' : 'Number of columns'}</label>
            <NumericTextBoxComponent
              value={del.count ?? 1}
              min={1}
              format="n0"
              change={(e: any) => setDel({ count: e.value })}
              cssClass="config-input"
            />
          </div>
        </div>
      </>
    );
  };

  const renderGetRows = () => {
    const getRows = settings.getRows ?? {};
    const filters = (getRows.filters ?? []) as Array<{ column?: string; value?: string }>;
    const setGetRows = (p: any) => patch({ getRows: { ...(settings.getRows ?? {}), ...p } });

    const updateFilter = (i: number, p: Partial<{ column: string; value: string }>) => {
      const next = filters.slice();
      next[i] = { ...next[i], ...p };
      setGetRows({ filters: next });
    };
    const addFilter = () => setGetRows({ filters: [...filters, { column: '', value: '' }] });
    const removeFilter = (i: number) => setGetRows({ filters: filters.filter((_, idx) => idx !== i) });

    return (
      <>
        {renderSheetPicker()}

        <div className="config-section">
          <label className="config-label">Filters</label>
          <div className="textbox-info" style={{ marginTop: 4 }}>
            <span style={{ marginRight: 8 }}>Combine with</span>
            <DropDownListComponent
              value={getRows.combineWith ?? 'AND'}
              dataSource={COMBINE_FILTERS}
              fields={ej2Fields}
              change={(e: any) => setGetRows({ combineWith: e.value })}
              width="180px"
              popupHeight="200px"
              zIndex={1000000}
            />
          </div>
          <div className="textbox-info" style={{ marginTop: 8 }}>
            Leave filters empty to return all rows from the selected sheet.
          </div>
        </div>

        <div className="config-section">
          {(filters ?? []).map((f, i) => (
            <div key={i} className="filter-row">
              <DropDownListComponent
                value={f.column ?? ''}
                dataSource={columnsForSelectedSheet}
                placeholder={!settings.sheetName ? 'Select a sheet first' : inspecting ? 'Loading…' : 'Column'}
                change={(e: any) => {
                  if (e.value === f.column) return;
                  updateFilter(i, { column: e.value });
                }}
                enabled={!!settings.sheetName}
                popupHeight="240px"
                zIndex={1000000}
                width={'45%'}
                fields={ej2Fields}
              />
              <VariablePickerTextBox
                value={f.value ?? ''}
                onChange={(val) => updateFilter(i, { value: val })}
                placeholder="Value"
                cssClass="config-input"
                variableGroups={variableGroups}
              />
              <ButtonComponent
                cssClass="flat-btn e-flat"
                iconCss="e-icons e-trash"
                onClick={() => removeFilter(i)}
                title="Remove filter"
              />
            </div>
          ))}

          <ButtonComponent className="add-field-btn e-primary" iconCss="e-icons e-plus" onClick={addFilter}>
            Add Filter
          </ButtonComponent>
        </div>
      </>
    );
  };

  return (
    <>
      {renderFilePicker()}
      {renderOperationPicker()}

      {operation === 'Create Sheet' && renderCreateSheet()}
      {operation === 'Delete Sheet' && renderDeleteSheet()}
      {operation === 'Append Row' && renderAppendRow()}
      {operation === 'Update Row' && renderUpdateRow()}
      {operation === 'Get Rows' && renderGetRows()}
      {operation === 'Delete Row/Column' && renderDeleteRowOrColumn()}
    </>
  );
};

export default ExcelNodeConfig;
