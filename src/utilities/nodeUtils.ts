import { NodeModel } from "@syncfusion/ej2-react-diagrams";
import { NodeConfig, NodeDimensions, NodeTemplate } from "../types";
import { getPortsForNode } from "./portUtils";
import { NODE_DIMENSIONS } from "../constants";
import { SelectorConstraints } from "@syncfusion/ej2-react-diagrams";
import { buildNodeHtml, attachNodeTemplateEvents } from "../utilities/nodeTemplateUtils";
import { initializeStickyNote } from "./stickyNoteUtils";

// Creates a new node model from a node template
export const createNodeFromTemplate = (
  nodeTemplate: NodeTemplate,
  position?: { x: number; y: number }
): NodeModel => {
  const nodeId = `${nodeTemplate.id}-${Date.now()}`;
  const nodeConfig: NodeConfig = {
    id: nodeId,
    nodeType: nodeTemplate.nodeType,
    category: nodeTemplate.category,
    displayName: nodeTemplate.name,
    icon: nodeTemplate.iconId,
    settings: { general: {}, authentication: {}, advanced: {} },
  };

  const node: NodeModel = {
    id: nodeId,
    offsetX: position?.x,
    offsetY: position?.y,
    addInfo: { nodeConfig },
    ports: getPortsForNode(nodeConfig)
  };

  initializeNodeDimensions(node);
  return node;
};

// Calculates the optimal position for a new node based on the source node and port.
export const calculateNewNodePosition = (sourceNode: NodeModel, portId: string): { offsetX: number, offsetY: number } => {
  const {
    offsetX: baseX = 80,
    offsetY: baseY = 80,
    width: nodeWidth = 150,
    height: nodeHeight = 100
  } = sourceNode;

  const horizontalSpacing = nodeWidth * 2;
  const verticalSpacing = nodeHeight * 2;
  const padding = 50;

  // Start with a sensible default position (to the right of the source node)
  let offsetX = baseX + horizontalSpacing;
  let offsetY = baseY;

  // Handle specific port IDs for fine-tuned positioning
  switch (portId) {
    // --- IF Condition Ports ---
    case 'right-top-port':
      offsetX = baseX + horizontalSpacing;
      offsetY = baseY - (nodeHeight / 2 + padding); // To the right and above
      break;
    case 'right-bottom-port':
      offsetX = baseX + horizontalSpacing;
      offsetY = baseY + (nodeHeight / 2 + padding); // To the right and below
      break;

    // --- Dynamic Switch Case Ports (right-case-1, 2, ...) ---
    default:
      if (portId.startsWith('right-case-')) {
        const idx = parseInt(portId.replace('right-case-', ''), 10) || 1;
        offsetX = baseX + horizontalSpacing;
        // spread vertically around the source
        const spread = nodeHeight + padding;
        const normalized = (idx - 1); // 0-based
        offsetY = baseY - spread / 2 + normalized * (padding * 2);
      }
      break;
  }

  return { offsetX, offsetY };
};

// Safely retrieves NodeConfig from a node's addInfo
export const getNodeConfig = (node: NodeModel | null | undefined): NodeConfig | undefined => {
  if (!node?.addInfo) return undefined;
  return (node.addInfo as any)?.nodeConfig;
};

// Get node display name safely
export const getNodeDisplayName = (node: NodeModel | null | undefined): string => {
  const config = getNodeConfig(node);
  return config?.displayName || 'Unnamed Node';
};

// Returns the node size based on type of ndoe
export const getNodeDimensions = (node: NodeModel): NodeDimensions => {
  const config = getNodeConfig(node);

  if (!config) return NODE_DIMENSIONS.DEFAULT;

  if (isStickyNote(config)) return NODE_DIMENSIONS.STICKY_NOTE;

  return NODE_DIMENSIONS.DEFAULT;
};

// Initialize node dimensions while preserving existing valid dimensions
export const initializeNodeDimensions = (node: NodeModel) => {
  const dimensions = getNodeDimensions(node);
  const nodeConfig = getNodeConfig(node);

  if (!node.width || node.width === 0) node.width = dimensions.WIDTH;
  if (!node.height || node.height === 0) node.height = dimensions.HEIGHT;

  if (nodeConfig && isStickyNote(nodeConfig) && dimensions.MIN_WIDTH && dimensions.MIN_HEIGHT) {
    node.minWidth = dimensions.MIN_WIDTH;
    node.minHeight = dimensions.MIN_HEIGHT;
  }
};

// Validate node position
export const hasValidPosition = (node: NodeModel): boolean => {
  return Boolean(
    node.offsetX &&
    node.offsetX !== 0 &&
    node.offsetY &&
    node.offsetY !== 0
  );
};

// Get the visual center of a node, with wrapper fallback
export const getNodeCenter = (node: NodeModel): { x: number; y: number } => {
  const w = (node as any)?.wrapper;
  const x = typeof node.offsetX === 'number' ? node.offsetX : (w?.offsetX ?? 0);
  const y = typeof node.offsetY === 'number' ? node.offsetY : (w?.offsetY ?? 0);
  return { x, y };
};

// Adjust spacing between two nodes by pushing them apart to meet a minimum distance.
// Uses safe center calculations and avoids unsafe offset property reuse.
export const adjustNodesSpacing = (
  sourceNode: NodeModel,
  targetNode: NodeModel,
  minSpacing: number = 250
): void => {
  const s = getNodeCenter(sourceNode);
  const t = getNodeCenter(targetNode);

  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance >= minSpacing || distance === 0) return;

  const adjustAmount = (minSpacing - distance) / 2;
  const angle = Math.atan2(dy, dx);
  const moveX = Math.cos(angle) * adjustAmount;
  const moveY = Math.sin(angle) * adjustAmount;

  // Safely set new offsets without casting hacks
  const srcX = typeof sourceNode.offsetX === 'number' ? sourceNode.offsetX : s.x;
  const srcY = typeof sourceNode.offsetY === 'number' ? sourceNode.offsetY : s.y;
  const tgtX = typeof targetNode.offsetX === 'number' ? targetNode.offsetX : t.x;
  const tgtY = typeof targetNode.offsetY === 'number' ? targetNode.offsetY : t.y;

  sourceNode.offsetX = srcX - moveX;
  sourceNode.offsetY = srcY - moveY;
  targetNode.offsetX = tgtX + moveX;
  targetNode.offsetY = tgtY + moveY;
};


// Check if a node is valid and has proper configuration
export const isValidNode = (node: NodeModel | null | undefined): boolean => {
  if (!node) return false;
  const config = getNodeConfig(node);
  return Boolean(config && config.id && config.category);
};

// Check if a node is a trigger type
export const isTriggerNode = (nodeConfig: NodeConfig): boolean =>
  nodeConfig?.category === 'trigger';

// Check if a node is an action type
export const isActionNode = (nodeConfig: NodeConfig): boolean =>
  nodeConfig?.category === 'action';

// Check if a node is a condition type
export const isConditionNode = (nodeConfig: NodeConfig): boolean =>
  nodeConfig?.category === 'condition';

// Check if a node is a sticky note
export const isStickyNote = (nodeConfig: NodeConfig): boolean =>
  nodeConfig?.category === 'sticky';

// Check if node is an if/switch condition type
export const isIfConditionNode = (nodeConfig: NodeConfig): boolean =>
   nodeConfig?.category === 'condition' && nodeConfig.nodeType === 'If Condition';

// Check if node is a switch case node
export const isSwitchNode = (nodeConfig: NodeConfig): boolean =>
  nodeConfig?.nodeType === 'Switch Case';

// Check if node is a loop node
export const isLoopNode = (nodeConfig: NodeConfig): boolean =>
  nodeConfig?.nodeType === 'Loop';

// Apply appropriate template based on node type
export const updateNodeTemplates = (node: NodeModel, diagramRef: React.RefObject<any>) => {
  const nodeConfig = (node.addInfo as any)?.nodeConfig as NodeConfig;

  if (nodeConfig && isStickyNote(nodeConfig)) {
    // Sticky note with markdown editor; uses the annotation template
    initializeStickyNote(node, diagramRef);
  } else {
    // Regular node with HTML template
    node.shape = {
      type: 'HTML',
      content: buildNodeHtml(node),
    };

    // Attach node action toolbar event handlers after DOM render
    setTimeout(() => attachNodeTemplateEvents(node), 0);
  }
};

// Update custom node selection styling
export const updateNodeSelection = (nodeIds: string[] | null) => {
  // Remove existing selection styles
  const allNodeTemplates = document.querySelectorAll('.node-template, .sticky-note-container');
  allNodeTemplates.forEach((template) => {
    template.classList.remove('selected');
  });

  // Add selection to specified nodes
  if (nodeIds && nodeIds.length > 0) {
    nodeIds.forEach((nodeId) => {
      const selectedTemplate = document.querySelector(`[data-node-id="${nodeId}"]`);
      if (selectedTemplate) {
        selectedTemplate.classList.add('selected');
      }
    });
  }
};

// Control resize handle visibility based on selection
export const updateResizeHandleVisibility = (nodeIds: string[], diagramRef: React.RefObject<any>) => {
  const diagram = diagramRef?.current;
  if (!diagram) return;

  // Show resize for sticky notes only
  if (nodeIds.length === 1 && nodeIds[0].startsWith('sticky-')) {
    diagram.selectedItems.constraints = SelectorConstraints.All & ~SelectorConstraints.ToolTip;
  } else {
    // Hide resize for multi-selection
    diagram.selectedItems.constraints =
      SelectorConstraints.All & ~SelectorConstraints.ToolTip & ~SelectorConstraints.ResizeAll;
  }
};
