import { NodeModel } from "@syncfusion/ej2-react-diagrams";
import { ConnectorType, GridStyle, NodeCategories, NodeStatus, NodeType, PaletteCategoryLabel, PaletteFilterMode, SnappingSettings, ToastType } from "./types";

export interface NodeConfig {
  id: string;
  displayName: string;
  nodeType: NodeType;
  category: NodeCategories;
  icon?: string;
  settings: {
    general: any;
    authentication?: any;
    advanced?: any;
  };
  status?: NodeStatus; // Added for execution tracking
  executionTime?: {
    start?: Date;
    end?: Date;
  };
}

export interface WorkflowData {
  metadata: {
    id: string;
    name: string;
    created: Date;
    modified: Date;
    version: number;
  };
  diagramString: string;
}

export interface TemplateProjectConfig {
  id: string;
  title: string;
  description: string;
  image?: string;
}

export interface ProjectData {
  id: string;
  name: string;
  lastModified: Date;
  thumbnail?: string;
  workflowData: WorkflowData;
  isBookmarked?: boolean;
  diagramSettings?: DiagramSettings;
}

export interface PaletteCategory {
  name: PaletteCategoryLabel;
  nodes: NodeTemplate[];
}

export interface PaletteFilterContext {
  mode: PaletteFilterMode;
}
export interface PaletteNodeItem {
  id: string;
  name: string;
  iconId?: string;
  category: 'trigger' | 'core' | 'flow' | 'tool' | string;
  nodeType: string;
  description: string;
}

export interface NodeTemplate {
  id: string;
  name: string;
  iconId?: string;
  nodeType: NodeType;
  category: NodeCategories;
  description: string;
}

export interface ThemeContext {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export interface AppState {
  currentView: 'home' | 'editor';
  currentProject: ProjectData | null;
  projects: ProjectData[];
  selectedNode: string | null;
  sidebarOpen: boolean;
  configPanelOpen: boolean;
}

export interface DiagramSettings {
  gridStyle: GridStyle;
  snapping: SnappingSettings;
  connectorType: ConnectorType;
  connectorCornerRadius: number;
  showOverview: boolean;
  showOverviewAlways: boolean; 
}

export interface StickyNotePosition {
  x: number;
  y: number;
  fromMouse?: boolean; 
}

export interface PortConfiguration {
  topPort?: boolean;
  leftPort?: boolean;
  rightPort?: boolean;
  rightTopPort?: boolean;
  rightBottomPort?: boolean;
  bottomLeftPort?: boolean;
  bottomRightPort?: boolean;
}

export interface ToastMessage {
  id: string;
  title: string;
  content: string;
  type: ToastType;
  duration?: number;
  variant?: 'default' | 'notification';
}

// Workflow Execution Context
export interface ExecutionContext {
  variables: Record<string, any>;
  results: Record<string, any>;
  lastError?: string;
}

// Node Execution Result
export interface NodeExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Workflow Execution Status
export interface WorkflowExecutionStatus {
  isExecuting: boolean;
  currentNodeId?: string;
  error?: string;
  executionPath: string[];
}

// Workflow Execution Options
export interface WorkflowExecutionOptions {
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  enableDebug?: boolean;
}

export interface NodeExecutor {
  executeNode(node: NodeModel, context: ExecutionContext): Promise<NodeExecutionResult>;
  canExecute(node: NodeModel): boolean;
}

export interface NodeExecutorRegistry {
  registerExecutor(nodeType: string, executor: NodeExecutor): void;
  getExecutor(nodeType: string): NodeExecutor | undefined;
}

export interface NodeExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ServerNodeConfig {
  nodeType: string;
  category: string;
  endpoint: string;
}
