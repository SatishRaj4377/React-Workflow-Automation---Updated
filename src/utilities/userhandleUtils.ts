import { NodeModel, UserHandleModel, DiagramComponent, ConnectorModel } from "@syncfusion/ej2-react-diagrams";
import { NodePortDirection } from "../types";
import { getPortSide, getPortOffset, shouldShowUserHandleForPort } from "./portUtils";
import { computeConnectorLength, adjustUserHandlesForConnectorLength, getFirstSelectedNode } from "./index";

// Color constants for user handles
const GRAY_COLOR = '#9193a2ff';
const HOVER_COLOR = 'var(--accent-color)';

// Build connector and node operation handles
export const buildUserHandles = (): UserHandleModel[] => {
  return [
    {
      name: 'insertNodeOnConnector',
      content: `
        <g class="insert-handle">
          <rect class="bg" x="1" y="1" width="14" height="14" rx="3" ry="3" fill="${GRAY_COLOR}"/>
          <path class="plus" d="M8 5 V11 M5 8 H11" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
          <style>
            .insert-handle { cursor: pointer; }
            .insert-handle:hover .bg { fill: ${HOVER_COLOR}; }
          </style>
        </g>
      `,
      offset: 0.4,
      tooltip: { content: 'Insert Node' },
      disableNodes: true,
      size: 24,
    },
    {
      name: 'deleteConnector',
      content: `
        <g class="delete-handle">
          <rect class="bg" x="-1.4" y="-1.4" width="16" height="16" rx="3" ry="3" fill="${GRAY_COLOR}" />
          <g class="icon" transform="translate(2.4,2.4) scale(0.6)">
            <path d="M0.97,3.04 L12.78,3.04 L12.78,12.21 C12.78,12.64,12.59,13,12.2,13.3 C11.82,13.6,11.35,13.75,10.8,13.75 L2.95,13.75 C2.4,13.75,1.93,13.6,1.55,13.3 C1.16,13,0.97,12.64,0.97,12.21 Z M4.43,0 L9.32,0 L10.34,0.75 L13.75,0.75 L13.75,2.29 L0,2.29 L0,0.75 L3.41,0.75 Z" fill="#f8fafc"/>
          </g>
          <style>
            .delete-handle { cursor: pointer; }
            .delete-handle:hover .bg { fill: ${HOVER_COLOR}; stroke: ${HOVER_COLOR}; }
            .delete-handle:hover .icon path { fill: #ffffff; }
          </style>
        </g>
      `,
      offset: 0.6,
      tooltip: { content: 'Delete Connector', position: 'TopRight' },
      disableNodes: true,
      size: 25,
    },
  ];
};

// Generate port-based user handles for node connections
export const generatePortBasedUserHandles = (
  node: NodeModel,
  diagram?: DiagramComponent | null
): UserHandleModel[] => {
  const portHandlesInfo: Array<{
    portId: string;
    direction: NodePortDirection;
    side?: any;
    offset?: number;
  }> = (node.addInfo as any)?.userHandlesAtPorts ?? [];

  const availablePorts = portHandlesInfo.filter(({ portId }) =>
    shouldShowUserHandleForPort(node, portId, diagram)
  );

  return availablePorts.map(({ portId, direction, side, offset }) => ({
    name: `add-node-from-port-${portId}`,
    content: `
      <g class="add-handle">
        <rect class="bg" x="1" y="1" width="14" height="14" rx="3" ry="3" fill="${GRAY_COLOR}"/>
        <path class="plus" d="M8 5 V11 M5 8 H11" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
        <style>
          .add-handle { cursor: pointer; }
          .add-handle:hover .bg { fill: ${HOVER_COLOR}; }
        </style>
      </g>
    `,
    side: side ?? getPortSide(direction),
    offset: offset ?? getPortOffset(direction),
    disableConnectors: true,
    size: 22,
    visible: true,
    tooltip: { content: 'Add Node', position: 'RightCenter' },
  }));
};

// Recompute and apply user handles based on current selection
export function refreshSelectedNodesUserHandles(diagram?: DiagramComponent | null) {
  if (!diagram) return;

  let handles: UserHandleModel[] = buildUserHandles();

  const firstNode = getFirstSelectedNode(diagram);
  const selectedConnector: ConnectorModel | undefined = diagram.selectedItems?.connectors?.[0] as any;

  if (firstNode && diagram.selectedItems.nodes.length === 1) {
    const portHandles = generatePortBasedUserHandles(firstNode, diagram);
    handles.push(...portHandles);
  } else if (selectedConnector) {
    const length = computeConnectorLength(selectedConnector as any);
    handles = adjustUserHandlesForConnectorLength(handles, length);
  }

  diagram.selectedItems.userHandles = handles;
  (diagram as any).dataBind?.();
}