import { DiagramComponent, NodeModel } from '@syncfusion/ej2-react-diagrams';
import { NodeConfig, NodeToolbarAction } from '../types';
import { getNodePortConfiguration } from './portUtils';
import { isSwitchNode, isLoopNode } from './nodeUtils';
import { IconRegistry } from '../assets/icons';

// Global handler used when a local callback isn't provided
let GLOBAL_NODE_TOOLBAR_HANDLER: ((id: string, action: NodeToolbarAction) => void) | undefined;
export function setGlobalNodeToolbarHandler(handler?: (id: string, action: NodeToolbarAction) => void) {
  GLOBAL_NODE_TOOLBAR_HANDLER = handler;
}

// Build node HTML content based on node type/config
export function buildNodeHtml(node: NodeModel): string {
  const addInfo: any = node.addInfo || {};
  const nodeConfig: NodeConfig | undefined = addInfo.nodeConfig;
  if (!nodeConfig) return `<div class="node-template-container"><div class="node-template" data-node-id="${node.id}">Invalid Node</div></div>`;

  const portConfig = getNodePortConfiguration(nodeConfig);
  const isSwitch = isSwitchNode(nodeConfig);
  const isLoop = isLoopNode(nodeConfig);
  const dynamicCaseOffsets: number[] = addInfo?.dynamicCaseOffsets || [];
  const iconKey: any = (nodeConfig as any).icon;
  const iconSrc: string | undefined = iconKey ? (IconRegistry as any)[iconKey] : undefined;

  const leftPort = portConfig.leftPort ? '<div class="node-port-left"></div>' : '';
  const rightPort = portConfig.rightPort && !isSwitch ? '<div class="node-port-right"></div>' : '';

  // For Switch Case, show per-case index and optional case name next to each right port
  const switchRightPorts = isSwitch
    ? (() => {
        const cfg: any = nodeConfig?.settings?.general || {};
        const rules: any[] = Array.isArray(cfg.rules) ? cfg.rules : [];
        // Ensure at least one right port is rendered initially
        const countRaw = Math.max(dynamicCaseOffsets?.length || 0, rules.length || 0);
        const count = Math.max(1, countRaw);
        const positions: number[] = Array.from({ length: count }, (_, i) =>
          typeof dynamicCaseOffsets?.[i] === 'number' ? dynamicCaseOffsets[i] : ((i + 1) / (count + 1))
        );
        return positions
          .map((y, i) => {
            const name: string = rules?.[i]?.name ? String(rules[i].name) : '';
            const nameHtml = name && name.trim().length > 0
              ? `<span class='conditon-node-port-label switch'>${name}</span>`
              : '';
            const idxHtml = `<span class='switch-conditon-node-port-label'>${i + 1}</span>`;
            return `<div class=\"node-port-right\" style=\"top:${y * 100}%\">${idxHtml}${nameHtml}</div>`;
          })
          .join('');
      })()
    : '';

  const ifRightPorts = !isSwitch
    ? [
      portConfig.rightTopPort ? `<div class="node-port-right-top"><span class="conditon-node-port-label">${isLoop ? 'loop' : 'true'}</span></div>` : '',
      portConfig.rightBottomPort ? `<div class="node-port-right-bottom"><span class="conditon-node-port-label">${isLoop ? 'done' : 'false'}</span></div>` : ''
    ].join('')
    : '';

  const isRightPortOnly = portConfig.rightPort && !portConfig.leftPort;
  const mainClass = `node-template ${isRightPortOnly ? 'trigger-node' : ''}`;

  const iconHtml = iconSrc ? `<img src=\"${iconSrc}\" draggable=\"false\" />` : '';
  const nameBarHtml = nodeConfig.displayName ? `<div class=\"node-name-bar\">${nodeConfig.displayName}</div>` : '';

  return `
  <div class=\"node-template-container\">
    <div class=\"${mainClass}\" data-node-id=\"${node.id}\">
      <div class=\"node-hover-toolbar\">
        <button id=\"btn-exec-${node.id}\" title=\"Execute this node\" class=\"node-toolbar-btn e-control e-btn e-lib\"><span class=\"e-btn-icon e-icons e-play\"></span></button>
        <button id=\"btn-edit-${node.id}\" title=\"Edit\" class=\"node-toolbar-btn e-control e-btn e-lib\"><span class=\"e-btn-icon e-icons e-edit\"></span></button>
        <button id=\"btn-del-${node.id}\" title=\"Delete\" class=\"node-toolbar-btn e-control e-btn e-lib\"><span class=\"e-btn-icon e-icons e-trash\"></span></button>
      </div>
      ${leftPort}${rightPort}${switchRightPorts}${ifRightPorts}
      <div class=\"node-img-content\">
        ${iconHtml}
      </div>
    </div>
    ${nameBarHtml}
  </div>`;
}

// Wire up toolbar click events after HTML content is attached to DOM
export function attachNodeTemplateEvents(node: NodeModel, onNodeToolbarAction?: (id: string, action: NodeToolbarAction) => void) {
  if (!node || !node.id) return;
  setTimeout(() => {
    const execBtn = document.getElementById(`btn-exec-${node.id}`);
    const editBtn = document.getElementById(`btn-edit-${node.id}`);
    const delBtn = document.getElementById(`btn-del-${node.id}`);

    const callHandler = (action: NodeToolbarAction) => {
      const handler = onNodeToolbarAction || GLOBAL_NODE_TOOLBAR_HANDLER;
      if (handler) handler(node.id as string, action);
    };

    if (execBtn) execBtn.onclick = (e) => { e.stopPropagation(); callHandler('execute-step'); };
    if (editBtn) editBtn.onclick = (e) => { e.stopPropagation(); callHandler('edit'); };
    if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); callHandler('delete'); };
  }, 0);
}

export function refreshNodeTemplate(
  diagram: DiagramComponent | null,
  nodeId: string,
  onNodeToolbarAction?: (id: string, action: NodeToolbarAction) => void
) {
  if (!diagram) return;
  const node = diagram.getObject(nodeId) as NodeModel | null;
  if (!node) return;
  node.shape = { type: 'HTML', content: buildNodeHtml(node) } as any;
  // Prefer explicit callback; fallback to global
  const handler = onNodeToolbarAction || GLOBAL_NODE_TOOLBAR_HANDLER;
  attachNodeTemplateEvents(node, handler);
}
