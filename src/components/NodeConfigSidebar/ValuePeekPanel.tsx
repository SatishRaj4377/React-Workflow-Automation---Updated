import React from 'react';

export type PeekInfo = { path: string; value: any } | null;

export interface ValuePeekPanelProps {
  peek: PeekInfo;
  onClose: () => void;
  className?: string;
  style?: React.CSSProperties;
}

function formatForDisplay(v: any): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* noop */ }
    document.body.removeChild(ta);
  }
}

const ValuePeekPanel: React.FC<ValuePeekPanelProps> = ({ peek, onClose, className, style }) => {
  if (!peek) return null;

  return (
    <div
      className={["vp-footer", className].filter(Boolean).join(' ')}
      style={{
        borderTop: '1px solid var(--border-color)',
        padding: '.5rem',
        background: 'var(--background-color)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div
          style={{
            fontSize: '.75rem',
            color: 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: '1 1 auto',
          }}
          title={peek.path}
        >
          {peek.path}
        </div>
        <div style={{ display: 'flex', gap: 6, flex: '0 0 auto', alignItems: 'center' }}>
          <button className="e-btn e-flat e-small" onClick={() => copyText(peek.path)} title="Copy path">Copy path</button>
          <button
            className="e-btn e-flat e-small"
            onClick={() => {
              if (typeof peek.value === 'string') return copyText(peek.value);
              if (typeof peek.value === 'number' || typeof peek.value === 'boolean' || peek.value === null) return copyText(String(peek.value));
              try { return copyText(JSON.stringify(peek.value, null, 2)); } catch { return copyText(String(peek.value)); }
            }}
            title="Copy value"
          >
            Copy value
          </button>
          <button className="e-btn e-flat e-small e-icons e-close custom-font-size " onClick={onClose} title="Close" aria-label="Close" />
        </div>
      </div>
      <div
        style={{
          marginTop: 6,
          maxHeight: 160,
          overflow: 'auto',
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          background: 'var(--surface-color)',
        }}
      >
        <pre
          style={{
            margin: 0,
            padding: '.5rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '.8rem',
            userSelect: 'text',
          }}
        >
          {formatForDisplay(peek.value)}
        </pre>
      </div>
    </div>
  );
};

export default ValuePeekPanel;
