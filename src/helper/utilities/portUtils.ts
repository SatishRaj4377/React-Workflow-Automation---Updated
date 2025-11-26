import { NodeModel, Point, PointPortModel, PortConstraints, PortModel, PortVisibility, Diagram, ConnectorModel } from "@syncfusion/ej2-react-diagrams";
import { NodeCategories, NodeConfig, NodePortDirection, NodeType, PortConfiguration, PortSide } from "../../types";
import { PORT_POSITIONS } from "../../constants";
import { NODE_REGISTRY } from "../../constants/nodeRegistry";
import { getNodeConfig, isAiAgentNode } from "./nodeUtils";
import { refreshNodeTemplate } from "./nodeTemplateUtils";

// Helper to find first IN/OUT port id on a node
export const findFirstPortId = (node: NodeModel, wantOut: boolean): string => {
  const ports = Array.isArray(node.ports) ? (node.ports as any) : [];
  const match = ports.find((p: PortModel) => {
    const c = p.constraints ?? 0;
    return wantOut
      ? ((c & PortConstraints.OutConnect) !== 0 && (c & PortConstraints.Draw) !== 0)
      : ((c & PortConstraints.InConnect) !== 0);
  });
  return match?.id || (wantOut ? 'right-port' : 'left-port');
};

export const createPort = (
  id: string,
  offset: { x: number; y: number },
  shape: "Circle" | "Square" = "Circle",
  size: number = 20,
  constraints: PortConstraints,
): PointPortModel => ({
  id,
  offset,
  shape,
  height: size,
  width: size,
  style: { fill: "transparent", strokeColor: "transparent" },
  visibility: PortVisibility.Visible,
  constraints,
});

// Build concrete ports from a declarative PortConfiguration
function buildPortsFromConfig(config: PortConfiguration): PortModel[] {
  const ports: PortModel[] = [];
  if (config.topPort) ports.push(createPort("top-port", PORT_POSITIONS.TOP, "Circle", 20, PortConstraints.InConnect));
  if (config.rightPort) ports.push(createPort("right-port", PORT_POSITIONS.RIGHT, "Circle", 20, PortConstraints.OutConnect | PortConstraints.Draw));
  if (config.rightTopPort) ports.push(createPort("right-top-port", PORT_POSITIONS.RIGHT_TOP, "Circle", 20, PortConstraints.OutConnect | PortConstraints.Draw));
  if (config.rightBottomPort) ports.push(createPort("right-bottom-port", PORT_POSITIONS.RIGHT_BOTTOM, "Circle", 20, PortConstraints.OutConnect | PortConstraints.Draw));
  // if bottomleft port is true, then ports are for ai agent node, so we will use the use the AI agent left port position, otherwise use the default left port position.
  if (config.leftPort) ports.push(createPort("left-port", config.bottomLeftPort ? PORT_POSITIONS.AI_AGENT_LEFT : PORT_POSITIONS.LEFT, "Circle", 20, PortConstraints.InConnect));
  if (config.bottomLeftPort) ports.push(createPort("bottom-left-port", PORT_POSITIONS.BOTTOM_LEFT, "Square", 14, PortConstraints.OutConnect | PortConstraints.Draw));
  if (config.bottomRightPort) ports.push(createPort("bottom-right-port", PORT_POSITIONS.BOTTOM_RIGHT, "Square", 14, PortConstraints.OutConnect | PortConstraints.Draw));
  return ports;
}

// Single source of truth for category fallbacks (used only if registry lacks config)
const DEFAULT_PORT_CONFIG_BY_CATEGORY: Record<NodeCategories, PortConfiguration> = {
  'ai-agent': { leftPort: true, rightPort: true, bottomLeftPort: true, bottomRightPort: true },
  'condition': { leftPort: true, rightTopPort: true, rightBottomPort: true },
  'trigger': { rightPort: true },
  'tool': { topPort: true },
  'action': { leftPort: true, rightPort: true },
  'sticky': { leftPort: true, rightPort: true },
};

function resolvePortConfiguration(nodeConfig: NodeConfig): PortConfiguration {
  const entry = NODE_REGISTRY[nodeConfig.nodeType as NodeType];
  if (entry?.portConfig) return entry.portConfig;
  return DEFAULT_PORT_CONFIG_BY_CATEGORY[nodeConfig.category];
}

// New API: always prefer registry; fall back to category defaults only if needed
export function getPortsForNode(input: NodeConfig | NodeType | NodeCategories): PortModel[] {
  if (typeof input === 'object' && (input as NodeConfig).nodeType) {
    return buildPortsFromConfig(resolvePortConfiguration(input as NodeConfig));
  }

  const typeOrCategory = input as any;
  const entry = NODE_REGISTRY[typeOrCategory as NodeType];
  if (entry) {
    return buildPortsFromConfig(entry.portConfig ?? DEFAULT_PORT_CONFIG_BY_CATEGORY[entry.category]);
  }

  return buildPortsFromConfig(DEFAULT_PORT_CONFIG_BY_CATEGORY[typeOrCategory as NodeCategories]);
}

// Retrieves a specific port from a given node by its ID.
export function getNodePortById(node: NodeModel | null | undefined, portId: string): PortModel | undefined {
  // Ensure the node, its ports array, and the portId are valid before searching
  if (!node || !node.ports || !Array.isArray(node.ports) || !portId) {
    return undefined;
  }

  // Find the port that matches the provided ID
  return node.ports.find((p: PortModel) => p.id === portId);
}

// Convert direction to side
export const getPortSide = (direction: NodePortDirection): PortSide =>
  direction.startsWith('right') ? 'Right' : 'Bottom';

// Convert direction to offset
export const getPortOffset = (direction: NodePortDirection): number => {
  const offsetMap: Record<NodePortDirection, number> = {
    'right': PORT_POSITIONS.RIGHT.y,
    'right-top': PORT_POSITIONS.RIGHT_TOP.y,
    'right-bottom': PORT_POSITIONS.RIGHT_BOTTOM.y,
    'bottom-left': PORT_POSITIONS.BOTTOM_LEFT.x,
    'bottom-middle': PORT_POSITIONS.BOTTOM_MIDDLE.x,
    'bottom-right': PORT_POSITIONS.BOTTOM_RIGHT.x,
  };
  return offsetMap[direction] ?? 0.5;
};

// Store the port ID and direction info for dynamic userhandle rendering
export function prepareUserHandlePortData(node: NodeModel): void {
  // Infers the direction of a port based on its offset and returns side + offset for userhandle placement
  const inferMeta = (port: PortModel): { direction: NodePortDirection; side: PortSide; offset: number } => {
    const pointPort = port as PointPortModel;
    if (pointPort?.offset) {
      const { x, y } = pointPort.offset as Point;
      // Right side
      if (x === PORT_POSITIONS.RIGHT.x && y === PORT_POSITIONS.RIGHT.y)
        return { direction: 'right', side: 'Right', offset: y } as any;
      if (x === PORT_POSITIONS.RIGHT_TOP.x && y === PORT_POSITIONS.RIGHT_TOP.y)
        return { direction: 'right-top', side: 'Right', offset: y } as any;
      if (x === PORT_POSITIONS.RIGHT_BOTTOM.x && y === PORT_POSITIONS.RIGHT_BOTTOM.y)
        return { direction: 'right-bottom', side: 'Right', offset: y } as any;

      // Bottom side
      if (x === PORT_POSITIONS.BOTTOM_LEFT.x && y === PORT_POSITIONS.BOTTOM_LEFT.y)
        return { direction: 'bottom-left', side: 'Bottom', offset: x } as any;
      if (x === PORT_POSITIONS.BOTTOM_MIDDLE.x && y === PORT_POSITIONS.BOTTOM_MIDDLE.y)
        return { direction: 'bottom-middle', side: 'Bottom', offset: x } as any;
      if (x === PORT_POSITIONS.BOTTOM_RIGHT.x && y === PORT_POSITIONS.BOTTOM_RIGHT.y)
        return { direction: 'bottom-right', side: 'Bottom', offset: x } as any;

      // Dynamic: if port lies on right edge (x ~ 1), treat as right with custom offset
      if (Math.abs(x - 1) < 0.0001) {
        return { direction: 'right', side: 'Right', offset: y } as any;
      }
    }
    return { direction: 'right', side: 'Right', offset: 0.5 } as any; // Default fallback
  };

  if (!node.ports) return;

  const connectablePorts = node.ports
    .filter(
      (p) =>
        p.constraints !== undefined &&
        (p.constraints & PortConstraints.OutConnect) !== 0 &&
        (p.constraints & PortConstraints.Draw) !== 0
    )
    .map((port) => {
      const meta = inferMeta(port);
      return {
        portId: port.id,
        direction: meta.direction,
        side: meta.side,
        offset: meta.offset,
      };
    });

  if (connectablePorts.length > 0) {
    if (!node.addInfo) node.addInfo = {};
    (node.addInfo as any).userHandlesAtPorts = connectablePorts;
  }
}

/**
 * Determines whether we should render the add-node userhandle for a given port on a node.
 * Rules:
 * - If a completed connector already exists from the node using that port, hide the handle
 * - EXCEPTION: For AI Agent nodes, on the 'bottom-right-port' allow multiple tool connections,
 *   so we always show the handle for that specific port
 */
export function shouldShowUserHandleForPort(node: any, portId: string, diagramInstance: any): boolean {
  if (!node || !portId || !diagramInstance) return true;

  const nodeConfig = getNodeConfig(node);
  // Exception: AI Agent bottom-right port supports multiple connections
  if (nodeConfig && isAiAgentNode(nodeConfig) && portId === 'bottom-right-port') {
    return true;
  }

  const connectors: ConnectorModel[] = Array.isArray(diagramInstance.connectors)
    ? (diagramInstance.connectors as any)
    : [];

  // A port is considered used only if the connector is fully connected
  const hasCompletedConnectionFromPort = connectors.some((c: any) =>
    c &&
    c.sourceID === node.id &&
    c.sourcePortID === portId &&
    typeof c.targetID === 'string' &&
    c.targetID.length > 0
  );

  return !hasCompletedConnectionFromPort;
}

// Get the appropriate port rendering configuration for a node in the template
export const getNodePortConfiguration = (nodeConfig: NodeConfig): PortConfiguration => resolvePortConfiguration(nodeConfig);

// ---- Dynamic Switch Case Ports ----
export function createSwitchCasePorts(count: number, includeDefault: boolean = false): PortModel[] {
  const ports: PortModel[] = [];
  ports.push(createPort("left-port", PORT_POSITIONS.LEFT, "Circle", 20, PortConstraints.InConnect));

  const start = 0.2, end = 0.8;
  const step = count > 1 ? (end - start) / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0.5 : start + i * step;
    ports.push(createPort(`right-case-${i + 1}`, { x: 1, y }, "Circle", 20, PortConstraints.OutConnect | PortConstraints.Draw));
  }

  // optional default port (placed slightly below the last case)
  if (includeDefault) {
    const y = Math.min(0.95, (count === 1 ? 0.5 : end) + 0.08);
    ports.push(createPort('right-case-default', { x: 1, y }, "Circle", 20, PortConstraints.OutConnect | PortConstraints.Draw));
  }
  return ports;
}

export function initializeSwitchCaseNodePorts(node: NodeModel, rulesCount: number = 1, includeDefault: boolean = false) {
  const count = Math.max(1, rulesCount);
  node.ports = createSwitchCasePorts(count, includeDefault);

  const start = 0.2, end = 0.8;
  const step = count > 1 ? (end - start) / (count - 1) : 0;
  const offsets = Array.from({ length: count }, (_, i) => (count === 1 ? 0.5 : start + i * step));

  if (!node.addInfo) node.addInfo = {} as any;
  (node.addInfo as any).dynamicCaseOffsets = includeDefault ? [...offsets, Math.min(0.95, (count === 1 ? 0.5 : end) + 0.08)] : offsets;
  (node.addInfo as any).dynamicCaseCount = includeDefault ? (count + 1) : count;

  prepareUserHandlePortData(node);
}

/**
 * Reconcile a node's ports with a desired set:
 * - Remove ports that no longer exist
 * - Add new ports
 * - Update properties on ports that remain
 */
function reconcilePorts(diagram: Diagram, node: NodeModel, desiredPorts: PortModel[]) {
  const existingPorts = Array.isArray(node.ports) ? node.ports : [];

  // Index by id for quick membership checks
  const existingById = new Map(existingPorts.map(port => [port.id, port]));
  const desiredById  = new Map(desiredPorts.map(port  => [port.id, port]));

  // Compute the delta
  const portsToRemove = existingPorts.filter(port => !desiredById.has(port.id));
  const portsToAdd    = desiredPorts.filter(port  => !existingById.has(port.id));

  // Apply structural changes first so the collection matches the desired shape
  if (portsToRemove.length) diagram.removePorts(node as any, portsToRemove as any);
  if (portsToAdd.length)    diagram.addPorts(node as any, portsToAdd as any);

  // For ports present in both sets, sync mutable properties (offset, constraints, size, style, etc.)
  for (const desired of desiredPorts) {
    const existing = existingById.get(desired.id);
    if (existing) Object.assign(existing, desired);
  }
}

export function updateSwitchPorts(
  diagram: Diagram | null,
  nodeId: string,
  rulesCount: number,
  includeDefault: boolean = false
) {
  if (!diagram) return;

  const node = diagram.getObject(nodeId) as NodeModel | null;
  if (!node) return;

  // Ensure at least one case
  const normalizedCount = Math.max(1, rulesCount);

  // Build the desired switch-case ports for this node
  const desiredPorts = createSwitchCasePorts(normalizedCount, includeDefault);

  // Reconcile current ports with the desired set
  reconcilePorts(diagram, node, desiredPorts);

  // Update node template metadata
  const verticalStart = 0.2;
  const verticalEnd   = 0.8;
  const step = normalizedCount > 1 ? (verticalEnd - verticalStart) / (normalizedCount - 1) : 0;

  const caseOffsets = Array.from(
    { length: normalizedCount },
    (_, i) => (normalizedCount === 1 ? 0.5 : verticalStart + i * step)
  );

  if (!node.addInfo) node.addInfo = {} as any;

  (node.addInfo as any).dynamicCaseOffsets = includeDefault
    ? [...caseOffsets, Math.min(0.95, (normalizedCount === 1 ? 0.5 : verticalEnd) + 0.08)]
    : caseOffsets;

  (node.addInfo as any).dynamicCaseCount = includeDefault
    ? (normalizedCount + 1)
    : normalizedCount;

  // Adjust node height so port handles have enough space
  const baseHeightPx = 80;
  const extraPerRulePx = 22;
  const totalVisualPorts = includeDefault ? (normalizedCount + 1) : normalizedCount;
  node.height = baseHeightPx + Math.max(0, totalVisualPorts - 1) * extraPerRulePx;

  // Refresh user-handle metadata for your UI
  prepareUserHandlePortData(node);

  // refresh the node template (handler will come from global if Editor provided it)
  refreshNodeTemplate(diagram as any, nodeId);
}
