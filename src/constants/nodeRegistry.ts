import { NodeType, NodeCategories, PaletteCategoryLabel, PortConfiguration } from '../types';

export interface NodeRegistryEntry {
  type: NodeType;
  category: NodeCategories;
  paletteCategory: PaletteCategoryLabel;
  label: string;
  description: string;
  iconId?: string;
  portConfig?: PortConfiguration;
}

export const NODE_REGISTRY: Partial<Record<NodeType, NodeRegistryEntry>> = {
  'Manual Trigger': {
    type: 'Manual Trigger',
    category: 'trigger',
    paletteCategory: 'Triggers',
    label: 'Manual Trigger',
    description: 'Trigger workflow manually',
    iconId: 'ManualClickIcon',
    portConfig: { rightPort: true },
  },
  'Form': {
    type: 'Form',
    category: 'trigger',
    paletteCategory: 'Triggers',
    label: 'Form',
    description: 'Trigger workflow on form submission.',
    iconId: 'FormIcon',
    portConfig: { rightPort: true },
  },
  'Chat': {
    type: 'Chat',
    category: 'trigger',
    paletteCategory: 'Triggers',
    label: 'Chat Trigger',
    description: 'Trigger workflow from chat',
    iconId: 'ChatIcon',
    portConfig: { rightPort: true },
  },
  'HTTP Request': {
    type: 'HTTP Request',
    category: 'action',
    paletteCategory: 'Core',
    label: 'HTTP Request',
    description: 'Make HTTP request',
    iconId: 'HttpRequestIcon',
  },
  'Word': {
    type: 'Word',
    category: 'action',
    paletteCategory: 'Core',
    label: 'Word',
    description: 'Word document integration',
    iconId: 'WordIcon',
  },
  'Excel': {
    type: 'Excel',
    category: 'action',
    paletteCategory: 'Core',
    label: 'Excel',
    description: 'Excel document integration',
    iconId: 'ExcelIcon',
  },
  'If Condition': {
    type: 'If Condition',
    category: 'condition',
    paletteCategory: 'Flow',
    label: 'If Condition',
    description: 'Branch based on condition',
    iconId: 'IfConditionIcon',
    portConfig: { leftPort: true, rightTopPort: true, rightBottomPort: true },
  },
  'Switch Case': {
    type: 'Switch Case',
    category: 'condition',
    paletteCategory: 'Flow',
    label: 'Switch Case',
    description: 'Multiple path branching',
    iconId: 'SwitchConditionIcon',
    // Single right port initially; dynamic ports can be added later
    portConfig: { leftPort: true, rightPort: true },
  },
  'Filter': {
    type: 'Filter',
    category: 'condition',
    paletteCategory: 'Flow',
    label: 'Filter',
    description: 'Filter array items',
    iconId: 'FilterIcon',
    portConfig: { leftPort: true, rightPort: true },
  },
  'Loop': {
    type: 'Loop',
    category: 'condition',
    paletteCategory: 'Flow',
    label: 'Loop',
    description: 'Loop over array items',
    iconId: 'LoopIcon',
    portConfig: { leftPort: true, rightTopPort: true, rightBottomPort: true },
  },
  'Stop': {
    type: 'Stop',
    category: 'condition',
    paletteCategory: 'Flow',
    label: 'Do Nothing',
    description: 'No operation, ends the workflow.',
    iconId: 'StopIcon',
    portConfig: { leftPort: true },
  },
  'Notify': {
    type: 'Notify',
    category: 'action',
    paletteCategory: 'Core',
    label: 'Notify',
    description: 'Show a toast notification',
    iconId: 'BellIcon',
    portConfig: { leftPort: true, rightPort: true },
  },
};

// Helper functions to get node lists by different criteria
export const getNodesByPaletteCategory = (paletteCategory: PaletteCategoryLabel): NodeRegistryEntry[] => 
  Object.values(NODE_REGISTRY).filter(node => node.paletteCategory === paletteCategory);

export const getClientExecutedNodes = (): NodeType[] =>
  Object.values(NODE_REGISTRY)
    .map(node => node.type);