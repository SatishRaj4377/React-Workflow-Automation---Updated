import { NodeConfig } from "./interfaces";

export type ToolbarAction = 'addNode' | 'execute' | 'cancel' | 'fitToPage' | 'zoomIn' | 'zoomOut' | 'resetZoom' | 'addSticky' | 'togglePan' | 'autoAlign';

export type NodeToolbarAction = 'edit' | 'delete' | 'execute-step';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export type SnappingSettings = { isEnabled: boolean, enableSnapToObjects: boolean, enableSnapToGrid: boolean }

export type NodePortDirection =
  | 'right'
  | 'right-top'
  | 'right-bottom'
  | 'bottom-middle'
  | 'bottom-left'
  | 'bottom-right';

export type NodeDimensions = {
  WIDTH: number;
  HEIGHT: number;
  MIN_WIDTH?: number;
  MIN_HEIGHT?: number;
};

export type PortSide = 'Right' | 'Bottom';

export type NodeCategories = 'trigger' | 'action' | 'sticky' | 'condition' | 'ai-agent' | 'tool';

export type PaletteCategoryLabel = 'Triggers' | 'Core' | 'Flow' | 'Tools';

export type PaletteFilterMode =
  | 'default'                 // show all sections
  | 'initial-add'             // show trigger section only
  | 'port-core-flow'          // opened from a node port (generic) → only Core & Flow
  | 'port-agent-bottom'       // opened from AI Agent bottom port → show only Tools
  | 'connector-insert';       // opened from connector insert handle → show only Core & Flow

export type GridStyle = 'lines' | 'dotted' | 'none';

export type ConnectorType = 'Bezier' | 'Orthogonal' | 'Straight';

export type NodeType = 
  | 'Form'
  | 'Webhook'
  | 'Schedule'
  | 'Manual Click'
  | 'Chat'
  | 'AI Agent'
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
  | 'Azure Chat Model Tool'
  | 'EmailJS Tool'
  | 'Gmail Tool'
  | 'Google Sheets Tool'
  | 'Google Calendar Tool'
  | 'Google Docs Tool'
  | 'HTTP Request Tool'
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

export type VariablesProvider = (context?: {
  activeNodeId?: string | null;
}) => Promise<VariableGroup[]>;

// Node Status for workflow execution
export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export type EmailJSVariableType = Array<{ key: string; value: string }>;

export type DeleteDimParams = {
  spreadsheetId: string;
  sheetTitle: string;
  type: 'Row' | 'Column';
  startIndex: number;     // 1-based from UI
  count: number;          // >= 1
  columnLetter?: string;  // when type === 'Column', preferred input from UI
  accessToken: string;
};

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

export interface ConditionRow {
  left: string;                 // Variable or literal; supports {{ }} and bare "$." expressions
  comparator: ConditionComparator;     // Operator picked from grouped list
  right: string;                // Variable/literal; may be unused for unary ops
  name?: string;                // For Switch Case: optional case name to show near the port
  joiner?: ConditionJoiner;            // AND/OR from the second row onward (combines with previous)
}

export interface ConditionNodeOutput {
  conditionResult: boolean;     // final boolean outcome
  rowResults: boolean[];        // per-row outcomes (useful for debug/UX)
}


export type AzureChatConfig = {
  endpoint: string;           // https://<resource>.openai.azure.com
  key: string;                // Azure OpenAI API key
  deploymentName: string;     // Model deployment name
  temperature?: number;
};

/** Function tool definition for Chat Completions. */
export type AzureTool = {
  type: 'function';
  function: {
    name: string;
    description: string;              // <= 1024 chars
    parameters: Record<string, any>;  // JSON Schema
  };
};

/** Messages allowed by Chat Completions with tool calling. */
export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | {
    role: 'assistant';
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  }
  | { role: 'tool'; tool_call_id: string; content: string };

export type AgentTurnOptions = {
  system?: string;
  temperature?: number;
  tools?: AzureTool[];
  toolChoice?: 'auto' | { type: 'function'; function: { name: string } };
  responseFormatJsonSchema?: { name: string; schema: any; strict?: boolean };
  apiVersionOverride?: string;
};

export type AgentTurnResult = {
  message: {
    role: 'assistant';
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
  raw: any;
};


/** What the agent returns so the runtime & UI can reason deterministically. */
export type AgentExecutionPlan = {
  intent: 'answer' | 'use_tools' | 'use_tools_and_answer' | 'clarify';
  rationale?: string;
  actions: Array<{
    toolNodeId: string;
    toolName: string;
    reason?: string;
    args?: Record<string, any>;
    execute: boolean;
  }>;
  missingInfo: Array<{ toolNodeId: string; field: string; ask: string }>;
  finalResponse?: string;
  meta?: { iterations?: number; hasIntermediate?: boolean };
};

export type ToolDescriptor = {
  toolNodeId: string;
  toolName: string;                 // e.g., "google_sheets.read_range"
  title: string;
  description: string;              // keep concise (Azure limit)
  parameters: Record<string, any>;  // JSON Schema
  toAzureTool: () => AzureTool;
  applyArgsToNodeConfig: (nodeConfig: NodeConfig, args: Record<string, any>) => NodeConfig;
};

