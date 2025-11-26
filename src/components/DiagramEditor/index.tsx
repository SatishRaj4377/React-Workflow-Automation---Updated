import React, { useRef, useEffect, useState } from 'react';
import { DiagramComponent, SnapSettingsModel, OverviewComponent, GridlinesModel, Inject, ConnectorModel, NodeModel, DiagramTools, UndoRedo, DataBinding, DiagramContextMenu, NodeConstraints, Keys, KeyModifiers, CommandManagerModel, UserHandleModel, UserHandleEventsArgs, SelectorConstraints, ConnectorConstraints, Snapping, DiagramConstraints, DiagramModel, Connector, ComplexHierarchicalTree, LayoutModel } from '@syncfusion/ej2-react-diagrams';
import { DiagramSettings, NodeConfig, NodePortDirection, NodeToolbarAction } from '../../types';
import { applyStaggerMetadata, getNextStaggeredOffset } from '../../helper/stagger';
import { bringConnectorsToFront, convertMarkdownToHtml, getConnectorCornerRadius, getConnectorType, getFirstSelectedNode, getGridColor, getGridType, getNodeConfig, getPortOffset, getPortSide, getSnapConstraints, getStickyNoteTemplate, initializeNodeDimensions, isConnectorBetweenAgentAndTool, isNodeOutOfViewport, isStickyNote, prepareUserHandlePortData, updateNodeConstraints, shouldShowUserHandleForPort } from '../../helper/utilities';
import { isAgentBottomToToolConnector, computeConnectorLength, adjustUserHandlesForConnectorLength } from '../../helper/utilities/connectorUtils';
import { DIAGRAM_MENU, NODE_MENU } from '../../constants';
import { buildNodeHtml, attachNodeTemplateEvents } from '../../helper/utilities/nodeTemplateUtils';
import './DiagramEditor.css';

interface DiagramEditorProps {
  onAddNode?: () => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onDiagramRef?: (ref: any) => void;
  project?: any;
  onDiagramChange?: (args: any) => void;
  onAddStickyNote?: (position: { x: number; y: number }) => void;
  onUserhandleAddNodeClick?: (node: NodeModel, portId: string) => void;
  onConnectorUserhandleAddNodeClick?: (connector: ConnectorModel) => void;
  isUserHandleAddNodeEnabled?: boolean;
  diagramSettings: DiagramSettings;
  showInitialAddButton?: boolean;
  onInitialAddClick?: () => void;
  onNodeAddedFirstTime?: () => void;
  onCanvasClick?: () => void;
  onAutoAlignNodes: () => void;
}

let isStickyNoteEditing = false;
const GRAY_COLOR = '#9193a2ff';
const HOVER_COLOR = '#ea4335';
const CONNECTOR_STROKEDASH_ARR = "5 3"
const NODE_STROKEDASH_ARR = "10 4"

const DiagramEditor: React.FC<DiagramEditorProps> = ({
  onAddNode,
  onNodeDoubleClick,
  onDiagramRef,
  project,
  onDiagramChange,
  onAddStickyNote,
  onUserhandleAddNodeClick,
  onConnectorUserhandleAddNodeClick,
  isUserHandleAddNodeEnabled,
  diagramSettings,
  showInitialAddButton,
  onInitialAddClick,
  onNodeAddedFirstTime,
  onCanvasClick,
  onAutoAlignNodes
}) => {

  const diagramRef = useRef<DiagramComponent>(null);
  const [previousDiagramTool, setPreviousDiagramTool] = useState<DiagramTools>(DiagramTools.SingleSelect | DiagramTools.MultipleSelect);
  const [isPanning, setIsPanning] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const overviewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [hasFirstNodeAdded, setHasFirstNodeAdded] = useState(false);
  const [zoomPercentage, setZoomPercentage] = useState<number>(100);
  const [showZoomPercentage, setShowZoomPercentage] = useState<boolean>(false);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [previousZoom, setPreviousZoom] = useState<number>(100);
  const [isWorkflowLocked, setIsWorkflowLocked] = useState(false);

  // User handles
  let userHandles: UserHandleModel[] = [
    // Plus handle to insert a node in the middle of a connector
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
      tooltip: {content: "Insert Node"},
      disableNodes: true,
      size: 24,
    },
    // Delete handle for connector
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
      tooltip: {content: "Delete Connector", position: 'TopRight'},
      disableNodes: true,
      size: 25,
    },
  ];
  const firstSelectedNode = getFirstSelectedNode(diagramRef.current);
  const selectedConnector = (diagramRef.current as any)?.selectedItems?.connectors?.[0];

  // If a connector is selected and it's between AI Agent and Tool, hide the insert handle
  if (selectedConnector && isAgentBottomToToolConnector(selectedConnector, diagramRef.current)) {
    userHandles = userHandles.filter((h) => h.name !== 'insertNodeOnConnector');
  }

  // show userhandle only if single node is selected
  if (firstSelectedNode && (diagramRef.current as any).selectedItems.nodes.length === 1) {
    const portBasedUserHandles = generatePortBasedUserHandles(firstSelectedNode, diagramRef.current);
    userHandles.push(...portBasedUserHandles);
    (diagramRef.current as any).selectedItems.userHandles = userHandles;
    (diagramRef.current as any).dataBind();
  } else if (selectedConnector) {
    // Adjust offsets/sizes for connector handles via utility
    const length = computeConnectorLength(selectedConnector);
    userHandles = adjustUserHandlesForConnectorLength(userHandles, length);

    // Apply handles for connector selection (after any filtering)
    (diagramRef.current as any).selectedItems.userHandles = userHandles;
    (diagramRef.current as any).dataBind();
  }

  // Context Menu Items for the diagram
  const contextMenuSettings = {
    show: true,
    showCustomMenuOnly: true,
    items: [
      // Node menu 
      { id: 'editNode', text: 'Edit Node', iconCss: 'e-icons e-edit' },
      { id: 'delete', text: 'Delete', iconCss: 'e-icons e-trash' },
      // Diagram menu
      { text: 'Add Node', id: 'addNode', iconCss: 'e-icons e-plus' },
      { text: 'Auto Align Nodes', id: 'autoAlign', iconCss: 'e-icons e-ai-chat' },
      { text: 'Add Sticky Note', id: 'addSticky', iconCss: 'e-icons e-add-notes' },
      { text: 'Lock Workflow', id: 'lockWorkflow', iconCss: 'e-icons e-lock' },
      { text: 'Select All', id: 'selectAll', iconCss: 'e-icons e-select-all' }
    ]
  };

  // Layout settings for the diagram
  const layoutSettings: LayoutModel = { 
    type: 'ComplexHierarchicalTree',
    orientation: 'LeftToRight',
    horizontalAlignment:'Center',
    verticalAlignment: 'Center',
    horizontalSpacing: 80,
    verticalSpacing: 80,
  };

  // Grid and Snap Settings based on diagramSettings
  const snapSettings: SnapSettingsModel = {
    constraints: getSnapConstraints(diagramSettings),
    gridType: getGridType(diagramSettings),
    horizontalGridlines: { lineColor: getGridColor(diagramSettings) } as GridlinesModel,
    verticalGridlines: { lineColor: getGridColor(diagramSettings) } as GridlinesModel,
    snapObjectDistance: 5,
    snapLineColor: 'var(--secondary-color)',
    snapAngle: 5,
  };

  // Get default styles for nodes
  const getNodeDefaults = (node: NodeModel): NodeModel => {
    if (!node) return node;

    const nodeConfig = getNodeConfig(node);
    
    if (nodeConfig && typeof nodeConfig === "object") {
      // Initialize node dimensions and constraints
      initializeNodeDimensions(node);
      updateNodeConstraints(node);

      // Set up templates and ports
      updateNodeTemplates(setUpStickyNote, node);
      prepareUserHandlePortData(node);

      // Position the node with stagger effect
      updateNodePosition(node, diagramRef);

      // Avoid layout positioning for the tools nodes - we wil position it manually
      if (nodeConfig.category === 'tool'){
        node.excludeFromLayout = true;
      }
    }

    return node;
  };

  // Get default styles for connectors
  const getConnectorDefaults = (obj: ConnectorModel): ConnectorModel => {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    const isConnectedToAIAgentAndTool = isConnectorBetweenAgentAndTool(obj, diagramRef.current);
    obj.type = getConnectorType(diagramSettings);
    obj.cornerRadius = getConnectorCornerRadius(diagramSettings)
    obj.style = {
      strokeColor: GRAY_COLOR,
      strokeDashArray: !isConnectedToAIAgentAndTool ? '' : CONNECTOR_STROKEDASH_ARR,
      strokeWidth: 2,
    };
    obj.targetDecorator = {
      style: {
        fill: GRAY_COLOR,
        strokeColor: GRAY_COLOR,
      }
    };
    return obj;
  };

  // Handle the userhandle click
  const handleUserHandleMouseDown = (args: UserHandleEventsArgs) => {
    const handleName = (args.element as UserHandleModel)?.name || '';

    // Node port based add handle
    if (handleName.startsWith('add-node-from-port-')) {
      const portId = handleName.substring('add-node-from-port-'.length);
      const selectedNode = diagramRef.current?.selectedItems?.nodes?.[0];

      if (selectedNode?.id && portId && onUserhandleAddNodeClick) {
        (diagramRef.current as any).drawingObject = { type: "Straight", sourceID: selectedNode.id, sourcePortID: portId };
        (diagramRef.current as DiagramModel).tool = DiagramTools.DrawOnce;
        onUserhandleAddNodeClick(selectedNode, portId);
      }
      return;
    }

    // Connector: insert node handle
    if (handleName === 'insertNodeOnConnector') {
      const selectedConnector = diagramRef.current?.selectedItems?.connectors?.[0];
      if (selectedConnector && onConnectorUserhandleAddNodeClick) {
        onConnectorUserhandleAddNodeClick(selectedConnector);
      }
      return;
    }

    // Connector: delete handle
    if (args.element && handleName === 'deleteConnector') {
      (diagramRef.current as any).remove();
      return;
    }
  };

  // Hanlde Scrollchange event of diagram to display the current zoom value on overview panel
  const handleScrollChange = (args: any) => {
    if (diagramRef.current) {
      const currentZoom = Math.round((diagramRef.current as any)?.scrollSettings.currentZoom * 100);
      
      // Only show zoom percentage if zoom level changed
      if (currentZoom !== previousZoom) {
        setZoomPercentage(currentZoom);
        setShowZoomPercentage(true);
        setPreviousZoom(currentZoom);
        
        // Clear existing zoom timeout
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        
        // Hide zoom percentage after 2 seconds
        zoomTimeoutRef.current = setTimeout(() => {
          setShowZoomPercentage(false);
        }, 2000);
      }
    }
    
    // Always show overview during scrolling (panning)
    setShowOverview(true);
    
    // Clear existing overview timeout
    if (overviewTimeoutRef.current) {
      clearTimeout(overviewTimeoutRef.current);
    }
    
    // Hide overview after 2 seconds, if showOverviewAlways is enabled in settings
    if (!diagramSettings.showOverviewAlways){
      overviewTimeoutRef.current = setTimeout(() => {
        setShowOverview(false);
      }, 2000);
    }
  };

  const handleMouseEnter = (args: any) => {
    const connector = args?.actualObject;
    if (connector && connector instanceof Connector) {
      connector.style = {
        ...connector.style,
        strokeColor: HOVER_COLOR,
      };
      connector.targetDecorator = {
        ...connector.targetDecorator,
        style: {
          ...connector.targetDecorator?.style,
          fill: HOVER_COLOR,
          strokeColor: HOVER_COLOR,
        },
      };
    }
  };

  const handleMouseLeave = (args: any) => {
    const connector = args?.element;
    if (connector && connector instanceof Connector) {
      setTimeout(() => {
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
      });
    }
  };

  // Handle diagram collection change
  const handleCollectionChange = (args: any) => {
    if (args.type === 'Addition' && args.element) {
      const element = args.element;

      // Handle node addition logic
      if (!element.sourceID) {
        handleNodeAddition(element);
      }

      // Handle connector addition logic
      if (element.sourceID && element.targetID) {
        finalizeConnectorStyle(element);
      } else if (element.sourceID === '' || element.targetID === '') {
        // remove incomplete connector
        setTimeout(() => {
          (diagramRef.current as any)?.remove(element);
        });
      }
    }
  };

  // Handle node addition on the diagram canvas
  const handleNodeAddition = (node: NodeModel) => {
    const diagram = diagramRef.current;
    if (!diagram) return;

    // Attach toolbar actions after direct HTML render (uses global handler)
    attachNodeTemplateEvents(node);

    const isOutOfView = isNodeOutOfViewport(diagram, node);
    const isFirstNode = !hasFirstNodeAdded && diagram.nodes?.length === 1;

    if (isOutOfView) {
      setTimeout(() => {
        diagram.fitToPage({
          mode: 'Page',
          region: 'Content',
          margin: { left: 50, top: 50, right: 50, bottom: 50 },
        });
      }, 100);
    }

    if (isFirstNode) {
      setHasFirstNodeAdded(true);
      if (onNodeAddedFirstTime) onNodeAddedFirstTime();
    }
  };

  // Update the connector style on successfull connection
  const finalizeConnectorStyle = (connector: any) => {
    // Only finalize (update to solid) if fully connected and NOT between agent and tool
    const isBetweenAIAgentAndTool = isConnectorBetweenAgentAndTool(connector, diagramRef.current)
    if (!isBetweenAIAgentAndTool){
      // Update to solid style when connection is completed and NOT between agent and tool
      setTimeout(() => {
        connector.style = {
          ...connector.style,
          strokeDashArray: '', // Remove dotted pattern
          opacity: 1,
        };
        connector.constraints =
          (ConnectorConstraints.Default | ConnectorConstraints.ReadOnly) &
          ~ConnectorConstraints.DragSourceEnd &
          ~ConnectorConstraints.DragTargetEnd &
          ~ConnectorConstraints.Drag;
      });
    }else{
      // update the target deocrator shap to none if between agent and tool
      connector.targetDecorator = {
        shape: 'None',
        ...connector.targetDecorator,
        style: {
          ...connector.targetDecorator?.style,
          fill: GRAY_COLOR,
          strokeColor: GRAY_COLOR,
        },
      };
    }
  };

  const handleDiagramLoaded = ()=> {
    // Hide the initial plus button
    if (onNodeAddedFirstTime) onNodeAddedFirstTime();
  }

  // Removes the disconnected connector
  const removeDisConnectedConnectors = (args: any) => {
    if (!args || args.objectType !== 'Connector') return;
    const connector = args.source;
    // Validate connector object
    if (!connector || typeof connector !== 'object') return;
    // Apply disconnected style early (before 'Completed' state)
    connector.style = {
      strokeColor: GRAY_COLOR,
      strokeDashArray: CONNECTOR_STROKEDASH_ARR,
      strokeWidth: 2,
    };
    if (args.state === 'Completed') {
      const isDisconnected =
        !connector.sourceID || connector.sourceID.trim() === '' ||
        !connector.targetID || connector.targetID.trim() === '';
      if (isDisconnected && diagramRef?.current) {
        setTimeout(() => {
          try {
            (diagramRef.current as any).remove(connector);
          } catch (error) {
            console.error('Failed to remove disconnected connector:', error);
          }
        }, 0);
      }
    }
  };

  // Handle diagram click, 
  const handleClick = (args: any) => {
    const clickedElement = args.element;
    // on userhandle add node process is ongoing, then on clicking on the diagram don't draw connector(reset the tool)
    if (isUserHandleAddNodeEnabled && diagramRef && diagramRef.current){
      diagramRef.current.tool = DiagramTools.Default;
    }

    // If Userhandle was clicked.
    // The onUserHandleMouseDown event handles opening the palette. We stop here to prevent this click from closing it.
    const isCustomUserHandleClick = clickedElement?.name?.startsWith('add-node-from-port-');
    if (isCustomUserHandleClick) {
      return; // Stop here to keep the palette open.
    }
    
    // If the click was not on a port or a custom handle, treat it as a canvas click.
    // This will close the node palette.
    if (onCanvasClick && args.actualObject === undefined) {
      onCanvasClick();
    }
  };

  // Handle diagram double click event
  const handleDoubleClick = (args: any) => {
    if (args && args.source && args.source.id) {
      const nodeId = args.source.id;
      const node = args.source;
      const nodeConfig = (node.addInfo as any)?.nodeConfig as NodeConfig | undefined;
      if (!nodeConfig) return; // Prevent exception if nodeConfig is undefined
      // Handle sticky note double-click
      if (isStickyNote(nodeConfig)) {
        handleStickyNoteEdit(node);
        return;
      }
      // Handle regular node double-click
      if (onNodeDoubleClick) {
        setSelectedNodeIds([nodeId]);
        updateNodeSelection([nodeId]);
        onNodeDoubleClick(nodeId);
      }
    }
  };

  // Handle diagram selection change event
  const handleSelectionChange = (args: any) => {
    if (args && args.newValue && args.newValue.length > 0) {
      const selectedNodeIds = args.newValue.map((item: any) => item.id);
      setSelectedNodeIds(selectedNodeIds);
      updateNodeSelection(selectedNodeIds);
      updateResizeHandleVisibility(selectedNodeIds);
    } else {
      // No selection
      setSelectedNodeIds([]);
      updateNodeSelection(null);
    }
  };

  // Show context menu for nodes / diagram and handle mixed selection
  const handleContextMenuOpen = (args: any) => {
    const diagram = diagramRef.current!;

    const firstSelectedNode = getFirstSelectedNode(diagram);
    
    const selNodes = diagram?.selectedItems?.nodes ?? [];
    const selConns = diagram?.selectedItems?.connectors ?? [];

    const hasNode = selNodes.length > 0;
    const hasConnector = selConns.length > 0;
    const isMixed = hasNode && hasConnector;

    const availableIds: string[] = (args.items ?? [])
      .map((i: any) => i?.id)
      .filter(Boolean);

    // Helper: hide everything except a small allowlist (that is also available)
    const hideAllExcept = (allowIds: string[]) => {
      const allow = new Set(allowIds);
      args.hiddenItems = availableIds.filter((id) => !allow.has(id));
    };

    // Toggle Lock/Unlock label if the item is present
    const lockItem = (args.items || []).find((i: any) => i.id === 'lockWorkflow');
    if (lockItem) lockItem.text = isWorkflowLocked ? 'Unlock Workflow' : 'Lock Workflow';

    // Context menu for the sticky note
    if (firstSelectedNode && isStickyNote((firstSelectedNode?.addInfo as any)?.nodeConfig as NodeConfig)) {
      // Only keep 'delete' if present; else hide everything
      const allow = availableIds.includes('delete') ? ['delete'] : [];
      hideAllExcept(allow);
      return;
    }
    // Mixed selection (nodes + connectors) → show only Delete (if available)
    if (isMixed) {
      hideAllExcept(availableIds.includes('delete') ? ['delete'] : []);
      return;
    }

    // Connectors only → show nothing
    if (hasConnector && !hasNode) {
      hideAllExcept([]); // hide all available
      return;
    }

    // Nodes only → show node menu (edit + delete), but only those present
    if (hasNode) {
      const presentNodeMenu = NODE_MENU.filter((id) => availableIds.includes(id));
      hideAllExcept(presentNodeMenu);
      return;
    }

    // Diagram only → show diagram menu only those present
    const presentDiagramMenu = DIAGRAM_MENU.filter((id) => availableIds.includes(id));
    hideAllExcept(presentDiagramMenu);
  };

  // handle conext menu click event
  const handleContextMenuClick = (args: any) => {
    if (!args || typeof args !== 'object' || !args.item || typeof args.item !== 'object') {
      console.warn('Invalid context menu click arguments');
      return;
    }

    const diagram = diagramRef.current;
    const itemId = args.item.id as string;
    if (!itemId || !diagram) return;

    switch (itemId) {
      // ----- Node items -----
      case 'duplicateNode': {
        diagram.copy();
        diagram.paste();
        break;
      }
      case 'editNode': {
        const firstSelectedNode = getFirstSelectedNode(diagram);
        if (firstSelectedNode && firstSelectedNode.id)
          onNodeDoubleClick(firstSelectedNode.id);
        break;
      }
      case 'delete': {
        diagram.remove();
        break;
      }

      // ----- Diagram items -----
      case 'addNode': {
        if (onAddNode) onAddNode();
        break;
      }
      case 'autoAlign': {
        if (onAutoAlignNodes) onAutoAlignNodes();
        break;
      }
      case 'addSticky': {
        if (onAddStickyNote){
          const position = args.event && typeof args.event === 'object' 
            ? {x: args.event.pageX, y: args.event.pageY, fromMouse: true} : { x: 300, y: 300, fromMouse: false };
          onAddStickyNote(position);
        }
        break;
      }
      case 'lockWorkflow': {
        if (diagramRef.current) {
          const next = !isWorkflowLocked;
          setIsWorkflowLocked(next);
          applyLockState(next);
        }
        break;
      }
      case 'selectAll': {
        diagram.selectAll();
        break;
      }

      default:
        console.warn(`Unknown context menu item: ${itemId}`);
    }
  };

  const applyLockState = (locked: boolean) => {
    const diagram = diagramRef.current;
    if (!diagram) return;

    if (locked) {
      // Clear any selection
      diagram.clearSelection();

      diagram.constraints = diagram.constraints
        & ~DiagramConstraints.UserInteraction
        & ~DiagramConstraints.PageEditable
        & ~DiagramConstraints.UndoRedo;
    } else {
      diagram.constraints = DiagramConstraints.Default;
    }
  };


  // Customize the diagram command manager
  const getCommandManagerSettings = ()=> {
    const commandManager: CommandManagerModel = {
      commands: [
        {
          name: 'spacePan',
          canExecute: () => {
            return diagramRef.current != null && !isPanning && !isStickyNoteEditing;
          },
          execute: () => {
            if (diagramRef.current && !isPanning && !isStickyNoteEditing) {
              setPreviousDiagramTool(diagramRef.current.tool);
              diagramRef.current.tool = DiagramTools.ZoomPan;
              setIsPanning(true);
            }
          },
          gesture: { 
            key: Keys.Space,
            keyModifiers: KeyModifiers.None
          }
        },
        {
          name: 'group',
          canExecute: () => false, // prevent grouping action
          execute: () => {},
          gesture: {
            key: Keys.G,
            keyModifiers: KeyModifiers.Control
          }
        }
      ]
    };
    return commandManager;
  };

  // Set up styles for sticky notes node
  const setUpStickyNote = (stickyNode: NodeModel) => {
    // Implement the markdown editor template for annotations 
    stickyNode.annotations = [
    {
      id: "annotation",
      width: stickyNode.width,
      height: stickyNode.height,
      horizontalAlignment: 'Stretch',
      verticalAlignment: 'Stretch',
      template: diagramRef.current 
          ? getStickyNoteTemplate(diagramRef.current, stickyNode)
          : '<div>Loading sticky note...</div>'
    }]

    // Add delete button click handler
    setTimeout(() => {
      const deleteBtn = document.getElementById(`delete-${stickyNode.id}`);
      if (deleteBtn && diagramRef.current) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          diagramRef.current?.remove(stickyNode);
        });
      }
    }, 0);

    // Set node minimum dimensions
    stickyNode.minWidth = 160;
    stickyNode.minHeight = 80;

    // setup sticky node style
    stickyNode.style = {
      fill: "var(--sticky-note-bg-color)",
      strokeColor: "var(--sticky-note-stroke-color)",
      strokeWidth: 2,
      strokeDashArray: NODE_STROKEDASH_ARR,
      opacity: .7
    }
    stickyNode.shape= { cornerRadius: 15 };
    
    // Preserve existing width/height if they exist (for loaded nodes)
    if (!stickyNode.width || stickyNode.width < 160) {
      stickyNode.width = 200;
    }
    if (!stickyNode.height || stickyNode.height < 80) {
      stickyNode.height = 120;
    }
    
    // render the sticky note behind all the nodes
    setTimeout(()=> {
      setStickyZIndex(stickyNode)
    })
  }

  // Updates the z-index to negative for the sticky node element
  function setStickyZIndex(stickyNode: NodeModel) {
    const zIndex = -10000;

    if (stickyNode.id && diagramRef.current){
      // update the z-index of sticky node in dom
      const stikcyNodeElement = document.getElementById(`${stickyNode.id}_annotation_html_element`);
      if (stikcyNodeElement) stikcyNodeElement.style.zIndex = zIndex.toString();

      // update z-order of connectors - to avoid going behind the sticky note
      bringConnectorsToFront(diagramRef.current)
    }
  }

  // Update the custom selector style for node templates
  const updateNodeSelection = (nodeIds: string[] | null) => {
    // Remove selection from all node templates
    const allNodeTemplates = document.querySelectorAll('.node-template, .sticky-note-container');
    allNodeTemplates.forEach(template => {
      template.classList.remove('selected');
    });

    // Add selection to all specified nodes
    if (nodeIds && nodeIds.length > 0) {
      nodeIds.forEach(nodeId => {
        const selectedTemplate = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (selectedTemplate) {
          selectedTemplate.classList.add('selected');
        }
      });
    }
  };

  // Control the diagram selector resize handle visiblity
  const updateResizeHandleVisibility = (nodeIds: string[]) => {
    if (!diagramRef.current) return;
    // show resize handle for the sticky nodes only
    if (nodeIds.length === 1 && nodeIds[0].startsWith('sticky-')) {
      diagramRef.current.selectedItems.constraints = SelectorConstraints.All & ~SelectorConstraints.ToolTip ;
    } 
    // Hide resize handles for multi-selection or non-sticky nodes
    else {
      diagramRef.current.selectedItems.constraints = 
        SelectorConstraints.All & ~SelectorConstraints.ToolTip & ~SelectorConstraints.ResizeAll;
    }
  };

  // Cleanup runs on unmount
  useEffect(() => {
    return () => {
      // Clear the timeout for hiding the overview panel.
      if (overviewTimeoutRef.current) {
        clearTimeout(overviewTimeoutRef.current);
      }
      // Clear the timeout for hiding the zoom percentage display.
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, []);


  // Update useEffect to handle selection updates when nodes change
  useEffect(() => {
    if (selectedNodeIds.length > 0) {
      setTimeout(() => {
        updateNodeSelection(selectedNodeIds);
      }, 100);
    }
  }, [selectedNodeIds]);

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space' && isPanning) {
        event.preventDefault();
        if (diagramRef.current) {
          diagramRef.current.tool = previousDiagramTool;
          setIsPanning(false);
        }
      }
    };

    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPanning, previousDiagramTool]);

  // Load saved diagram data when component mounts and diagramRef is available
  useEffect(() => {
    if (diagramRef.current && project?.workflowData?.diagramString) {
      diagramRef.current.loadDiagram(project.workflowData.diagramString);
      if (!hasFirstNodeAdded) {
        setHasFirstNodeAdded(true);
        if (onNodeAddedFirstTime) onNodeAddedFirstTime();
      }
      if (project.id.startsWith("template")){
        (diagramRef.current as any).reset();
        (diagramRef.current as any).fitToPage();
      }
    }
  }, [diagramRef.current, project?.workflowData?.diagramString]);

  // Update diagram when there is any change in the settings dialog
  useEffect(() => {
    if (diagramRef.current && diagramSettings) {
      const diagram = diagramRef.current;
      
      // Update the Grid and Snap Settings 
      const gridType = getGridType(diagramSettings);
      const gridColor = getGridColor(diagramSettings);
      const constraints = getSnapConstraints(diagramSettings);
      diagram.snapSettings = {
        ...diagram.snapSettings,
        gridType,
        constraints,
        horizontalGridlines: { ...diagram.snapSettings.horizontalGridlines, lineColor: gridColor },
        verticalGridlines: { ...diagram.snapSettings.verticalGridlines, lineColor: gridColor }
      };
      
      // Update Connector types and corner radius
      if (Array.isArray(diagram.connectors)) {
        diagram.connectors.forEach((connector: ConnectorModel) => {
          connector.type = getConnectorType(diagramSettings);
          connector.cornerRadius = getConnectorCornerRadius(diagramSettings);
        });
      }

      // Overview "always show"
      if (diagramSettings.showOverviewAlways) {
        setShowOverview(true);
      }

    }
  }, [diagramSettings]);

  // Pass diagram ref to parent component
  useEffect(() => {
    if (diagramRef.current && onDiagramRef) {
      onDiagramRef(diagramRef.current);
    }
  }, [diagramRef.current, onDiagramRef]);


  return (
    <div className="diagram-editor-container">
      {/* Big Center Plus Button  */}
      {showInitialAddButton && (
        <div className="center-initial-plus-btn">
          <button
            className="initial-plus-btn-actual"
            type="button"
            onClick={onInitialAddClick}
          >
            <span className="initial-plus-icon">+</span>
          </button>
          <div className="initial-plus-label">Add a trigger</div>
        </div>
      )}
      <DiagramComponent
        id="workflow-diagram"
        ref={diagramRef}
        width="100%"
        height="100%"
        nodes={[]}
        connectors={[]}
        layout={layoutSettings}
        getNodeDefaults={getNodeDefaults}
        getConnectorDefaults={getConnectorDefaults}
        elementDraw={removeDisConnectedConnectors}
        collectionChange={handleCollectionChange}
        snapSettings={snapSettings}
        scrollSettings={{scrollLimit: "Infinity"}}
        contextMenuSettings={contextMenuSettings}
        scrollChange={handleScrollChange}
        mouseEnter={handleMouseEnter}
        mouseLeave={handleMouseLeave}
        contextMenuClick={handleContextMenuClick}
        contextMenuOpen={handleContextMenuOpen}
        click={handleClick}
        doubleClick={handleDoubleClick}
        selectionChange={handleSelectionChange}
        commandManager={getCommandManagerSettings()}
        selectedItems={{ userHandles: userHandles  }}
        onUserHandleMouseDown={ handleUserHandleMouseDown }
        historyChange={onDiagramChange}
        loaded={handleDiagramLoaded}
      >
        <Inject services={[UndoRedo, DataBinding, DiagramContextMenu, Snapping, ComplexHierarchicalTree  ]} />
      </DiagramComponent>

      {/* Overview Panel with integrated zoom percentage */}
      <div className='diagram-overview-container'
        style={{
          opacity: (showOverview && diagramSettings?.showOverview) ? 1 : 0,
          visibility: (showOverview && diagramSettings?.showOverview) ? 'visible' : 'hidden',
        }}
      >
        {showZoomPercentage && (
          <div className="zoom-percentage-display">
            {zoomPercentage}%
          </div>
        )}
        <OverviewComponent
          id="overview"
          sourceID="workflow-diagram"
          width="100%"
          height="100%"
        />
      </div>
    </div>
  );
};

export default DiagramEditor;

// Generate Userhandles based on the `OutConnect` ports
function generatePortBasedUserHandles(node: NodeModel, diagram?: DiagramComponent | null): UserHandleModel[] {
  // All out-connectable ports prepared during node initialization
  const portHandlesInfo: Array<{ portId: string; direction: NodePortDirection; side?: any; offset?: number }> = (node.addInfo as any)?.userHandlesAtPorts ?? [];

  const availablePorts = portHandlesInfo.filter(({ portId }) => shouldShowUserHandleForPort(node, portId, diagram));

  return availablePorts.map(({ portId, direction, side, offset }) => ({
    name: `add-node-from-port-${portId}`,
    content: `
        <g class="add-handle">
          <rect class="bg" x="1" y="1" width="14" height="14" rx="3" ry="3" fill="${GRAY_COLOR}"/>
          <path class="plus" d="M8 5 V11 M5 8 H11" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
          <style>
            .add-handle { cursor: pointer; }
            .add-handle:hover .bg { fill: var(--accent-color); }
          </style>
        </g>
    `,
    side: side ?? getPortSide(direction),
    offset: offset ?? getPortOffset(direction),
    disableConnectors: true,
    size: 22,
    visible: true,
    tooltip: {content: "Add Node", position: 'RightCenter'}
  }));
}

// Set position for nodes, and apply the staggering effect to avoid overlapping
function updateNodePosition(obj: NodeModel, diagramRef: React.RefObject<DiagramComponent | null>) {
  if (!obj.offsetX || obj.offsetX === 0 || !obj.offsetY || obj.offsetY === 0) {
    const diagram = diagramRef.current as DiagramComponent;
    const baseX = diagram?.scrollSettings?.viewPortWidth != null
      ? diagram.scrollSettings.viewPortWidth / 3
      : 300;
    const baseY = diagram?.scrollSettings?.viewPortHeight != null
      ? diagram.scrollSettings.viewPortHeight / 4
      : 200;

    // Use stagger helper to compute next offset to avoid overlapping of nodes
    const { x, y, index } = getNextStaggeredOffset(diagram, baseX, baseY, {
      group: 'paletteNode',
      strategy: 'grid',
      stepX: 80 * 2, // add space of node width horizontally
      stepY: 80 * 2, // add space of node height vertically
      cols: 4,
      usePersistentIndex: true
    });

    obj.offsetX = x;
    obj.offsetY = y;

    // persist metadata so future calls continue the sequence
    applyStaggerMetadata(obj, 'paletteNode', index);
  }
}

// Sets the template for nodes
function updateNodeTemplates(
  setUpStickyNote: (stickyNode: NodeModel) => void, 
  node: NodeModel
) {
  const nodeConfig = (node.addInfo as any)?.nodeConfig as NodeConfig;
  if (nodeConfig && isStickyNote(nodeConfig)) {
    // For sticky notes render annotation template
    setUpStickyNote(node);
  }
  else {
    // Set direct HTML template for all other nodes
    node.shape = {
      type: 'HTML',
      content: buildNodeHtml(node)
    };

    // After DOM mounts, wire toolbar actions
    setTimeout(() => attachNodeTemplateEvents(node), 0);
  }
}

// Handle sticky note editing
const handleStickyNoteEdit = (node: NodeModel) => {
  const nodeConfig = (node.addInfo as any)?.nodeConfig as NodeConfig;
  if (!nodeConfig || !isStickyNote(nodeConfig)) return;
  
  const preview = document.getElementById(`preview-${node.id}`);
  const editor = document.getElementById(`editor-${node.id}`) as HTMLTextAreaElement;
  const storedMarkdown = (node.addInfo as any)?.markdown || 'Double-click to edit\n\nYou can use **bold**, *italic*, `code`, and\n# Headers\n- Lists';

  if (preview && editor) {
    node.constraints = NodeConstraints.None;
    // Switch to edit mode
    preview.style.display = 'none';
    editor.style.display = 'block';
    editor.value = storedMarkdown;
    editor.focus();
    
    isStickyNoteEditing = true;

    // Prevent key bubbling for arrows, space, delete, etc.
    const keyDownBlocker = (e: KeyboardEvent) => {
      e.stopPropagation();
      // Prevent diagram actions for navigation, space, etc.
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ","Spacebar", "Delete", "Backspace", "Tab"].includes(e.key)
      ) {
        // Only block propagation so diagram/diagram shortcuts do NOT fire
        e.stopPropagation();
      }
    };
    editor.addEventListener('keydown', keyDownBlocker);

    // Handle blur event to save and switch back to preview
    const handleBlur = () => {
      const markdownContent = editor.value;
      const htmlContent = convertMarkdownToHtml(markdownContent);
      
      // Update preview content
      preview.innerHTML = htmlContent;
      
      // Switch back to preview mode
      editor.style.display = 'none';
      preview.style.display = 'block';
      
      // Save markdown content to node data
      if (!node.addInfo) node.addInfo = {};
      (node.addInfo as any).markdown = markdownContent;
      node.constraints =  
        NodeConstraints.Default &
        ~NodeConstraints.Rotate &
        ~NodeConstraints.InConnect &
        ~NodeConstraints.OutConnect;
      
      // Remove event listener
      editor.removeEventListener('blur', handleBlur);
      isStickyNoteEditing = false;
    };
    

    // Add blur event listener
    editor.addEventListener('blur', handleBlur);
    
    // Handle Escape key to cancel editing
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        editor.blur();
        editor.removeEventListener('keydown', handleKeyDown);
      }
    };
    
    editor.addEventListener('keydown', handleKeyDown);
  }
};
