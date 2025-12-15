import { getNodeConfig, calculateNewNodePosition, createConnector, createNodeFromTemplate, isAiAgentNode, findAiAgentBottomConnectedNodes, getAiAgentBottomNodePosition, isAgentBottomToToolConnector, getNodeCenter, findFirstPortId, adjustNodesSpacing, applyStaggerMetadata, getNextStaggeredOffset } from './index';
import { NodeTemplate, StickyNotePosition } from '../types';
import { DiagramTools, NodeModel } from '@syncfusion/ej2-react-diagrams';

// Extract prompt suggestions from the Chat trigger node in the diagram
export function extractChatPromptSuggestions(diagram: any): string[] {
  try {
    if (!diagram) return [];
    const nodes: any[] = Array.isArray(diagram.nodes) ? diagram.nodes : [];
    for (const n of nodes) {
      try {
        const cfg = getNodeConfig(n);
        if (cfg?.nodeType === 'Chat') {
          const arr = (cfg as any)?.settings?.general?.promptSuggestions;
          return Array.isArray(arr) ? arr : [];
        }
      } catch {}
    }
  } catch {}
  return [];
}

// Extract optional banner text from the Chat trigger node in the diagram
export function extractChatBannerText(diagram: any): string {
  try {
    if (!diagram) return '';
    const nodes: any[] = Array.isArray(diagram.nodes) ? diagram.nodes : [];
    for (const n of nodes) {
      try {
        const cfg = getNodeConfig(n);
        if (cfg?.nodeType === 'Chat') {
          const txt = (cfg as any)?.settings?.general?.bannerText;
          return typeof txt === 'string' ? txt : '';
        }
      } catch {}
    }
  } catch {}
  return '';
}

// Check if current active element is a text-editing element (prevents spacebar pan interference)
export function isEditingTextElement(active: Element | null): boolean {
  const el = active as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  return el.getAttribute('contenteditable') === 'true';
}

// Determine palette filter context based on port and node type
export function determinePaletteFilterContext(isAgent: boolean, isBottomPort: boolean): string {
  return isAgent && isBottomPort ? 'port-agent-bottom' : 'port-core-flow';
}

// Validate sticky note position object
export function isValidStickyNotePosition(position: any): boolean {
  return position && typeof position === 'object' && typeof position.x === 'number' && typeof position.y === 'number';
}

// Calculate default sticky note position in diagram center
export function getDefaultStickyNotePosition(diagram: any): { x: number; y: number } {
  if (!diagram) return { x: 300, y: 300 };
  return {
    x: diagram.scrollSettings.viewPortWidth / 3,
    y: diagram.scrollSettings.viewPortHeight / 2,
  };
}

// Create sticky note object with stagger metadata and default positioning
export function createStickyNoteNode(position: { x: number; y: number }, staggerIndex?: number): any {
  const timestamp = Date.now();
  return {
    id: `sticky-${timestamp}`,
    width: 240,
    height: 240,
    offsetX: position.x,
    offsetY: position.y - 64,
    constraints: 1024 & ~4,
    addInfo: {
      nodeConfig: {
        id: `sticky-${timestamp}`,
        category: 'sticky',
        displayName: 'Sticky Note',
      },
    },
    _staggerIndex: staggerIndex,
  };
}

// Handle adding sticky note with positioning and staggering
export function handleAddStickyNote(
  diagramRef: any,
  position: StickyNotePosition | undefined,
  callbacks: { applyStagger: (note: any, index: number) => void; addNode: (note: any) => void }
): void {
  if (!diagramRef) return;

  let finalPosition = isValidStickyNotePosition(position) ? position : getDefaultStickyNotePosition(diagramRef);

  let staggerIndex: number | undefined;
  if (!position?.fromMouse) {
    const staggered = getNextStaggeredOffset(diagramRef, finalPosition.x, finalPosition.y, {
      group: 'sticky',
      strategy: 'grid',
      stepX: 220,
      stepY: 220,
    });
    finalPosition = { x: staggered.x, y: staggered.y };
    staggerIndex = staggered.index;
  }

  const stickyNote = createStickyNoteNode(finalPosition, staggerIndex);
  if (staggerIndex !== undefined) {
    callbacks.applyStagger(stickyNote, staggerIndex);
  }
  callbacks.addNode(stickyNote);
}

// Add a node directly to canvas without wiring
export function addNodeToDiagram(diagramRef: any, nodeTemplate: NodeTemplate): void {
  if (!diagramRef) return;
  const newNode = createNodeFromTemplate(nodeTemplate);
  diagramRef.add(newNode);
}

// Add node connected to port with auto-wire connector
export function addNodeFromPort(
  diagramRef: any,
  selectedPortConnection: { nodeId: string; portId: string },
  nodeTemplate: NodeTemplate,
  callbacks: { resetState: () => void; repositionTargets: (node: NodeModel) => void }
): void {
  if (!diagramRef || !selectedPortConnection) return;

  const sourceNode = diagramRef.getObject(selectedPortConnection.nodeId);
  if (!sourceNode) {
    console.error('Source node not found for connection.');
    return;
  }

  const { offsetX: x, offsetY: y } = calculateNewNodePosition(sourceNode, selectedPortConnection.portId);
  const newNode = createNodeFromTemplate(nodeTemplate, { x, y });
  const connector = createConnector(
    selectedPortConnection.nodeId,
    newNode.id || '',
    selectedPortConnection.portId,
    nodeTemplate?.category === 'tool' ? 'top-port' : 'left-port'
  );

  diagramRef.add(newNode);
  diagramRef.add(connector);

  // Reposition AI Agent bottom targets if adding from bottom port
  try {
    const srcCfg = getNodeConfig(sourceNode as NodeModel);
    if (srcCfg && isAiAgentNode(srcCfg) && selectedPortConnection.portId.toLowerCase().startsWith('bottom')) {
      callbacks.repositionTargets(sourceNode as NodeModel);
    }
  } catch (err) {}

  diagramRef.tool = DiagramTools.Default;
  callbacks.resetState();
}

// Insert node between connector's source and target
export function insertNodeBetweenSelectedConnector(
  diagramRef: any,
  selectedConnectorForInsertion: any,
  nodeTemplate: NodeTemplate,
  callbacks: {
    resetConnectorMode: () => void;
    closePanel: () => void;
  }
): void {
  if (!diagramRef || !selectedConnectorForInsertion) return;

  const conn = selectedConnectorForInsertion as any;

  // Restrict: do not allow inserting into AI Agent bottom* -> Tool connectors
  try {
    if (isAgentBottomToToolConnector(conn, diagramRef)) {
      callbacks.resetConnectorMode();
      callbacks.closePanel();
      return;
    }
  } catch {}

  const sourceNode = diagramRef.getObject(conn.sourceID) as NodeModel | null;
  const targetNode = diagramRef.getObject(conn.targetID) as NodeModel | null;

  if (!sourceNode || !targetNode) {
    addNodeToDiagram(diagramRef, nodeTemplate);
    callbacks.resetConnectorMode();
    return;
  }

  // Compute midpoint between source and target
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);
  const midX = (sourceCenter.x + targetCenter.x) / 2;
  const midY = (sourceCenter.y + targetCenter.y) / 2;

  // Create and add new node
  const newInsertedNode = createNodeFromTemplate(nodeTemplate, { x: midX, y: midY });
  diagramRef.add(newInsertedNode);
  diagramRef.remove(conn);

  // Wire two new connectors with original port IDs
  const newNodeInPortId = findFirstPortId(newInsertedNode as NodeModel, false);
  const newIncomingConnector = createConnector(
    conn.sourceID,
    newInsertedNode.id || '',
    conn.sourcePortID,
    newNodeInPortId
  );

  const newNodeOutPortId = findFirstPortId(newInsertedNode as NodeModel, true);
  const newOutgoingConnector = createConnector(
    newInsertedNode.id || '',
    conn.targetID,
    newNodeOutPortId,
    conn.targetPortID
  );

  diagramRef.add(newIncomingConnector);
  diagramRef.add(newOutgoingConnector);

  // Adjust spacing to avoid overlapping
  adjustNodesSpacing(sourceNode, targetNode, 250);
  callbacks.resetConnectorMode();
  callbacks.closePanel();
}

// Auto-align all nodes in diagram and fix AI Agent bottom targets spacing
export function handleAutoAlign(
  diagramRef: any,
  callbacks: { repositionAgentTargets: (node: NodeModel) => void }
): void {
  if (!diagramRef) return;

  diagramRef.doLayout();

  // Reposition all AI Agent bottom targets to maintain spacing
  const nodes: any[] = diagramRef.nodes && Array.isArray(diagramRef.nodes) ? diagramRef.nodes : [];
  nodes.forEach((n: NodeModel) => {
    try {
      const cfg = getNodeConfig(n);
      if (cfg && isAiAgentNode(cfg)) {
        const bottomTargets = findAiAgentBottomConnectedNodes(n, diagramRef);
        if (bottomTargets.length > 0) {
          callbacks.repositionAgentTargets(n);
        }
      }
    } catch (err) {}
  });

  diagramRef.dataBind();
  diagramRef.reset();
  diagramRef.fitToPage();
}
