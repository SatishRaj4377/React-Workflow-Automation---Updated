import React, { useCallback, useEffect, useState } from 'react';
import { SidebarComponent, TabComponent, TabItemsDirective, TabItemDirective } from '@syncfusion/ej2-react-navigations';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { TooltipComponent } from '@syncfusion/ej2-react-popups';
import { IconRegistry } from '../../assets/icons';
import { ExecutionContext, NodeConfig, NodeType } from '../../types';
import { Diagram } from '@syncfusion/ej2-diagrams';
import { VariablePickerTextBox } from './components/VariablePickerTextBox';
import JsonVisualizer from './components/JsonVisualizer';
import ValuePeekPanel, { PeekInfo } from './components/ValuePeekPanel';
import { updateSwitchPorts, getAvailableVariablesForNode, getNodeOutputAsVariableGroup, buildJsonFromVariables } from '../../utilities';
import WordNodeConfig from './nodeConfigs/WordNodeConfig';
import ExcelNodeConfig from './nodeConfigs/ExcelNodeConfig';
import ConditionNodeConfig from './nodeConfigs/ConditionNodeConfig';
import FormNodeConfig from './nodeConfigs/FormNodeConfig';
import FormPopup from '../FormPopup';
import NotifyNodeConfig from './nodeConfigs/NotifyNodeConfig';
import './NodeConfigSidebar.css';

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNodeConfig: NodeConfig | null;
  diagram: Diagram | null;
  executionContext: ExecutionContext;
  onExecuteNode: (nodeId: string) => void;
  onNodeConfigChange: (nodeId: string, config: NodeConfig) => void;
  isChatOpen: boolean;
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>
}

const NodeConfigSidebar: React.FC<ConfigPanelProps> = ({
  isOpen,
  onClose,
  onExecuteNode,
  selectedNodeConfig,
  diagram,
  executionContext,
  onNodeConfigChange,
  isChatOpen,
  setChatOpen,
}) => {
  // ========================================================================
  // State Management - UI & Data
  // ========================================================================
  const [activeTab, setActiveTab] = useState(0); // Current tab index 
  const [availableVariables, setAvailableVariables] = useState<any[]>([]); // Variables from previous executed nodes
  const [nodeOutput, setNodeOutput] = useState<any>(null); // Execution output of selected node
  const [peek, setPeek] = useState<PeekInfo>(null); // JSON value peek info for visualization
  const [formPreviewOpen, setFormPreviewOpen] = useState(false); // Form preview modal state
  const [formPreviewError, setFormPreviewError] = useState<string>(''); // Form preview validation error

  // Draft state for non-destructive editing
  const [draftGeneral, setDraftGeneral] = useState<any>({});
  const [draftName, setDraftName] = useState<string>('');

  // Initialize/reset draft when node changes
  useEffect(() => {
    const g = (selectedNodeConfig?.settings && (selectedNodeConfig.settings as any).general) || {};
    setDraftGeneral(g);
    setDraftName(selectedNodeConfig?.displayName ?? '');
  }, [selectedNodeConfig?.id]);

  const isDirty = React.useMemo(() => {
    if (!selectedNodeConfig) return false;
    try {
      const current = (selectedNodeConfig.settings && (selectedNodeConfig.settings as any).general) || {};
      const sameGeneral = JSON.stringify(current) === JSON.stringify(draftGeneral || {});
      const sameName = (selectedNodeConfig.displayName ?? '') === (draftName ?? '');
      return !(sameGeneral && sameName);
    } catch {
      return true;
    }
  }, [selectedNodeConfig, draftGeneral, draftName]);

  // Commit draft to parent config
  const commitDraft = useCallback(() => {
    if (!selectedNodeConfig || !isDirty) return;
    const updatedConfig: NodeConfig = {
      ...selectedNodeConfig,
      displayName: draftName,
      settings: {
        ...selectedNodeConfig.settings,
        general: { ...(draftGeneral || {}) },
      },
    };
    onNodeConfigChange(selectedNodeConfig.id, updatedConfig);
  }, [selectedNodeConfig, draftGeneral, draftName, isDirty, onNodeConfigChange]);

  // ========================================================================
  // Derived State & Icons
  // ========================================================================
  const nodeIconSrc = selectedNodeConfig?.icon ? IconRegistry[selectedNodeConfig.icon] : null; // Node type icon
  const MessageIcon = IconRegistry['Message']; // Chat trigger icon

  // ========================================================================
  // Effects - Data Fetching & Sync
  // ========================================================================

  // Fetch available variables and node output when node/diagram changes; sync Switch Case ports
  useEffect(() => {
    const fetchData = async () => {
      // Reset state if no node or diagram
      if (!selectedNodeConfig || !diagram) {
        setAvailableVariables([]);
        setNodeOutput(null);
        return;
      }

      // Fetch upstream variables available to this node
      const vars = await getAvailableVariablesForNode(
        selectedNodeConfig.id,
        diagram,
        executionContext
      );

      // Get the output produced by this node after execution
      const output = getNodeOutputAsVariableGroup(
        selectedNodeConfig.id,
        diagram,
        executionContext
      );

      setAvailableVariables(vars);
      setNodeOutput(output);
    };

    fetchData();

    // Sync dynamic ports for Switch Case nodes (update port count if cases change)
    if (selectedNodeConfig && diagram && selectedNodeConfig.nodeType === 'Switch Case') {
      const general = (selectedNodeConfig?.settings?.general as any) ?? {};
      const rules = general?.rules as any[] | undefined;
      const desired = Math.max(1, rules?.length ?? 1);
      const node: any = (diagram as any).getObject(selectedNodeConfig.id);
      const enableDefault = !!general?.enableDefaultPort;
      const existing = (node?.addInfo?.dynamicCaseCount)
        ?? (Array.isArray(node?.ports) ? node.ports.filter((p: any) => String(p.id).startsWith('right-case-')).length : 0)
        ?? 0;
      if (existing !== desired) {
        updateSwitchPorts(diagram as any, selectedNodeConfig.id, desired, enableDefault);
      }
    }
  }, [selectedNodeConfig?.id, diagram, executionContext]);

  // ========================================================================
  // Event Handlers - Config Changes & Validation
  // ========================================================================

  // Update a config field or section; skip if no actual change detected
  // Update config field or section; skip if no actual change detected to optimize re-renders
  const handleConfigChange = (
    fieldOrPatch: string | Record<string, any>,
    value?: any,
    section: 'general' = 'general'
  ) => {
    if (section !== 'general') return; // only general supported here
    const prevSection = draftGeneral || {};
    const nextSection =
      typeof fieldOrPatch === 'object' && fieldOrPatch !== null
        ? { ...prevSection, ...fieldOrPatch }
        : { ...prevSection, [fieldOrPatch as any]: value };

    // Only update draft if something changed
    let same = true;
    for (const k of Object.keys(nextSection)) {
      if (prevSection[k] !== nextSection[k]) { same = false; break; }
    }
    if (same) return;

    setDraftGeneral(nextSection);

    // Close form preview if form settings changed
    if (selectedNodeConfig?.nodeType === 'Form' && formPreviewOpen) {
      setFormPreviewOpen(false);
    }
  };

  // Update the node's display name
  const handleNameChange = (value: string) => {
    setDraftName(value);
  };

  // ========================================================================
  // Node-Specific Config Renderers
  // ========================================================================
  // These handle type-specific configuration fields displayed in the General tab

  /** Form node: fields editor + preview button */
  const renderFormNodeConfig = (settings: any) => {
    const fields = (settings.formFields ?? [
      { label: '', type: 'text', placeholder: '', required: false },
    ]) as any[];

    const onPreview = () => {
      setFormPreviewError('');
      const title = settings.formTitle?.trim?.() || '';
      if (!title) {
        setFormPreviewError('Please enter Form Title before preview.');
        return;
      }
      // Validate all fields are complete
      const invalid = fields.some((f: any) => {
        if (!f || !f.type) return true;
        if (!f.label || String(f.label).trim() === '') return true;
        if (f.type === 'dropdown') {
          const opts = Array.isArray(f.options) ? f.options.filter((o: any) => String(o).trim() !== '') : [];
          if (opts.length === 0) return true;
        }
        return false;
      });
      if (invalid) {
        setFormPreviewError('Please complete all fields. Ensure each field has a label and dropdowns have options.');
        return;
      }
      setFormPreviewOpen(true);
    };

    return (
      <>
        <div className="config-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <ButtonComponent cssClass="e-flat flat-btn" iconCss="e-icons e-eye" onClick={onPreview}>
            Show Form Preview
          </ButtonComponent>
          {formPreviewError && <div style={{ color: 'var(--danger-color)' }}>{formPreviewError}</div>}
        </div>

        <FormNodeConfig
          title={settings.formTitle ?? ''}
          description={settings.formDescription ?? ''}
          value={fields}
          onChange={(next) => handleConfigChange('formFields', next)}
          onMetaChange={(patch) => handleConfigChange(patch)}
        />

        <FormPopup
          open={formPreviewOpen}
          onClose={() => setFormPreviewOpen(false)}
          title={settings.formTitle ?? ''}
          description={settings.formDescription ?? ''}
          fields={fields}
          showPreviewBadge={true}
        />
      </>
    );
  };

  /** Chat node: chat button toggle + prompt suggestions list + optional banner text */
  const renderChatNodeConfig = (settings: any) => {
    const promptSuggestions: string[] = settings.promptSuggestions ?? [];
    const bannerText: string = settings.bannerText ?? '';

    const addSuggestion = () => {
      const next = [...promptSuggestions, ''];
      handleConfigChange({ promptSuggestions: next });
    };

    const updateSuggestion = (i: number, val: string) => {
      const next = promptSuggestions.slice();
      next[i] = val;
      handleConfigChange({ promptSuggestions: next });
    };

    const removeSuggestion = (i: number) => {
      const next = promptSuggestions.filter((_, idx) => idx !== i);
      handleConfigChange({ promptSuggestions: next });
    };

    const updateBanner = (val: string) => {
      handleConfigChange({ bannerText: val });
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wf:chat:update-banner', { detail: { text: (val || '').trim() } }));
        }
      } catch {}
    };

    return (
      <>
        {/* Chat visibility toggle */}
        <div className="config-section">
          <ButtonComponent
            onClick={() => setChatOpen(prev => !prev)}
            className='show-chat-button e-primary'
          >
            <MessageIcon className='msg-svg-icon' />
            <span className='show-chat-btn-text'>
              {isChatOpen ? 'Hide Chat' : ' Open Chat'}
            </span>
          </ButtonComponent>
        </div>

        {/* Banner template text */}
        <div className="config-section">
          <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
            <label className="config-label">Banner text (optional)</label>
            <TooltipComponent content="Customize the banner shown at the top of the chat popup. Leave empty to use the default banner.">
              <span className="e-icons e-circle-info help-icon"></span>
            </TooltipComponent>
          </div>
          <TextBoxComponent
            value={(bannerText && bannerText.trim()) || 'Send a message below to trigger the chat workflow'}
            placeholder=""
            change={(e: any) => updateBanner(e.value)}
            cssClass="config-input"
            multiline
          />
        </div>

        {/* Prompt suggestions list */}
        <div className="config-section">
          <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
            <label className="config-label">Prompt suggestions (optional)</label>
            <TooltipComponent content="Add quick prompts that appear in the chat popup.">
              <span className="e-icons e-circle-info help-icon"></span>
            </TooltipComponent>
          </div>

          {(promptSuggestions ?? []).map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <VariablePickerTextBox
                value={s}
                onChange={(val) => updateSuggestion(i, val)}
                placeholder="Type a suggestion…"
                cssClass="config-input"
                variableGroups={availableVariables}
              />
              <ButtonComponent
                cssClass="flat-btn e-flat"
                iconCss="e-icons e-trash"
                onClick={() => removeSuggestion(i)}
                title="Remove"
              />
            </div>
          ))}

          <ButtonComponent
            className="e-secondary add-field-btn"
            iconCss="e-icons e-plus"
            onClick={addSuggestion}
          >
            Add suggestion
          </ButtonComponent>
        </div>
      </>
    );
  };

  /** HTTP Request node: URL + method + query params + headers */
  const renderHttpRequestNodeConfig = (settings: any) => {
    const method = 'GET'; // Locked to GET
    const queryParams: Array<{ key: string; value: string }> =
      Array.isArray(settings.queryParams) && settings.queryParams.length
        ? settings.queryParams
        : [{ key: '', value: '' }];

    const addQueryParam = () => {
      const next = [...queryParams, { key: '', value: '' }];
      handleConfigChange({ queryParams: next, method });
    };

    const updateQueryParam = (i: number, field: 'key' | 'value', val: string) => {
      const next = queryParams.slice();
      next[i] = { ...next[i], [field]: val };
      handleConfigChange({ queryParams: next, method });
    };

    const removeQueryParam = (i: number) => {
      const next = queryParams.filter((_, idx) => idx !== i);
      handleConfigChange({ queryParams: next.length ? next : [{ key: '', value: '' }], method });
    };

    return (
      <>
        {/* URL input */}
        <div className="config-section">
          <label className="config-label">URL</label>
          <VariablePickerTextBox
            value={settings.url ?? ''}
            placeholder="https://api.example.com/resource"
            onChange={(val) => handleConfigChange('url', val)}
            cssClass="config-input"
            variableGroups={availableVariables}
          />
        </div>

        {/* Method (read-only) */}
        <div className="config-section">
          <label className="config-label">Method</label>
          <DropDownListComponent
            value={method}
            dataSource={["GET"]}
            placeholder="GET"
            enabled={false}
            popupHeight="200px"
            zIndex={1000000}
          />
        </div>

        {/* Query parameters table */}
        <div className="config-section">
          <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
            <label className="config-label">Query Parameters</label>
            <TooltipComponent content="Add query params as name/value pairs.">
              <span className="e-icons e-circle-info help-icon"></span>
            </TooltipComponent>
          </div>

          {queryParams.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <VariablePickerTextBox
                value={row.key}
                placeholder="name"
                onChange={(val) => updateQueryParam(i, 'key', val)}
                cssClass="config-input"
                variableGroups={availableVariables}
              />
              <VariablePickerTextBox
                value={row.value}
                placeholder="value"
                onChange={(val) => updateQueryParam(i, 'value', val)}
                cssClass="config-input"
                variableGroups={availableVariables}
              />
              <ButtonComponent
                cssClass="flat-btn e-flat"
                iconCss="e-icons e-trash"
                onClick={() => removeQueryParam(i)}
                title="Remove"
              />
            </div>
          ))}

          <ButtonComponent className="add-field-btn e-secondary" iconCss="e-icons e-plus" onClick={addQueryParam}>
            Add Query
          </ButtonComponent>
        </div>

        {/* Headers (JSON) */}
        <div className="config-section">
          <label className="config-label">Headers (JSON)</label>
          <TextBoxComponent
            value={settings.headers ?? ''}
            placeholder='{"Authorization":"Bearer {{token}}"}'
            change={(e: any) => handleConfigChange('headers', e.value)}
            cssClass="config-textarea"
            multiline
          />
        </div>
      </>
    );
  };

  /** Render node-specific fields based on node type */
  const renderNodeSpecificFields = (type: NodeType, settings: any) => {
    switch (type) {
      case 'Form':
        return renderFormNodeConfig(settings);
      case 'Chat':
        return renderChatNodeConfig(settings);
      case 'HTTP Request':
        return renderHttpRequestNodeConfig(settings);
      case 'Word':
        return (
          <WordNodeConfig
            settings={settings}
            onPatch={(patch) => handleConfigChange(patch, undefined, 'general')}
            variableGroups={availableVariables}
          />
        );

      case 'Excel':
        return (
          <ExcelNodeConfig
            settings={settings}
            onPatch={(patch) => handleConfigChange(patch, undefined, 'general')}
            variableGroups={availableVariables}
          />
        );

      case 'Notify':
        return (
          <NotifyNodeConfig
            settings={settings}
            onPatch={(patch) => handleConfigChange(patch, undefined, 'general')}
            variableGroups={availableVariables}
          />
        );

      case 'Stop': {
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
              onChange={(val) => handleConfigChange('chatResponse', val)}
              placeholder="Type a message or use variables"
              cssClass="config-input"
              variableGroups={availableVariables}
            />
          </div>
        );
      }

      case 'If Condition': {
        const conditions = (settings.conditions ?? [
          { left: '', comparator: 'is equal to', right: '' },
        ]) as any[];

        return (
          <ConditionNodeConfig
            value={conditions}
            onChange={(next) => handleConfigChange('conditions', next)}
            variableGroups={availableVariables}
            label="Conditions"
          />
        );
      }

      case 'Switch Case': {
        const rules = (settings.rules ?? [{ left: '', comparator: 'is equal to', right: '', name: '' }]) as Array<{ left: string; comparator: string; right: string; name?: string }>;
        const rows = rules.map(r => ({ left: r.left, comparator: r.comparator, right: r.right, name: r.name ?? '' }));

        const onRowsChange = (nextRows: any[]) => {
          // Persist back as 'rules' (ignore joiners)
          handleConfigChange('rules', nextRows.map(r => ({ left: r.left ?? '', comparator: r.comparator, right: r.right ?? '', name: r.name ?? '' })));
          if (diagram && selectedNodeConfig) {
            const count = Math.max(1, nextRows.length);
            updateSwitchPorts(diagram as any, selectedNodeConfig.id, count);
          }
        };

        return (
          <ConditionNodeConfig
            value={rows as any}
            onChange={onRowsChange}
            variableGroups={availableVariables}
            label="Cases"
            showJoiners={false}
          />
        );
      }

      case 'Filter': {
        const conditions = (settings.conditions ?? [
          { left: '', comparator: 'is equal to', right: '' },
        ]) as any[];

        return (
          <>
            <div className="config-section">
              <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
                <label className="config-label">Items (list) to filter</label>
                <TooltipComponent content="Select an array from previous nodes using the picker (e.g., $.NodeName#ID.rows). This defines $.item for conditions.">
                  <span className="e-icons e-circle-info help-icon"></span>
                </TooltipComponent>
              </div>
              <VariablePickerTextBox
                value={settings.input ?? ''}
                placeholder="$.previousNode.items"
                onChange={(val) => handleConfigChange('input', val)}
                cssClass="config-input"
                variableGroups={availableVariables}
              />
            </div>

            <ConditionNodeConfig
            value={conditions}
            onChange={(next) => handleConfigChange('conditions', next)}
            variableGroups={availableVariables}
            label="Conditions"
            leftMode={'itemField'}
              leftBaseListExpr={settings.input ?? ''}
            />
          </>
        );
      }

      case 'Loop': {
        return (
          <div className="config-section">
            <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
              <label className="config-label">Items (list) to iterate</label>
              <TooltipComponent content="Choose an array from previous nodes. Each downstream node will run once per item.">
                <span className="e-icons e-circle-info help-icon"></span>
              </TooltipComponent>
            </div>
            <VariablePickerTextBox
              value={settings.input ?? ''}
              placeholder="$.previousNode.items"
              onChange={(val) => handleConfigChange('input', val)}
              cssClass="config-input"
              variableGroups={availableVariables}
            />
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ========================================================================
  // Tab Renderers - General / Authentication / Output
  // ========================================================================

  // General tab: node name + type-specific config
  const renderGeneralTab = useCallback(() => {
    console.log(selectedNodeConfig)
    const settings = draftGeneral || {};
    return (
      <div className="config-tab-content">
        <div className="config-section">
          <label className="config-label">Node Name</label>
          <TextBoxComponent
            value={selectedNodeConfig?.displayName ?? ''}
            placeholder="Enter node name"
            change={(e: any) => handleNameChange(e.value)}
            cssClass="config-input"
          />
        </div>
        {renderNodeSpecificFields(selectedNodeConfig!.nodeType, settings)}
      </div>
    );
  }, [selectedNodeConfig?.id, draftGeneral, availableVariables, isChatOpen, formPreviewOpen, formPreviewError]);

  // Output tab: execution results (JSON visualizer + value peek)
  const renderOutputTab = useCallback(() => {
    if (!nodeOutput) {
      return (
        <div className="config-tab-content">
          <div className="config-section-empty">
            <p>This node has not been executed yet or did not produce an output.</p>
            <p>Run the workflow to see the output here.</p>
          </div>
        </div>
      );
    }

    const outputJson = buildJsonFromVariables(nodeOutput.variables);

    return (
      <div className="config-tab-content">
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            padding: '.4rem',
            background: 'var(--surface-color)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <JsonVisualizer
            data={outputJson}
            collapsed={false}
            onValuePeek={(info) => setPeek(info)}
          />
          <ValuePeekPanel peek={peek} onClose={() => setPeek(null)} />
        </div>
      </div>
    );
  }, [nodeOutput, peek]);

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <SidebarComponent
      id="config-panel-sidebar"
      className={`custom-config-panel`}
      width={'400px'}
      position="Left"
      type="Over"
      isOpen={isOpen}
      close={onClose}
      enableGestures={false}
      target=".editor-content"
    >
      {!selectedNodeConfig ? (
        // Empty state: no node selected
        <div className="config-panel-empty">
          <div className="empty-state-icon">⚙️</div>
          <h3>No Node Selected</h3>
          <p>Select a node from the diagram to configure its properties</p>
        </div>
      ) : (
        <>
          {/* -------- Header: node type + delete/close buttons -------- */}
          <div className="config-panel-header">
            <div className="config-panel-title">
              <span className="node-icon">
                {typeof nodeIconSrc === 'string' && (
                  <img src={nodeIconSrc} draggable={false} />
                )}
              </span>
              <TooltipComponent content={`${selectedNodeConfig?.nodeType || 'Node'} Configuration`}>
                <h3>{selectedNodeConfig?.nodeType || 'Node'} Configuration</h3>
              </TooltipComponent>
            </div>
            <div>
              
              <ButtonComponent
                cssClass="close-btn e-flat"
                iconCss="e-icons e-play"
                title='Execute Node'
                onClick={() => {
                  if (selectedNodeConfig && onExecuteNode) {
                    onExecuteNode(selectedNodeConfig.id);
                  }
                }}
              />
              <ButtonComponent
                cssClass="close-btn e-flat"
                iconCss="e-icons e-close"
                onClick={onClose}
              />
            </div>
          </div>

          {/* -------- Body: tabs with General / Auth / Output -------- */}
          <div className="config-panel-content">
            <TabComponent
              heightAdjustMode="None"
              selected={(e: any) => setActiveTab(e.selectedIndex)}
              selectedItem={activeTab}
              cssClass="config-tabs"
            >
              <TabItemsDirective>
                {/* General tab: always shown */}
                <TabItemDirective header={{ text: 'General' }} content={renderGeneralTab} />

                {/* Output tab: shown when node has been executed and produced output */}
                {nodeOutput && (
                  <TabItemDirective header={{ text: 'Output' }} content={renderOutputTab} />)
                }
              </TabItemsDirective>
            </TabComponent>
          </div>

          {/* -------- Footer: fixed at bottom with Update button -------- */}
          <div className="config-panel-footer">
            <ButtonComponent
              cssClass="e-secondary update-btn"
              onClick={commitDraft}
              disabled={!isDirty}
            >
              Update
            </ButtonComponent>
          </div>
        </>
      )}
    </SidebarComponent>
  );
};

export default NodeConfigSidebar;
