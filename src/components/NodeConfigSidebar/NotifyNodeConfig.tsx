import React from 'react';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { VariablePickerTextBox } from './VariablePickerTextBox';
import { TooltipComponent } from '@syncfusion/ej2-react-popups';
import './NodeConfigSidebar.css';

type Props = {
  settings: any;
  onPatch: (patch: Record<string, any>) => void;
  variableGroups: any[];
  variablesLoading: boolean;
};

const TYPES = ['success', 'error', 'info', 'warning'] as const;

const NotifyNodeConfig: React.FC<Props> = ({ settings, onPatch, variableGroups, variablesLoading }) => {
  const type = (settings.type as typeof TYPES[number]) || 'info';
  const title = settings.title ?? 'Notification';
  const message = settings.message ?? '';

  return (
    <>
      <div className="config-section">
        <label className="config-label">Status type</label>
        <DropDownListComponent
          value={type}
          dataSource={TYPES as unknown as string[]}
          change={(e: any) => onPatch({ type: e.value })}
          popupHeight="220px"
          zIndex={1000000}
        />
      </div>
      <div className="config-section">
        <label className="config-label">Title</label>
        <VariablePickerTextBox
          value={title}
          onChange={(val) => onPatch({ title: val })}
          placeholder="Notification title"
          cssClass="config-input"
          variableGroups={variableGroups}
          variablesLoading={variablesLoading}
        />
      </div>
      <div className="config-section">
        <label className="config-label">Message</label>
        <VariablePickerTextBox
          value={message}
          onChange={(val) => onPatch({ message: val })}
          placeholder="Type a message..."
          cssClass="config-textarea"
          multiline
          variableGroups={variableGroups}
          variablesLoading={variablesLoading}
        />
      </div>

      <div className="config-section">
        <div className="config-row" style={{ alignItems: 'center', gap: 8 }}>
          <label className="config-label">Send message to chat (optional)</label>
          <TooltipComponent content="Returns the specified value as the chat response, if chat trigger is attached.">
            <span className="e-icons e-circle-info help-icon"></span>
          </TooltipComponent>
        </div>
        <VariablePickerTextBox
          value={settings.chatResponse ?? ''}
          onChange={(val) => onPatch({ chatResponse: val })}
          placeholder="Type a message or use variables"
          cssClass="config-input"
          variableGroups={variableGroups}
          variablesLoading={variablesLoading}
        />
      </div>
    </>
  );
};

export default NotifyNodeConfig;
