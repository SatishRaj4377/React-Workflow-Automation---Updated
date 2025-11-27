import { ConnectorModel, UserHandleModel } from "@syncfusion/ej2-react-diagrams";
import { getNodeConfig } from "./nodeUtils";

// Creates a connector between two nodes
let __connectorSeq = 0;
export const createConnector = (
  sourceId: string,
  targetId: string,
  sourcePortId: string,
  targetPortId: string = 'left-port'
): ConnectorModel => ({
  id: `connector-${Date.now()}-${(++__connectorSeq % 100000)}-${Math.floor(Math.random()*1000)}`,
  sourceID: sourceId,
  targetID: targetId,
  sourcePortID: sourcePortId,
  targetPortID: targetPortId
});

export const isConnectorBetweenAgentAndTool = (connector: any, diagramInstance: any): boolean => {
  // Find source and target nodes by their IDs
  const sourceNode = diagramInstance.nodes.find((node: any) => node.id === connector.sourceID);
  const targetNode = diagramInstance.nodes.find((node: any) => node.id === connector.targetID);

  // If either node is not found, return false (though this shouldn't happen for valid connectors)
  if (!sourceNode || !targetNode) return false;

  // Assuming nodes have a 'category' property matching the NodeCategories type
  const sourceCategory = getNodeConfig(sourceNode)?.category;
  const targetCategory = getNodeConfig(targetNode)?.category;

  // Check if one end is ai-agent and the other is tool (order doesn't matter)
  return sourceCategory === "ai-agent" && targetCategory === 'tool';
};

// More specific: only AI Agent bottom port to Tool node connectors
export const isAgentBottomToToolConnector = (connector: any, diagramInstance: any): boolean => {
  if (!connector) return false;
  const sourceNode = diagramInstance.nodes.find((node: any) => node.id === connector.sourceID);
  const targetNode = diagramInstance.nodes.find((node: any) => node.id === connector.targetID);
  if (!sourceNode || !targetNode) return false;

  const sourceCategory = getNodeConfig(sourceNode)?.category;
  const targetCategory = getNodeConfig(targetNode)?.category;
  const sourcePortId: string = connector.sourcePortID || '';

  // Block only when source is AI Agent using a bottom* port and target is a Tool
  return sourceCategory === 'ai-agent' && targetCategory === 'tool' && sourcePortId.startsWith('bottom');
};

// Computes an approximate connector length in pixels using available points/wrapper size
export const computeConnectorLength = (connector: any): number => {
  try {
    const p1 = connector?.sourcePoint ?? connector?.sourceWrapper?.offset ?? null;
    const p2 = connector?.targetPoint ?? connector?.targetWrapper?.offset ?? null;
    if (p1 && p2 && typeof p1.x === 'number' && typeof p2.x === 'number') {
      return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
    const size = connector?.wrapper?.actualSize;
    if (size && typeof size.width === 'number') {
      return Math.hypot(size.width, size.height ?? 0);
    }
  } catch {}
  return Infinity;
};

// Returns adjusted user handles (offset and size) for a given connector length
export const adjustUserHandlesForConnectorLength = (
  userHandles: UserHandleModel[],
  length: number
): UserHandleModel[] => {
  // desired pixel gap between handles (approx). Keep small and clamp.
  const desiredGapPx = length < 100 ? 20 : 30;
  let insertOffset = 0.4;
  let deleteOffset = 0.6;

  if (isFinite(length) && length > 0) {
    const maxFraction = 0.3; // don't push handles beyond reasonable bounds
    const frac = Math.min(maxFraction, desiredGapPx / length);
    const mid = 0.5;
    insertOffset = Math.max(0.1, mid - frac / 2);
    deleteOffset = Math.min(0.9, mid + frac / 2);
  }

  return userHandles.map((h) => {
    if (h.name === 'insertNodeOnConnector') return { ...h, offset: insertOffset, size: length < 100 ? 20 : h.size } as UserHandleModel;
    if (h.name === 'deleteConnector') return { ...h, offset: deleteOffset, size: length < 100 ? 21 : h.size } as UserHandleModel;
    return h;
  });
};
