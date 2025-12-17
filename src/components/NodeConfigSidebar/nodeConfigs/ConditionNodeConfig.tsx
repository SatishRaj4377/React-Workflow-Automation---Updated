import React, { useMemo } from 'react';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { TextBoxComponent } from '@syncfusion/ej2-react-inputs';
import { VariablePickerTextBox } from '../components/VariablePickerTextBox';
import { ConditionComparator, ConditionJoiner, ConditionRow } from '../../../types';
import { OP_OPTIONS, orderByPreferredGroup, usesRightOperand } from '../../../constants';
import { inferKindFromText, getPreferredOperatorGroup } from '../../../utilities/conditionUtils';

export interface ConditionNodeConfigProps {
  value?: ConditionRow[];
  onChange: (rows: ConditionRow[]) => void;
  variableGroups: any[];
  label?: string;
  showJoiners?: boolean;
  // When provided, the left textbox will insert item-relative paths (e.g., $.item.name)
  leftMode?: 'value' | 'itemField';
  // Base list expression (e.g., $.Employees#node123.rows) used to map picked keys to $.item.*
  leftBaseListExpr?: string;
}

const ConditionNodeConfig: React.FC<ConditionNodeConfigProps> = ({
  value,
  onChange,
  variableGroups,
  label = 'Conditions',
  showJoiners = true,
  leftMode = 'value',
  leftBaseListExpr,
}) => {
  const rows: ConditionRow[] = useMemo(
    () => (value && value.length ? value : [{ left: '', comparator: 'is equal to', right: '' }]),
    [value]
  );

  const setRows = (next: ConditionRow[]) => {
    if (next.length > 0 && next[0].joiner) {
      next = [{ ...next[0], joiner: undefined }, ...next.slice(1)];       // first row never has joiner
    }
    onChange(next);
  };

  const addRow = () => {
    setRows([
      ...rows,
      { joiner: 'AND', left: '', comparator: 'is equal to', right: '' },  // new row joins by AND by default
    ]);
  };

  const removeRow = (i: number) => {
    if (rows.length === 1) return; // at least one row
    setRows(rows.filter((_, idx) => idx !== i));
  };

  const updateRow = (i: number, patch: Partial<ConditionRow>) => {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch } as ConditionRow;
    setRows(next);
  };

  // Get operator options sorted by preferred group based on left value type
  const getOperatorOptionsForRow = (rowIndex: number) => {
    const kind = inferKindFromText(rows[rowIndex].left ?? '');
    const preferredGroup = getPreferredOperatorGroup(kind) as any;
    return orderByPreferredGroup(OP_OPTIONS, preferredGroup);
  };

  return (
    <>
      <div className="config-section">
        <label className="config-label">{label}</label>

        {rows.map((row, i) => {
          const kind = inferKindFromText(row.left ?? '');
          const operatorOptions = getOperatorOptionsForRow(i);
          const showJoinerBelow = i < rows.length - 1;
          const requiresRightOperand = usesRightOperand(row.comparator);

          return (
            <React.Fragment key={i}>
              <div style={{ background: 'var(--condition-field-bg)', padding: '.5rem', borderRadius: '6px' }}>
                {/* Row Header: Delete button + Left value input + Operator dropdown */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                  <ButtonComponent
                    style={{ width: 45 }}
                    cssClass="flat-btn e-flat"
                    iconCss="e-icons e-trash"
                    onClick={() => removeRow(i)}
                    title="Remove condition"
                    disabled={rows.length === 1}
                  />
                  <div style={{ width: '60%' }}>
                    <VariablePickerTextBox
                      value={row.left ?? ''}
                      placeholder="value 1"
                      onChange={(val) => updateRow(i, { left: val })}
                      cssClass="config-input"
                      variableGroups={variableGroups}
                      mode={leftMode}
                      baseListExpr={leftBaseListExpr}
                    />
                  </div>
                  <div style={{ width: '40%' }}>
                    <DropDownListComponent
                      value={row.comparator}
                      dataSource={operatorOptions as unknown as { [key: string]: object }[]}
                      fields={{ text: 'text', value: 'value', groupBy: 'group' }}
                      allowFiltering={true}
                      filterBarPlaceholder="Search operations…"
                      placeholder="Choose operation"
                      popupHeight="300px"
                      zIndex={1000000}
                      change={(e: any) => updateRow(i, { comparator: e.value as ConditionComparator })}
                    />
                  </div>
                </div>

                {/* Line 2: Value 2 - only for binary ops */}
                {requiresRightOperand && (
                  <div style={{ marginTop: 8, width: '85%', marginLeft: 'auto' }}>
                    <VariablePickerTextBox
                      value={row.right ?? ''}
                      placeholder={getPlaceholderForRightOperand(row.comparator, kind)}
                      onChange={(val) => updateRow(i, { right: val })}
                      cssClass="config-input"
                      variableGroups={variableGroups}
                    />
                  </div>
                )}

                {/* Line 3: Optional Case Name (only in Switch Case, where joiners are hidden) */}
                {!showJoiners && (
                  <div style={{ marginTop: 14, width: '85%', marginLeft: 'auto' }}>
                    <TextBoxComponent
                      value={row.name ?? ''}
                      placeholder="Case name (optional)"
                      change={(e: any) => updateRow(i, { name: e.value })}
                      cssClass="config-input"
                    />
                  </div>
                )}
              </div>
              {/* Line 4: AND/OR between rows, only if a next row exists */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', margin: '12px 0 6px'}}>
                {showJoiners && showJoinerBelow && (
                  <>
                    <div style={{ flex: 1, height: 1, background: 'var(--scrollbar-thumb)', opacity: 0.6 }} />
                      <DropDownListComponent
                        value={(rows[i + 1]?.joiner ?? 'AND') as ConditionJoiner}
                        dataSource={['AND', 'OR']}
                        popupHeight="200px"
                        zIndex={1000000}
                        width={'110px'}
                        change={(e: any) => updateRow(i + 1, { joiner: e.value as ConditionJoiner })}
                      />
                    <div style={{ flex: 1, height: 1, background: 'var(--scrollbar-thumb)', opacity: 0.6 }} />
                  </>
                  )}
              </div>

            </React.Fragment>
          );
        })}

        <ButtonComponent className="add-field-btn e-secondary" iconCss="e-icons e-plus" onClick={addRow}>
          Add {!showJoiners ? 'Case' : 'Condition'}
        </ButtonComponent>
      </div>
    </>
  );
};

/**
 * Get placeholder text for right operand based on operator and inferred value kind
 */
function getPlaceholderForRightOperand(comparator: ConditionComparator, kind: any): string {
  if (comparator === 'is between') {
    if (kind === 'number') return 'min,max  (e.g., 10,20) or {{ [10,20] }}';
    if (kind === 'date') return 'start,end  (e.g., 2024-01-01,2024-12-31) or {{ [$.start, $.end] }}';
    if (kind === 'time') return "start,end  (e.g., 09:00,17:00) or {{ ['09:00', '17:00'] }}";
    return 'min,max (comma-separated)';
  }
  if (comparator === 'has key' || comparator === 'has property') return 'key/property name';
  return 'value 2';
}

export default ConditionNodeConfig;