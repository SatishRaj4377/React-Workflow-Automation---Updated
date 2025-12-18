import React, { useState } from 'react';
import { AppBarComponent } from '@syncfusion/ej2-react-navigations';
import { ButtonComponent, CheckBoxComponent, SwitchComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent, TooltipComponent } from '@syncfusion/ej2-react-popups';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { DropDownButtonComponent } from '@syncfusion/ej2-react-splitbuttons';
import { NumericTextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { DiagramSettings } from '../../types';
import { getDefaultDiagramSettings } from '../../utilities';
import { showErrorToast } from '../Toast';
import { CONNECTOR_STYLE_OPTIONS, GRID_STYLE_OPTIONS, SETTINGS_DROPDOWN_ITEMS } from '../../constants';
import './Header.css';

interface EditorHeaderProps {
  projectName?: string;
  onBack?: () => void;
  onSave?: () => void;
  enableSaveBtn?: boolean;
  onProjectNameChange?: (name: string) => void;
  diagramSettings?: DiagramSettings;
  onDiagramSettingsChange?: (settings: DiagramSettings) => void;
  onExport?: () => void;
  onImport?: (projectData: any) => void;
}

const EditorHeader: React.FC<EditorHeaderProps> = ({
  projectName = 'Untitled Workflow',
  onBack,
  onSave,
  enableSaveBtn,
  onProjectNameChange,
  diagramSettings = getDefaultDiagramSettings(),
  onExport,
  onImport,
  onDiagramSettingsChange,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  // PROJECT NAME EDIT HANDLERS - BEGIN
  const handleProjectNameEdit = () => {
    setIsEditing(true);
    setEditValue(projectName);
  };
  const handleProjectNameSave = () => {
    if (onProjectNameChange && editValue.trim()) {
      onProjectNameChange(editValue.trim());
    }
    setIsEditing(false);
  };
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleProjectNameSave();
    } else if (e.key === 'Escape') {
      setEditValue(projectName);
      setIsEditing(false);
    }
  };
  // PROJECT NAME EDIT HANDLERS - END

  // PROJECT SETTINGS HANDLERS - BEGIN
  const handleSettingsChange = (key: keyof DiagramSettings, value: any) => {
    if (onDiagramSettingsChange) {
      const newSettings = { ...diagramSettings, [key]: value };
      onDiagramSettingsChange(newSettings);
    }
  };
  const handleSettingsDropdownSelect = (args: any) => {
    switch (args.item.text) {
      case 'Settings':
        setIsSettingsDialogOpen(true);
        break;
      case 'Export':
        handleExport();
        break;
      case 'Import':
        handleImport();
        break;
    }
  };
  const handleExport = () => {
    if (onExport) {
      onExport();
    }
  };
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const projectData = JSON.parse(e.target?.result as string);
            if (onImport) {
              onImport(projectData);
            }
          } catch (error) {
            console.error('Error parsing JSON file:', error);
            showErrorToast('Invalid JSON file','Please select a valid project file.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };
  // PROJECT SETTINGS HANDLERS - END

  // Derived flags for UI state
  const isSnappingEnabled = !!(diagramSettings?.snapping && (diagramSettings.snapping.enableSnapToObjects || diagramSettings.snapping.enableSnapToGrid));
  const isOverviewEnabled = !!diagramSettings?.showOverview;

  return (
    <AppBarComponent id="workflow-appbar">
      <div className="appbar-left">
        {onBack && (
          <ButtonComponent
            cssClass="back-button e-flat"
            iconCss="e-icons e-arrow-left"
            onClick={onBack}
            title="Back to Home"
          />
        )}
        
        <div className="project-name-section">
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleProjectNameSave}
              onKeyDown={handleKeyPress}
              className="project-name-input"
              autoFocus
              placeholder="Enter project name"
            />
          ) : (
            <h1 className="project-name" onClick={handleProjectNameEdit}>
              <span className="project-name-text" title={projectName === "Untitled Workflow" ? "Click to edit" : projectName}>{projectName}</span>
              <span className="e-icons e-edit edit-icon" title="Click to edit"></span>
            </h1>
          )}
        </div>
      </div>

      <div className="appbar-right">
        {onSave && (
          <TooltipComponent
            content={
              enableSaveBtn
                ? `<span>Save Workflow <kbd>Ctrl</kbd> <kbd>S</kbd></span>`
                : 'Workflow Saved'
            }
          >
            <ButtonComponent
              onClick={onSave}
              className="header-btn save-btn e-primary"
              disabled={!enableSaveBtn}
              content={enableSaveBtn ? 'Save' : 'Saved'}
            />
          </TooltipComponent>
        )}
        <DropDownButtonComponent
          items={SETTINGS_DROPDOWN_ITEMS}
          select={handleSettingsDropdownSelect}
          iconCss="e-icons e-more-horizontal-1"
          cssClass="header-btn e-caret-hide more-btn e-secondary"
        />
      </div>

      {/* Settings Dialog */}
      <DialogComponent
        id="settings-dialog"
        header="Diagram Settings"
        visible={isSettingsDialogOpen}
        showCloseIcon={true}
        close={() => setIsSettingsDialogOpen(false)}
        overlayClick={() => setIsSettingsDialogOpen(false)}
        width="600px"
        height="auto"
        target={document.body}
        isModal={true}
        cssClass="settings-dialog-container"
        allowDragging={true}
        animationSettings={{ effect: 'None' }}
      >
        <div className="settings-dialog-content">
          <div className="settings-list">
            {/* Group: Grid Style */}
            <div className="settings-group">
              <div className="settings-row" title='Update the diagram grid type.'>
                <p className="settings-title">Grid Style</p>
                <div className="settings-control">
                  <DropDownListComponent
                    dataSource={GRID_STYLE_OPTIONS}
                    fields={{ text: 'text', value: 'value' }}
                    value={diagramSettings.gridStyle}
                    change={(args: any) => handleSettingsChange('gridStyle', args.value)}
                    width="220px"
                    cssClass="settings-dropdown"
                  />
                </div>
              </div>
            </div>

            {/* Group: Connector Type (+ conditional sub) */}
            <div className="settings-group">
              <div className="settings-row" title='Update the connector segments type.'>
                <p className="settings-title">Connector Type</p>
                <div className="settings-control">
                  <DropDownListComponent
                    dataSource={CONNECTOR_STYLE_OPTIONS}
                    fields={{ text: 'text', value: 'value' }}
                    value={diagramSettings.connectorType}
                    change={(args: any) => handleSettingsChange('connectorType', args.value)}
                    width="220px"
                    cssClass="settings-dropdown"
                  />
                </div>
              </div>
              {diagramSettings.connectorType === 'Orthogonal' && (
                <div className="settings-subgroup">
                  <div className="settings-sub-row">
                    <p className="settings-label">Connector Corner Radius</p>
                    <div className="settings-control">
                      <NumericTextBoxComponent
                        min={0}
                        max={50}
                        step={1}
                        format="n0"
                        width={120}
                        value={diagramSettings.connectorCornerRadius ?? 0}
                        change={(args) =>
                          handleSettingsChange(`connectorCornerRadius`, (args.value as number) ?? 0 )
                        }
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Group: Snapping (+ conditional sub) */}
            <div className="settings-group">
              <div className="settings-row" title='Snap elements to grid or nearby objects for precise alignment.'>
                <p className="settings-title">Enable Snapping</p>
                <div className="settings-control">
                  <SwitchComponent
                    checked={diagramSettings.snapping && (!!diagramSettings.snapping.enableSnapToObjects || !!diagramSettings.snapping.enableSnapToGrid)}
                    change={(e) => {
                      const nextSnapping = {
                        ...(diagramSettings.snapping || {}),
                        enableSnapToObjects: !!e.checked,
                        enableSnapToGrid: !!e.checked,
                        isEnabled: !!e.checked,
                      } as any;
                      handleSettingsChange('snapping', nextSnapping)
                    }}
                    cssClass="settings-switch"
                  />
                </div>
              </div>
              <div className={`settings-subgroup ${isSnappingEnabled ? '' : 'is-disabled'}`}>
                <div className="settings-sub-row" title='Align nodes to nearby shapes using smart guides.'>
                  <p className="settings-label">Snap to objects</p>
                  <div className="settings-control">
                    <CheckBoxComponent
                      checked={!!diagramSettings.snapping?.enableSnapToObjects}
                      disabled={!isSnappingEnabled}
                      change={(e) => handleSettingsChange('snapping', { ...(diagramSettings.snapping || {}), enableSnapToObjects: e.checked })}
                    />
                  </div>
                </div>
                <div className="settings-sub-row" title='Snap elements to the nearest grid intersection.'>
                  <p className="settings-label">Snap to grid</p>
                  <div className="settings-control">
                    <CheckBoxComponent
                      checked={!!diagramSettings.snapping?.enableSnapToGrid}
                      disabled={!isSnappingEnabled}
                      change={(e) => handleSettingsChange('snapping', { ...(diagramSettings.snapping || {}), enableSnapToGrid: e.checked })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Group: Overview (+ conditional sub) */}
            <div className="settings-group">
              <div className="settings-row" title='Show a minimap for quick navigation, visible only when scrolling or zooming.'>
                <p className="settings-title">Show Overview Panel</p>
                <div className="settings-control">
                <SwitchComponent
                    checked={diagramSettings.showOverview}
                    change={(args) => {
                      if (!args.checked) {
                        // When overview is turned off, also uncheck the sub-setting
                        if (onDiagramSettingsChange) {
                          onDiagramSettingsChange({
                            ...diagramSettings,
                            showOverview: false,
                            showOverviewAlways: false,
                          });
                        }
                      } else {
                        handleSettingsChange('showOverview', true);
                      }
                    }}
                    cssClass="settings-switch"
                  />
                </div>
              </div>
              <div className={`settings-subgroup ${isOverviewEnabled ? '' : 'is-disabled'}`}>
                <div className="settings-sub-row" title='Keep the overview panel visible at all times.'>
                  <p className="settings-label">Show overview panel always</p>
                  <div className="settings-control">
                    <CheckBoxComponent
                      checked={!!diagramSettings.showOverviewAlways}
                      disabled={!isOverviewEnabled}
                      change={(e) => handleSettingsChange('showOverviewAlways', e.checked)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogComponent>
    </AppBarComponent>
  );
};

export default EditorHeader;