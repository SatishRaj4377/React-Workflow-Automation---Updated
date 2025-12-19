export type ToolbarAction = 'addNode' | 'execute' | 'cancel' | 'fitToPage' | 'zoomIn' | 'zoomOut' | 'resetZoom' | 'addSticky' | 'togglePan' | 'autoAlign';

export type NodeToolbarAction = 'edit' | 'delete' | 'execute-step';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type SnappingSettings = { isEnabled: boolean, enableSnapToObjects: boolean, enableSnapToGrid: boolean }

export type NodePortDirection =
  | 'right'
  | 'right-top'
  | 'right-bottom';

export type NodeDimensions = {
  WIDTH: number;
  HEIGHT: number;
  MIN_WIDTH?: number;
  MIN_HEIGHT?: number;
};

export type PortSide = 'Right' | 'Bottom';

export type NodeCategories = 'trigger' | 'action' | 'sticky' | 'condition';

export type PaletteCategoryLabel = 'Triggers' | 'Core' | 'Flow';

export type PaletteFilterMode =
  | 'default'                 // show all sections
  | 'initial-add'             // show trigger section only
  | 'port-core-flow'          // opened from a node port (generic) → only Core & Flow
  | 'connector-insert';       // opened from connector insert handle → show only Core & Flow

export type GridStyle = 'lines' | 'dotted' | 'none';

export type ConnectorType = 'Bezier' | 'Orthogonal' | 'Straight';

export type NodeType = 
  | 'Form'
  | 'Webhook'
  | 'Schedule'
  | 'Manual Trigger'
  | 'Chat'
  | 'HTTP Request'
  | 'EmailJS'
  | 'Notify'
  | 'Gmail'
  | 'Google Sheets'
  | 'Word'
  | 'Excel'
  | 'Telegram'
  | 'Google Calendar'
  | 'Google Docs'
  | 'Twilio'
  | 'If Condition'
  | 'Switch Case'
  | 'Filter'
  | 'Loop'
  | 'Stop'
;

export type Variable = {
  key: string; /** short key displayed prominently e.g., "subject" */
  path: string; /** fully qualified path to insert, e.g., "gmail_1.subject" */
  preview?: string; /** quick preview of the value from last execution */
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date' | 'any'; /** primitive or structured type hint */
};

export type VariableGroup = {
  nodeId: string;
  nodeName: string;       // "Gmail 1" or "Webhook"
  nodeType: string;       // "Gmail" | "Google Sheets" | "Webhook" ...
  variables: Variable[];
  raw?: any;              // full raw output for accurate preview/copy
};

// Node Status for workflow execution
export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export type ConditionJoiner = 'AND' | 'OR';

export type ConditionComparator =
  // generic equality / string
  | 'is equal to' | 'is not equal to'
  | 'contains' | 'does not contain' | 'starts with' | 'ends with' | 'matches regex'
  // number
  | 'greater than' | 'greater than or equal to' | 'less than' | 'less than or equal to'
  | 'is between' | 'is not between'
  // boolean
  | 'is true' | 'is false'
  // date
  | 'before' | 'after' | 'on or before' | 'on or after'
  // existence / emptiness (cross-kind)
  | 'exists' | 'does not exist' | 'is empty' | 'is not empty'
  // array/object
  | 'contains value' | 'length greater than' | 'length less than'
  | 'has key' | 'has property';

export type ConditionValueKind = 'string' | 'number' | 'boolean' | 'date' | 'time' | 'array' | 'object';

// Condition operator dropdown typing
export type OpKind = 'String' | 'Number' | 'Boolean' | 'Date' | 'Time' | 'Array' | 'Object';
