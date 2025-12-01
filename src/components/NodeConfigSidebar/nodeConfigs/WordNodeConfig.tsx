import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { TooltipComponent } from '@syncfusion/ej2-react-popups';
import { UploaderComponent } from '@syncfusion/ej2-react-inputs';
import { RichTextEditorComponent, Inject, HtmlEditor, Toolbar, Image, Link, QuickToolbar, Table, PasteCleanup, ImportExport, Resize } from '@syncfusion/ej2-react-richtexteditor';
import { VariablePickerTextBox, VariablePickerPopup } from '../components/VariablePickerTextBox';
import { insertAtCaret } from '../../../utilities/variablePickerUtils';
import { createUploadHandler, createRemovalHandler, createPreviewHandler, buildUploaderFiles } from '../../../utilities/fileManagementUtils';

export type WordNodeOperation = 'Write' | 'Read' | 'Update (Mapper)';

type Props = {
  settings: any;
  onPatch: (patch: Record<string, any>) => void;
  variableGroups: any[];
};

// Build default files list dynamically from /data/Word Files/*.docx at bundle time (webpack)
function loadDefaultWordFiles(): Array<{ key: string; name: string; url: string }> {
  try {
    const ctx = (require as any).context('../../../data/Word Files', false, /\.docx?$/i);
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
const DEFAULT_WORD_FILES = loadDefaultWordFiles();

const OPERATIONS: WordNodeOperation[] = ['Write', 'Read', 'Update (Mapper)'];

const WordNodeConfig: React.FC<Props> = ({ settings, onPatch, variableGroups }) => {
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localFileUrl, setLocalFileUrl] = useState<string>('');
  const [previewError, setPreviewError] = useState<string>('');

  // Detected placeholders from the selected doc (for Update Mapper)
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  
  // Variable picker popup state for RichTextEditor
  const [rteVarPickerOpen, setRteVarPickerOpen] = useState(false);
  const rteEditorRef = useRef<RichTextEditorComponent | null>(null);

  // Handler for inserting variables into the RTE. Defined at component scope
  // to comply with hook rules (avoid calling hooks inside nested functions).
  const handleRteVariablePick = useCallback(
    (variable: any) => {
      const token = `{{ ${variable.path} }}`;

      const rte = rteEditorRef.current as any;
      const contentEl = (rte?.element?.querySelector?.('.e-rte-content') as HTMLElement) || (rte?.element as HTMLElement) || (document.querySelector('.e-rte-content') as HTMLElement | null);
      if (contentEl) {
        const { nextValue } = insertAtCaret(contentEl, token);
        onPatch({ write: { ...(settings.write ?? {}), content: nextValue } });
      } else {
        // Fallback: append token to stored content
        const currentContent = (settings?.write?.content as string) ?? '';
        onPatch({ write: { ...(settings.write ?? {}), content: currentContent + token } });
      }
      setRteVarPickerOpen(false);
    },
    [settings, onPatch]
  );

  const uploaderRef = useRef<UploaderComponent | null>(null);

  const operation: WordNodeOperation | '' = settings.operation ?? '';

  // Selected file: either a default item or a local file
  const selectedDefaultKey: string | undefined = settings.defaultFileKey;
  const selectedDefault = useMemo(
    () => DEFAULT_WORD_FILES.find((f) => f.key === selectedDefaultKey),
    [selectedDefaultKey]
  );

  const fields = useMemo(() => ({ text: 'name', value: 'key' }), []);
  const defaultFileOptions = useMemo(() => DEFAULT_WORD_FILES.map(({ key, name }) => ({ key, name })), []);

  const fileChosen = (settings?.fileSource === 'device' && !!(settings?.deviceFileUrl || localFile)) || !!selectedDefault;
  const chosenName = (settings?.fileSource === 'device' ? (settings?.fileName || localFile?.name) : selectedDefault?.name) || '';
  const chosenUrl = (settings?.fileSource === 'device' ? (settings?.deviceFileUrl || localFileUrl) : selectedDefault?.url) || '';

  // Do not revoke blob URL on unmount; we store it in settings and revoke only when replaced/removed

  const patch = (p: Record<string, any>) => onPatch(p);

  // File upload handler
  const onUploaderSelected = useCallback(
    createUploadHandler({
      validExtensions: ['.doc', '.docx'],
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

  // File removal handler
  const onUploaderRemoving = useCallback(
    createRemovalHandler({
      onFileRemoved: () => {
        setLocalFile(null);
        setLocalFileUrl('');
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

  // File preview handler
  const onPreview = useCallback(
    createPreviewHandler({
      chosenUrl,
      localFile,
      localFileUrl,
      onError: setPreviewError,
    }),
    [chosenUrl, localFile, localFileUrl]
  );

  const onSelectDefault = (e: any) => {
    if (!e?.value) return;
    const sel = DEFAULT_WORD_FILES.find((d) => d.key === e.value);
    if (sel) {
      if (localFileUrl) URL.revokeObjectURL(localFileUrl);
      setLocalFile(null);
      setLocalFileUrl('');
      setPreviewError('');
      patch({
        defaultFileKey: sel.key,
        fileSource: 'default',
        fileName: sel.name,
      });
    }
  };

  // --- Placeholder detection (for Update Mapper) ---
  const extractPlaceholders = async () => {
    const loadArrayBuffer = async (): Promise<ArrayBuffer> => {
      if (localFile) return await localFile.arrayBuffer();
      if (chosenUrl) {
        const resp = await fetch(chosenUrl);
        const buf = await resp.arrayBuffer();
        return buf;
      }
      return new ArrayBuffer(0);
    };
    try {
      setParsing(true);
      const PizZip = (await import('pizzip')).default;
      const buf = await loadArrayBuffer();
      const zip = new PizZip(buf);

      // Gather text from all relevant XML parts to handle split runs
      const targets = Object.keys(zip.files).filter((k) => k.startsWith('word/') && k.endsWith('.xml'));
      const textSegments: string[] = [];
      for (const key of targets) {
        const xml = zip.file(key)?.asText() || '';
        // Extract text nodes content by stripping tags; this approximates concatenated text
        const stripped = xml.replace(/<[^>]+>/g, '');
        textSegments.push(stripped);
      }
      const fullText = textSegments.join('\n');
      const re = /\{\{\s*([a-zA-Z0-9_\.\-]+)\s*\}\}/g;
      const set = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = re.exec(fullText))) set.add(m[1]);
      const tags = Array.from(set);
      setPlaceholders(tags);
      return tags;
    } catch (e) {
      setPlaceholders([]);
      return [] as string[];
    } finally {
      setParsing(false);
    }
  };

  // Auto-parse when switching to Update operation and a file is present
  useEffect(() => {
    if (operation === 'Update (Mapper)' && fileChosen) {
      void extractPlaceholders();
    }
  }, [operation, fileChosen, chosenUrl]);

  // --- Renders ---
  const renderFilePicker = () => (
    <div className="config-section">
      <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
        <label className="config-label">Word document</label>
        <TooltipComponent content="Upload a Word file or select a built-in sample below. Drag & drop is supported.">
          <span className="e-icons e-circle-info help-icon"></span>
        </TooltipComponent>
      </div>

      {/* Uploader on top - hide when a default file is selected */}
      {!selectedDefault && (
        <UploaderComponent
          ref={uploaderRef as any}
          autoUpload={false}
          multiple={false}
          allowedExtensions=".doc,.docx"
          selected={onUploaderSelected}
          removing={onUploaderRemoving}
          dropArea=".config-panel-content"
          showFileList={true}
          cssClass="word-uploader"
          files={buildUploaderFiles({ settings, localFile }) as any}
        />
      )}

      {/* Default file dropdown below - hide when a local/device file is selected */}
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

      {/* Display selected file with remove option */}
      {(localFile || selectedDefault) && (
        <div className="textbox-info" style={{ marginTop: 8 , display: 'flex', alignItems: 'center'}}>
          <ButtonComponent 
            cssClass="flat-btn e-flat e-small" 
            iconCss="e-icons e-trash" 
            title="Remove file" 
            style={{marginRight: '10px'}}
            onClick={() => {
              onRemoveChosen();
              // Uploader list is controlled via `files` prop; no imperative clear needed
            }} 
          />
          <a onClick={onPreview} title='Download document' style={{ display: 'block', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chosenName}
          </a>

        </div>
      )}

      {previewError && (
        <div className="textbox-info" style={{ color: 'var(--danger-color)', marginTop: 8 }}>
          {previewError}
        </div>
      )}
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
            write: undefined,
            read: undefined,
            update: undefined,
          });
        }}
        enabled={!!fileChosen}
        popupHeight="240px"
        zIndex={1000000}
      />
    </div>
  );

  const renderWrite = () => {
    const write = settings.write ?? {};
    
    const toolbarItems = [
      'Undo', 'Redo', '|',
      'Bold', 'Italic', 'Underline', 'StrikeThrough', '|',
      'FontName', 'FontSize', 'FontColor', 'BackgroundColor', '|',
      'Formats', 'Alignments', 'Blockquote', '|', 'NumberFormatList', 'BulletFormatList',
      '|', 'CreateLink', 'Image', 'CreateTable', '|', 'ClearFormat'
    ];

    // Uses component-level `handleRteVariablePick` defined outside to insert variables

    return (
      <div className="config-section">
        {/* Write mode picker */}
        <div className="config-section">
          <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
            <label className="config-label">Write mode</label>
            <TooltipComponent content="Choose whether to append the new content at the end of the document or overwrite existing content.">
              <span className="e-icons e-circle-info help-icon"></span>
            </TooltipComponent>
          </div>
          <DropDownListComponent
            value={write.mode ?? 'Append'}
            dataSource={['Append', 'Overwrite']}
            placeholder="Select write mode"
            change={(e: any) => patch({ write: { ...write, mode: e.value || 'Append' } })}
            popupHeight="200px"
            zIndex={1000000}
          />
        </div>

        {/* Rich Text Editor for content input */}
        <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
          <label className="config-label">Content to Write</label>
          <TooltipComponent content="Enter formatted content to write into the document. Supports formatting, tables, images, variables, and paste from Word files with formatting preserved. Focus to open variable picker.">
            <span className="e-icons e-circle-info help-icon"></span>
          </TooltipComponent>
        </div>
        
        {/* Resizable container with min height */}
        <RichTextEditorComponent
          ref={(ref: any) => {
            if (ref) rteEditorRef.current = ref;
          }}
          id="word-write-editor"
          value={(write.content ?? '')}
          enableResize={true}
          change={(e: any) => patch({ write: { ...write, content: e.value } })}
          height="400px"
          toolbarSettings={{ items: toolbarItems as any }}
          enableXhtml={true}
          pasteCleanupSettings={{ 
            deniedTags: ['script', 'style'],
            keepFormat: true 
          }}
          focus={() => setRteVarPickerOpen(true)}
        >
          <Inject services={[Toolbar, HtmlEditor, Image, Link, QuickToolbar, Table, PasteCleanup, ImportExport, Resize]} />
        </RichTextEditorComponent>
  

        {/* Variable Picker Popup for RTE */}
        <VariablePickerPopup
          anchorEl={rteEditorRef.current?.element ?? null}
          open={rteVarPickerOpen}
          onClose={() => setRteVarPickerOpen(false)}
          onPick={handleRteVariablePick}
          variableGroups={variableGroups}
          zIndex={1000020}
        />
      </div>
    );
  };

  const renderRead = () => (
    <div className="config-section">
      <div className="textbox-info">Reads the attached file. No additional inputs are required.</div>
    </div>
  );

  const renderUpdateMapper = () => {
    const update = settings.update ?? {};
    const values: Record<string, string> = update.values ?? {};

    return (
      <>
        <div className="config-section">
          {!fileChosen ? (
            <div className="textbox-info">Attach a Word file to discover template placeholders like {'{{name}}'}.</div>
          ) : parsing ? (
            <div className="textbox-info">Analyzing document for placeholders…</div>
          ) : placeholders.length === 0 ? (
            <div className="textbox-info" style={{ color: 'var(--danger-color)' }}>
              No placeholders found in this document.
            </div>
          ) : (
            <>
              <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
                <label className="config-label">Template placeholders</label>
                <TooltipComponent content="Values will replace {{placeholders}} in the document during execution.">
                  <span className="e-icons e-circle-info help-icon"></span>
                </TooltipComponent>
              </div>

              {(placeholders || []).map((key) => (
                <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ minWidth: 180, fontSize: '.85rem'}} className="subtitle">{`{{${key}}}`}</div>
                  <VariablePickerTextBox
                    value={values[key] ?? ''}
                    onChange={(val) => patch({ update: { ...update, values: { ...(values || {}), [key]: val } } })}
                    placeholder="Value"
                    cssClass="config-input"
                    variableGroups={variableGroups}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </>
    );
  };

  const renderChatMessageInput = () => {
    return (
      <div className="config-section">
          <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
            <label className="config-label">Send message to chat (optional)</label>
            <TooltipComponent content="Returns the specified value as the chat response, if chat trigger is attached.">
              <span className="e-icons e-circle-info help-icon"></span>
            </TooltipComponent>
          </div>
        <VariablePickerTextBox
          value={settings.chatResponse ?? ''}
          onChange={(val) => patch({ chatResponse: val })}
          placeholder="Type a message or use variables"
          cssClass="config-input"
          variableGroups={variableGroups}
        />
      </div>
    )
  };

  return (
    <>
      {renderFilePicker()}
      {renderOperationPicker()}

      {operation === 'Write' && renderWrite()}
      {operation === 'Read' && renderRead()}
      {operation === 'Update (Mapper)' && renderUpdateMapper()}

      {renderChatMessageInput()}
    </>
  );
};

export default WordNodeConfig;
