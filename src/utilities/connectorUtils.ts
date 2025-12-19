import { ConnectorModel, UserHandleModel, ConnectorConstraints } from "@syncfusion/ej2-react-diagrams";
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
  connectorLength: number
): UserHandleModel[] => {
  // desired pixel gap between handles (approx). Keep small and clamp.
  const desiredGapPx = connectorLength < 100 ? 20 : 30;
  let insertHandleOffset = 0.4;
  let deleteHandleOffset = 0.6;

  if (isFinite(connectorLength) && connectorLength > 0) {
    const maxFraction = 0.3; // don't push handles beyond reasonable bounds
    const frac = Math.min(maxFraction, desiredGapPx / connectorLength);
    const mid = 0.5;
    insertHandleOffset = Math.max(0.1, mid - frac / 2);
    deleteHandleOffset = Math.min(0.9, mid + frac / 2);
  }

  return userHandles.map((handle) => {
    if (handle.name === 'insertNodeOnConnector') return { ...handle, offset: insertHandleOffset, size: connectorLength < 100 ? 20 : handle.size } as UserHandleModel;
    if (handle.name === 'deleteConnector') return { ...handle, offset: deleteHandleOffset, size: connectorLength < 100 ? 21 : handle.size } as UserHandleModel;
    return handle;
  });
};

// --- Connector styling and validation utilities
const GRAY_COLOR = '#9193a2ff';
const CONNECTOR_STROKEDASH_ARR = '5 3';

// Apply visual style to connector after successful connection
export const finalizeConnectorStyle = (connector: ConnectorModel): void => {
  // Update to solid style when fully connected
  setTimeout(() => {
    connector.style = {
      ...connector.style,
      strokeDashArray: '',
      opacity: 1,
    };
    connector.constraints =
      (ConnectorConstraints.Default | ConnectorConstraints.ReadOnly) &
      ~ConnectorConstraints.DragSourceEnd &
      ~ConnectorConstraints.DragTargetEnd &
      ~ConnectorConstraints.Drag;
  });
};

// Apply disconnected style to incomplete connectors
export const applyDisconnectedConnectorStyle = (connector: ConnectorModel): void => {
  connector.style = {
    strokeColor: GRAY_COLOR,
    strokeDashArray: CONNECTOR_STROKEDASH_ARR,
    strokeWidth: 2,
  };
};

// Validate and remove disconnected connectors
export const removeDisconnectedConnectorIfInvalid = (connector: ConnectorModel, diagramRef: any): boolean => {
  const isDisconnected =
    !connector.sourceID ||
    connector.sourceID.toString().trim() === '' ||
    !connector.targetID ||
    connector.targetID.toString().trim() === '';

  if (isDisconnected && diagramRef?.current) {
    setTimeout(() => {
      try {
        (diagramRef.current as any).remove(connector);
      } catch (error) {
        console.error('Failed to remove disconnected connector:', error);
      }
    }, 0);
    return true;
  }

  return false;
};

// Update connector hover styling
export const applyConnectorHoverStyle = (connector: any, hoverColor: string): void => {
  connector.style = {
    ...connector.style,
    strokeColor: hoverColor,
  };
  connector.targetDecorator = {
    ...connector.targetDecorator,
    style: {
      ...connector.targetDecorator?.style,
      fill: hoverColor,
      strokeColor: hoverColor,
    },
  };
};

// Reset connector to default styling
export const resetConnectorToDefaultStyle = (connector: any): void => {
  connector.style = {
    ...connector.style,
    strokeColor: GRAY_COLOR,
  };
  connector.targetDecorator = {
    ...connector.targetDecorator,
    style: {
      ...connector.targetDecorator?.style,
      fill: GRAY_COLOR,
      strokeColor: GRAY_COLOR,
    },
  };
};
