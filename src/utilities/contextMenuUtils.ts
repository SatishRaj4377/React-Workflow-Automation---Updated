import { DIAGRAM_MENU, NODE_MENU } from '../constants';

interface ContextMenuArgs {
  items?: Array<{ id: string; [key: string]: any }>;
  hiddenItems?: string[];
}

// Filter and configure context menu items based on selection state
export const filterContextMenuItems = (
  args: ContextMenuArgs,
  hasNode: boolean,
  hasConnector: boolean,
  isStickyNote: boolean,
  isWorkflowLocked: boolean,
  availableIds: string[]
): void => {
  // Helper to hide all items except allowlist
  const hideAllExcept = (allowIds: string[]) => {
    const allow = new Set(allowIds);
    args.hiddenItems = availableIds.filter((id) => !allow.has(id));
  };

  // Toggle lock/unlock label
  const lockItem = (args.items || []).find((i) => i.id === 'lockWorkflow');
  if (lockItem) {
    lockItem.text = isWorkflowLocked ? 'Unlock Workflow' : 'Lock Workflow';
  }

  // If workflow is locked, only show Lock/Unlock regardless of selection
  if (isWorkflowLocked) {
    hideAllExcept(availableIds.includes('lockWorkflow') ? ['lockWorkflow'] : []);
    return;
  }

  // Sticky note context menu
  if (isStickyNote) {
    hideAllExcept(availableIds.includes('delete') ? ['delete'] : []);
    return;
  }

  // Mixed selection (nodes + connectors) - only show delete
  const isMixed = hasNode && hasConnector;
  if (isMixed) {
    hideAllExcept(availableIds.includes('delete') ? ['delete'] : []);
    return;
  }

  // Connectors only - show nothing
  if (hasConnector && !hasNode) {
    hideAllExcept([]);
    return;
  }

  // Nodes only - show node menu
  if (hasNode) {
    const presentNodeMenu = NODE_MENU.filter((id) => availableIds.includes(id));
    hideAllExcept(presentNodeMenu);
    return;
  }

  // Diagram only - show diagram menu
  const presentDiagramMenu = DIAGRAM_MENU.filter((id) => availableIds.includes(id));
  hideAllExcept(presentDiagramMenu);
};

// Extract available context menu item IDs
export const getAvailableContextMenuIds = (items: any[] = []): string[] => {
  return items.map((i) => i?.id).filter(Boolean);
};
