import React, { useCallback, useMemo, useState } from 'react';
import { IconRegistry } from '../../../assets/icons';

export interface JsonVisualizerProps {
  data: any;                          // JSON object or array
  onKeyClick?: (path: string) => void; // Called when a key is clicked
  onValuePeek?: (info: { path: string; value: any }) => void; // Called when a value preview is requested
  basePath?: string;                  // Used for recursive rendering
  collapsed?: boolean;                // Whether to start collapsed
  className?: string;                 // Optional wrapper class
}

/** Helpers */
const INDENT = 18;
const EXPAND_LIMIT = 2;
const isArray = (v: any) => Array.isArray(v);
const isObject = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPrimitive = (v: any) => v === null || (typeof v !== 'object' && typeof v !== 'function');
// Reserve the same space at the start of every row
const CARET_SLOT_STYLE: React.CSSProperties = {
  width: 16,
  height: 16,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 16px',
};

// Format short value previews
function formatPreview(value: any): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;

  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  try {
    const json = JSON.stringify(value);
    return json.length > 60 ? `${json.slice(0, 60)}…` : json;
  } catch {
    return String(value);
  }
}

// JSONPath builder: $.a.b[0].c
function joinPath(base: string, segment: string | number): string {
  if (typeof segment === 'number') return `${base}[${segment}]`;
  return base === '$' ? `$.${segment}` : `${base}.${segment}`;
}

/** Toggler glyph */
const Caret: React.FC<{ open: boolean; onToggle: () => void; title?: string }> = ({
  open,
  onToggle,
  title,
}) => {
  const ChevronDown = IconRegistry['ChevronDown'];
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={open ? 'Collapse' : 'Expand'}
      title={title}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        cursor: 'pointer',
        userSelect: 'none',
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', // rotate when closed
        transition: 'transform .12s ease',
      }}
    >
      <ChevronDown className="svg-icon"/>
    </span>
  );
};

/** Key button (uses your .vp-key styling) */
const KeyButton: React.FC<{ label: string; onClick?: () => void; title?: string }> = ({
  label,
  onClick,
  title,
}) => (
  <button
    type="button"
    className="vp-key"
    title={title}
    onClick={onClick}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
  >
    <span className="vp-key-em">{label}</span>
  </button>
);

/** Type badge (uses your .vp-type styling) */
const TypeBadge: React.FC<{ text: string }> = ({ text }) => (
  <span className="vp-type" style={{ marginLeft: 8 }}>
    {text}
  </span>
);

const Row: React.FC<{ depth: number; children: React.ReactNode }> = ({ depth, children }) => (
  <div
    className="vp-item"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      width: '100%',
      boxSizing: 'border-box',
      // Base padding + depth-based indent. Do NOT include caret width here.
      padding: '.32rem .5rem',
      paddingInlineStart: `${depth * INDENT + 8}px`,
      borderRadius: 8,
      margin: '1px 0',
    }}
  >
    {children}
  </div>
);

const ChildrenBlock: React.FC<{ depth: number; children: React.ReactNode }> = ({
  children,
}) => <div>{children}</div>;


/** Single tree node */
const TreeNode: React.FC<{
  name?: string | number;
  value: any;
  path: string;
  depth: number;
  onKeyClick?: (path: string) => void;
  onValuePeek?: (info: { path: string; value: any }) => void;
  initialCollapsed: boolean;
}> = ({ name, value, path, depth, onKeyClick, onValuePeek, initialCollapsed }) => {
  const container = isObject(value) || isArray(value);
  const count = isArray(value)
    ? value.length
    : isObject(value)
    ? Object.keys(value).length
    : 0;

  const [open, setOpen] = useState<boolean>(!initialCollapsed || depth === 0);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  const keyLabel = useMemo(() => {
    if (typeof name === 'number') return `[${name}]`;
    if (typeof name === 'string') return name;
    return '$'; // root
  }, [name]);

  const preview = useMemo(() => {
    if (!container) return formatPreview(value);
    return isArray(value) ? `Array(${count})` : `Object(${count})`;
  }, [container, value, count]);

  const typeText = useMemo(() => {
    if (isArray(value)) return 'array';
    if (isObject(value)) return 'object';
    if (value === null) return 'null';
    return typeof value;
  }, [value]);

  const clickKey = useCallback(() => {
    if (!onKeyClick) return; // view-only if not provided
    onKeyClick(path);
  }, [onKeyClick, path]);

  // Primitives
  if (!container) {
    return (
      <Row depth={depth}>
        {/* empty slot to align with caret-equipped rows */}
        <span style={CARET_SLOT_STYLE} />
        <KeyButton
          label={String(keyLabel)}
          onClick={clickKey}
          title={`${path} • Click to insert`}
        />
        <span
          className="vp-preview"
          title={isPrimitive(value) ? 'Click to preview and copy' : undefined}
          onClick={() => onValuePeek?.({ path, value })}
          style={{
            marginLeft: 6,
            flex: '1 1 auto',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--text-secondary)',
            fontSize: '.8rem',
            cursor: onValuePeek ? 'pointer' : 'default',
          }}
        >
          {preview}
        </span>
        <TypeBadge text={typeText} />
      </Row>
    );
  }

  // Objects / Arrays
  return (
    <>
    <Row depth={depth}>
      {/* caret inside fixed-width slot */}
      <span style={CARET_SLOT_STYLE}>
        <Caret open={open} onToggle={toggle} title={open ? 'Collapse' : 'Expand'} />
      </span>

      <KeyButton
        label={String(keyLabel)}
        onClick={clickKey}
        title={`${path} • Click to insert`}
      />
      <span
        className="vp-preview"
        style={{
          marginLeft: 6,
          flex: '1 1 auto',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--text-secondary)',
          fontSize: '.8rem',
        }}
      >
        {preview}
      </span>
      <TypeBadge text={typeText} />
    </Row>

      {open && (
        <ChildrenBlock depth={depth}>
          {isArray(value)
            ? (value as any[]).map((v, idx) => (
                <TreeNode
                  key={idx}
                  name={idx}
                  value={v}
                  path={joinPath(path, idx)}
                  depth={depth + 1}
                  onKeyClick={onKeyClick}
                  onValuePeek={onValuePeek}
                  initialCollapsed={initialCollapsed || idx >= EXPAND_LIMIT}
                />
              ))
            : Object.keys(value as Record<string, any>).map((k, idx) => (
                <TreeNode
                  key={k}
                  name={k}
                  value={(value as any)[k]}
                  path={joinPath(path, k)}
                  depth={depth + 1}
                  onKeyClick={onKeyClick}
                  onValuePeek={onValuePeek}
                  initialCollapsed={initialCollapsed || idx >= EXPAND_LIMIT}
                />
              ))}
        </ChildrenBlock>
      )}
    </>
  );
};

/** Main component */
const JsonVisualizer: React.FC<JsonVisualizerProps> = ({
  data,
  onKeyClick,
  onValuePeek,
  basePath = '$',
  collapsed = false,
  className,
}) => {
  return (
    <div
      className={['jsonv', className].filter(Boolean).join(' ')}
      style={{
        overflowX: 'auto',
        overflowY: 'hidden'
      }}
      aria-label="JSON visualizer"
    >
      <TreeNode
        name={undefined}
        value={data}
        path={basePath}
        depth={0}
        onKeyClick={onKeyClick}
        onValuePeek={onValuePeek}
        initialCollapsed={collapsed}
      />
    </div>
  );
};

export default JsonVisualizer;