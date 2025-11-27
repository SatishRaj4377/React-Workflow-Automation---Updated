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

  return (
    <AppBarComponent id="workflow-appbar">
      <div className="appbar-left">
        {onBack && (
          <ButtonComponent
            cssClass="back-button"
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
              className="header-btn save-btn"
              disabled={!enableSaveBtn}
              content={enableSaveBtn ? 'Save' : 'Saved'}
            />
          </TooltipComponent>
        )}
        <DropDownButtonComponent
          items={SETTINGS_DROPDOWN_ITEMS}
          select={handleSettingsDropdownSelect}
          iconCss="e-icons e-more-horizontal-1"
          cssClass="header-btn e-caret-hide more-btn"
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
        width="760px"
        height="auto"
        target={document.body}
        isModal={true}
        cssClass="settings-dialog-container"
        allowDragging={true}
        animationSettings={{ effect: 'None' }}
      >
        <div className="settings-dialog-content">
          <div className="settings-grid">
            {/* Grid Style Settings */}
            <div className="settings-section">
              <h3 className="settings-section-title">Grid Settings</h3>
              
              <div className="settings-item" title='Update the diagram grid type.'>
                <label className="settings-label">Grid Style</label>
                <DropDownListComponent
                  dataSource={GRID_STYLE_OPTIONS}
                  fields={{ text: 'text', value: 'value' }}
                  value={diagramSettings.gridStyle}
                  change={(args: any) => handleSettingsChange('gridStyle', args.value)}
                  width="150px"
                  cssClass="settings-dropdown"
                />
              </div>
            </div>

            {/* Connector Style Settings */}
            <div className="settings-section">
              <h3 className="settings-section-title">Connector Settings</h3>
              <div className="settings-item" title='Update the connector segments type.'>
                <label className="settings-label">Connector type</label>
                  <DropDownListComponent
                    dataSource={CONNECTOR_STYLE_OPTIONS}
                    fields={{ text: 'text', value: 'value' }}
                    value={diagramSettings.connectorType}
                    change={(args: any) => handleSettingsChange('connectorType', args.value)}
                    width="150px"
                    cssClass="settings-dropdown"
                  />
              </div>
              {diagramSettings.connectorType === 'Orthogonal' && (
              <div className="settings-sub">
                <div className="settings-item">
                    <label>Connector corner radius</label>
                    <NumericTextBoxComponent
                      min={0}
                      max={50}
                      step={1}
                      format="n0"
                      width="100px"
                      value={diagramSettings.connectorCornerRadius ?? 0}
                      change={(args) =>
                        handleSettingsChange(`connectorCornerRadius`, (args.value as number) ?? 0 )
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Snap Settings */}
            <div className="settings-section">
              <h3 className="settings-section-title">Snapping Settings</h3>
              <div className="settings-item" title='Snap elements to grid or nearby objects for precise alignment.'>
                <label className="settings-label">Enable Snapping</label>
                <SwitchComponent
                  checked={diagramSettings.snapping && (!!diagramSettings.snapping.enableSnapToObjects || !!diagramSettings.snapping.enableSnapToGrid)}
                  change={(e) => {
                    // Turn on all the sub-settings on switching on the main snapsettings switch 
                    if (e.checked){
                      diagramSettings.snapping.enableSnapToObjects = true;
                      diagramSettings.snapping.enableSnapToGrid = true;
                    }
                    // Turn off all the sub-settings on switching off the main snapsettings switch 
                    if (!e.checked){
                      diagramSettings.snapping.enableSnapToObjects = false;
                      diagramSettings.snapping.enableSnapToGrid = false;
                    }
                    handleSettingsChange('snapping', {...diagramSettings.snapping, isEnabled: e.checked})
                  }}
                  cssClass="settings-switch"
                />
              </div>
              {/* Snapping Sub Settings */}
              {diagramSettings.snapping && (!!diagramSettings.snapping.enableSnapToObjects || !!diagramSettings.snapping.enableSnapToGrid) && (
                <div className="settings-sub">
                  <div className="settings-item" title='Align nodes to nearby shapes using smart guides.'>
                    <label>Snap to objects</label>
                    <CheckBoxComponent
                      checked={!!diagramSettings.snapping.enableSnapToObjects}
                      change={(e) => handleSettingsChange('snapping', {...diagramSettings.snapping, enableSnapToObjects: e.checked})}
                    />
                  </div>
                  <div className="settings-item" title='Snap elements to the nearest grid intersection.'>
                    <label>Snap to grid</label>
                    <CheckBoxComponent
                      checked={!!diagramSettings.snapping.enableSnapToGrid}
                      change={(e) => handleSettingsChange('snapping', {...diagramSettings.snapping, enableSnapToGrid: e.checked})}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Overview Panel Settings */}
            <div className="settings-section">
              <h3 className="settings-section-title">Overview Panel</h3>
              <div className="settings-item" title='Display a mini map for quick navigation across large diagrams.'>
                <label className="settings-label">Show Overview Panel</label>
                <SwitchComponent
                  checked={diagramSettings.showOverview}
                  change={(args) => handleSettingsChange('showOverview', args.checked)}
                  cssClass="settings-switch"
                />
              </div>
              {/* Overview panel Sub Settings */}
              {diagramSettings.showOverview && (
                <div className="settings-sub">
                  <div className="settings-item" title='Keep the overview panel visible at all times.'>
                    <label>Show overview panel always</label>
                    <CheckBoxComponent
                      checked={!!diagramSettings.showOverviewAlways}
                      change={(e) => handleSettingsChange('showOverviewAlways', e.checked)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogComponent>
    </AppBarComponent>
  );
};

export default EditorHeader;