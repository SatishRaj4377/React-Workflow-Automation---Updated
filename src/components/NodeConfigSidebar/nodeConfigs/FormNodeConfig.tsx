import React, { useMemo } from 'react';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { ButtonComponent, CheckBoxComponent } from '@syncfusion/ej2-react-buttons';

export type FormFieldType = 'text' | 'textarea' | 'number' | 'password' | 'email' | 'dropdown' | 'date' | 'time';

export interface FormFieldRow {
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

export interface FormNodeConfigProps {
  title: string;
  description: string;
  value?: FormFieldRow[];
  onChange: (rows: FormFieldRow[]) => void;
  onMetaChange: (patch: { formTitle?: string; formDescription?: string }) => void;
}

const FIELD_TYPE_OPTIONS: { text: string; value: FormFieldType }[] = [
  { text: 'Text', value: 'text' },
  { text: 'Text Area', value: 'textarea' },
  { text: 'Number', value: 'number' },
  { text: 'Password', value: 'password' },
  { text: 'Email', value: 'email' },
  { text: 'Dropdown', value: 'dropdown' },
  { text: 'Date', value: 'date' },
  { text: 'Time', value: 'time' },
];

const FormNodeConfig: React.FC<FormNodeConfigProps> = ({ title, description, value, onChange, onMetaChange }) => {
  const rows: FormFieldRow[] = useMemo(
    () => (value && value.length ? value : [{ label: '', type: 'text', placeholder: '', required: false }]),
    [value]
  );

  const setRows = (next: FormFieldRow[]) => {
    onChange(next);
  };

  const addRow = () => {
    setRows([
      ...rows,
      { label: '', type: 'text', placeholder: '', required: false },
    ]);
  };

  const removeRow = (i: number) => {
    if (rows.length === 1) return; // keep at least one field
    setRows(rows.filter((_, idx) => idx !== i));
  };

  const updateRow = (i: number, patch: Partial<FormFieldRow>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch } as FormFieldRow;
    // If type changed away from dropdown, clear options
    if (patch.type && patch.type !== 'dropdown') {
      delete (next[i] as any).options;
    }
    setRows(next);
  };

  return (
    <>
      {/* Form meta */}
      <div className="config-section">
        <label className="config-label">Form Title</label>
        <TextBoxComponent
          value={title}
          placeholder="Enter form title"
          change={(e: any) => onMetaChange({ formTitle: e.value })}
          cssClass="config-input"
        />
      </div>

      <div className="config-section">
        <label className="config-label">Form Description</label>
        <TextBoxComponent
          value={description}
          placeholder="Describe the purpose of this form"
          change={(e: any) => onMetaChange({ formDescription: e.value })}
          cssClass="config-textarea"
          multiline
        />
      </div>

      <div className="config-section">
        <label className="config-label">Form Fields</label>
        {rows.map((row, i) => {
          const isDropdown = row.type === 'dropdown';
          return (
            <React.Fragment key={i}>
              <div style={{ background: 'var(--border-color)', padding: '.6rem .6rem', borderRadius: '12px', display: 'grid', gridTemplateColumns: '44px 1fr', columnGap: 12, rowGap: 10 }}>
                {/* Left gutter with delete button */}
                <div>
                  <ButtonComponent
                    cssClass="flat-btn e-flat"
                    iconCss="e-icons e-trash"
                    onClick={() => removeRow(i)}
                    title="Remove field"
                    disabled={rows.length === 1}
                  />
                </div>
                {/* Field Name (right column) */}
                <div>
                  <label className="config-label" style={{ marginBottom: 4, display: 'block', fontWeight: 400 }}>Field Name</label>
                  <TextBoxComponent
                    value={row.label}
                    placeholder="Name"
                    change={(e: any) => updateRow(i, { label: e.value })}
                    cssClass="config-input"
                  />
                </div>

                {/* Keep left gutter empty for following rows */}
                <div />
                <div>
                  <div className="config-row" style={{ alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label className="config-label" style={{ marginBottom: 4, display: 'block', fontWeight: 400 }}>Element Type</label>
                      <DropDownListComponent
                        value={row.type}
                        dataSource={FIELD_TYPE_OPTIONS as unknown as { [key: string]: object }[]}
                        fields={{ text: 'text', value: 'value' }}
                        allowFiltering={false}
                        placeholder="Text"
                        popupHeight="280px"
                        zIndex={1000000}
                        change={(e: any) => updateRow(i, { type: e.value as FormFieldType })}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', paddingTop: 24 }}>
                      <CheckBoxComponent
                        label="Required"
                        checked={!!row.required}
                        change={(e: any) => updateRow(i, { required: e.checked })}
                      />
                    </div>
                  </div>
                </div>

                {/* Placeholder (not for dropdown/date/time) */}
                {!isDropdown && row.type !== 'date' && row.type !== 'time' && (
                  <>
                    <div />
                    <div>
                      <label className="config-label" style={{ marginBottom: 4, display: 'block', fontWeight: 400 }}>Placeholder</label>
                      <TextBoxComponent
                        value={row.placeholder ?? ''}
                        placeholder="Enter placeholder"
                        change={(e: any) => updateRow(i, { placeholder: e.value })}
                        cssClass="config-input"
                      />
                    </div>
                  </>
                )}

                {/* Dropdown Options when type is dropdown */}
                {isDropdown && (
                  <>
                    <div />
                    <div>
                      <label className="config-label" style={{ marginBottom: 4, display: 'block', fontWeight: 400,}}>Field Options</label>
                      <TextBoxComponent
                        value={(row.options ?? []).join(', ')}
                        placeholder="Option A, Option B, Option C"
                        change={(e: any) => {
                          const raw = (e.value ?? '') as string;
                          const arr = raw
                            .split(',')
                            .map(s => s.trim())
                            .filter(s => s.length > 0);
                          updateRow(i, { options: arr });
                        }}
                        cssClass="config-input"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Spacer between rows */}
              <div style={{ height: 10 }} />
            </React.Fragment>
          );
        })}

        <ButtonComponent className="add-field-btn e-primary" iconCss="e-icons e-plus" onClick={addRow}>
          Add Field
        </ButtonComponent>
      </div>
    </>
  );
};

export default FormNodeConfig;
