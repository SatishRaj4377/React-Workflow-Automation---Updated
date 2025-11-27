import { DiagramComponent, NodeConstraints, NodeModel, SnapConstraints } from "@syncfusion/ej2-react-diagrams";
import { DiagramSettings } from "../types";
import { getNodeConfig, isStickyNote } from "./nodeUtils";

// Returns the first selected node in the diagram
export function getFirstSelectedNode(diagram: DiagramComponent | null | undefined): NodeModel | undefined {
  if (!diagram || !diagram.selectedItems || !Array.isArray(diagram.selectedItems.nodes)) return undefined;
  if (diagram.selectedItems.nodes.length === 0) return undefined;
  return diagram.selectedItems.nodes[0];
}

// Sets the constraints for nodes
export function updateNodeConstraints(node: NodeModel) {
  const nodeConfig = getNodeConfig(node);

  // Base constraints remain the same
  let baseConstraints = NodeConstraints.Default &
    ~NodeConstraints.Rotate &
    ~NodeConstraints.InConnect &
    ~NodeConstraints.OutConnect;

  // For sticky note node, don't hide the thumbs (this enables resizing for sticky notes)
  node.constraints = nodeConfig && isStickyNote(nodeConfig)
    ? baseConstraints
    : (baseConstraints & ~NodeConstraints.Resize) | NodeConstraints.HideThumbs | NodeConstraints.ReadOnly;
}

// Diagram state management utilities
export const hasDiagramNodes = (diagram: DiagramComponent | null): boolean => {
  return Boolean(diagram?.nodes?.length);
};

export const getNodesOfType = (diagram: DiagramComponent | null, type: string): NodeModel[] => {
  if (!diagram?.nodes) return [];
  return diagram.nodes.filter(node => getNodeConfig(node)?.nodeType === type);
};


export const isNodeSelected = (diagram: DiagramComponent | null, nodeId: string): boolean => {
  return diagram?.selectedItems?.nodes?.some(node => node.id === nodeId) || false;
};

export const getDefaultDiagramSettings = (): DiagramSettings => {
  const diagramSettings: DiagramSettings = {
    gridStyle: 'dotted',
    connectorType: 'Orthogonal',
    connectorCornerRadius: 10,
    snapping: { isEnabled: true, enableSnapToGrid: true, enableSnapToObjects: false },
    showOverview: true,
    showOverviewAlways: false,
  };
  return diagramSettings;
}

export const getGridType = (diagramSettings: DiagramSettings) => {
  if (!diagramSettings?.gridStyle || diagramSettings.gridStyle === 'none') return 'Lines';
  return diagramSettings.gridStyle === 'lines' ? 'Lines' : 'Dots';
};

export const getGridColor = (diagramSettings: DiagramSettings) => {
  if (diagramSettings?.gridStyle === 'none') return 'transparent';
  if (diagramSettings?.gridStyle === 'lines') return 'var(--grid-line-color)';
  return 'var(--grid-dotted-color)';
};

export const getSnapConstraints = (diagramSettings: DiagramSettings) => {
  if (!diagramSettings?.snapping.isEnabled) return SnapConstraints.ShowLines;

  let constraints = SnapConstraints.ShowLines;
  if (diagramSettings?.snapping.enableSnapToGrid) {
    constraints |= SnapConstraints.SnapToLines        // snaps to both H & V grid lines (grid)
  }
  if (diagramSettings?.snapping.enableSnapToObjects) {
    constraints |= SnapConstraints.SnapToObject;      // snaps to nearby objects
  }

  return constraints;

};

export const getConnectorType = (diagramSettings: DiagramSettings) => {
  return diagramSettings?.connectorType;
};

export const getConnectorCornerRadius = (diagramSettings: DiagramSettings) => {
  if (diagramSettings?.connectorType === 'Orthogonal') return diagramSettings.connectorCornerRadius;
  return 0;
};

export interface ViewportCheckOptions {
  margin?: number;
}

export const isNodeOutOfViewport = (
  diagram: DiagramComponent | null | undefined,
  node: NodeModel | null | undefined,
): boolean => {
  if (!diagram || !node) {
    return true;
  }

  const scrollSettings = diagram.scrollSettings;
  if (!scrollSettings) {
    return true;
  }

  const zoom = scrollSettings.currentZoom || 1;
  const hostElement = (diagram.element as HTMLElement) || null;
  const viewportWidthInPixels = scrollSettings.viewPortWidth || hostElement?.clientWidth || 0;
  const viewportHeightInPixels = scrollSettings.viewPortHeight || hostElement?.clientHeight || 0;

  if (viewportWidthInPixels === 0 || viewportHeightInPixels === 0) {
    return true;
  }

  const viewportWidth = viewportWidthInPixels / zoom;
  const viewportHeight = viewportHeightInPixels / zoom;

  const nodeModel = node;
  const width = (nodeModel as any).actualSize?.width ?? nodeModel.width ?? 0;
  const height = (nodeModel as any).actualSize?.height ?? nodeModel.height ?? 0;

  if (width === 0 && height === 0) {
    return true;
  }

  const offsetX = nodeModel.offsetX ?? 0;
  const offsetY = nodeModel.offsetY ?? 0;

  const nodeLeft = offsetX - width / 2;
  const nodeRight = offsetX + width / 2;
  const nodeTop = offsetY - height / 2;
  const nodeBottom = offsetY + height / 2;

  const viewLeft = scrollSettings.horizontalOffset || 0;
  const viewTop = scrollSettings.verticalOffset || 0;
  const viewRight = viewLeft + viewportWidth;
  const viewBottom = viewTop + viewportHeight;

  const isOutside =
    nodeRight < viewLeft ||
    nodeLeft > viewRight ||
    nodeBottom < viewTop ||
    nodeTop > viewBottom;

  return isOutside;
};

export const bringConnectorsToFront = (diagram: DiagramComponent) => {
  // Select all connectors
  diagram.select(diagram.connectors);

  // Move selected connectors forward
  diagram.bringToFront();

  // Clear selection to avoid UI side effects
  diagram.clearSelection();
}

/** Find node connected out of a specific source port */
export const getConnectedTargetBySourcePort = (diagram: any, sourceId: string, sourcePortId: string): NodeModel | undefined => {
  if (!diagram?.connectors) return undefined;
  const conn = diagram.connectors.find((c: any) =>
    c.sourceID === sourceId && c.sourcePortID === sourcePortId
  );
  return conn ? diagram.getObject(conn.targetID) : undefined;
}

/** Find node connected into a specific target port */
export const getConnectedSourceByTargetPort = (diagram: any, targetId: string, targetPortId: string): NodeModel | undefined => {
  if (!diagram?.connectors) return undefined;
  const conn = diagram.connectors.find((c: any) =>
    c.targetID === targetId && c.targetPortID === targetPortId
  );
  return conn ? diagram.getObject(conn.sourceID) : undefined;
}

/** Return ALL targets connected from a node's specific source port (includes tool nodes). */
export const  getAllTargetsBySourcePortIncludingTools = (
  diagram: any,
  sourceId: string,
  sourcePortId: string
): NodeModel[]  => {
  const connectors = (diagram?.connectors ?? []) as any[];
  return connectors
    .filter(c => c.sourceID === sourceId && c.sourcePortID === sourcePortId)
    .map(c => diagram.getObject(c.targetID))
    .filter(Boolean);
}