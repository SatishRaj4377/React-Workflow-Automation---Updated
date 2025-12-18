import React, { useRef, useEffect, useState, useMemo } from 'react';
import { DiagramComponent, SnapSettingsModel, OverviewComponent, GridlinesModel, Inject, ConnectorModel, NodeModel, DiagramTools, UndoRedo, DataBinding, DiagramContextMenu, Keys, KeyModifiers, CommandManagerModel, UserHandleModel, UserHandleEventsArgs, Snapping, DiagramConstraints, DiagramModel, Connector, ComplexHierarchicalTree, LayoutModel, IScrollChangeEventArgs, IMouseEventArgs, ICollectionChangeEventArgs, IElementDrawEventArgs, IDoubleClickEventArgs, ISelectionChangeEventArgs } from '@syncfusion/ej2-react-diagrams';
import { DiagramSettings, NodeConfig } from '../../types';
import { getConnectorCornerRadius, getConnectorType, getFirstSelectedNode, getGridColor, getGridType, getNodeConfig,  getSnapConstraints, initializeNodeDimensions, isNodeOutOfViewport, isStickyNote, prepareUserHandlePortData, updateNodeConstraints, computeConnectorLength, adjustUserHandlesForConnectorLength, attachNodeTemplateEvents, buildUserHandles, generatePortBasedUserHandles, updateNodePosition, updateNodeTemplates, updateNodeSelection, updateResizeHandleVisibility } from '../../utilities';
import { finalizeConnectorStyle, applyDisconnectedConnectorStyle, removeDisconnectedConnectorIfInvalid, applyConnectorHoverStyle, resetConnectorToDefaultStyle } from '../../utilities/connectorUtils';
import { handleStickyNoteEditMode, initializeStickyNote } from '../../utilities/stickyNoteUtils';
import { filterContextMenuItems, getAvailableContextMenuIds } from '../../utilities/contextMenuUtils';
import { IconRegistry } from '../../assets/icons';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import './DiagramEditor.css';

interface DiagramEditorProps {
  onAddNode?: () => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onDiagramRef?: (ref: any) => void;
  project?: any;
  onDiagramChange?: () => void;
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

// ============================================================================
// Constants
// ============================================================================

const GRAY_COLOR = '#9193a2ff';
const HOVER_COLOR = 'var(--accent-color)';

// ============================================================================
// Main Component
// ============================================================================

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
  onAutoAlignNodes,
}) => {
  // ========================================================================
  // Diagram Reference
  // ========================================================================

  const diagramRef = useRef<DiagramComponent>(null);

  // ========================================================================
  // State Management
  // ========================================================================

  // Panning and zoom state
  const [previousDiagramTool, setPreviousDiagramTool] = useState<DiagramTools>(
    DiagramTools.SingleSelect | DiagramTools.MultipleSelect
  );
  const [isPanning, setIsPanning] = useState(false);
  const [zoomPercentage, setZoomPercentage] = useState<number>(100);
  const [previousZoom, setPreviousZoom] = useState<number>(100);

  // Overview and UI visibility
  const [showOverview, setShowOverview] = useState(false);
  const [showZoomPercentage, setShowZoomPercentage] = useState<boolean>(false);

  // Node and workflow state
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [hasFirstNodeAdded, setHasFirstNodeAdded] = useState(false);
  const [isWorkflowLocked, setIsWorkflowLocked] = useState(false);

  // Timeout refs for cleanup
  const overviewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showLockHint, setShowLockHint] = useState(false);

  // ========================================================================
  // Diagram Configuration
  // ========================================================================

  // Base user handles; specific selection-based adjustments are applied in an effect
  const baseUserHandles: UserHandleModel[] = useMemo(() => buildUserHandles(), []);

  // Context menu configuration
  const contextMenuSettings = useMemo(() => ({
    show: true,
    showCustomMenuOnly: true,
    items: [
      { id: 'editNode', text: 'Edit Node', iconCss: 'e-icons e-edit' },
      { id: 'delete', text: 'Delete', iconCss: 'e-icons e-trash' },
      { text: 'Add Node', id: 'addNode', iconCss: 'e-icons e-plus' },
      { text: 'Auto Align Nodes', id: 'autoAlign', iconCss: 'e-icons e-ai-chat' },
      { text: 'Add Sticky Note', id: 'addSticky', iconCss: 'e-icons e-add-notes' },
      { text: 'Lock Workflow', id: 'lockWorkflow', iconCss: 'e-icons e-lock' },
      { text: 'Select All', id: 'selectAll', iconCss: 'e-icons e-select-all' },
    ],
  }), []);

  // Layout configuration for hierarchical arrangement
  const layoutSettings: LayoutModel = useMemo(() => ({
    type: 'ComplexHierarchicalTree',
    orientation: 'LeftToRight',
    horizontalAlignment: 'Center',
    verticalAlignment: 'Center',
    horizontalSpacing: 80,
    verticalSpacing: 80,
  }), []);

  // Grid and snap configuration based on diagram settings
  const snapSettings: SnapSettingsModel = useMemo(() => ({
    constraints: getSnapConstraints(diagramSettings),
    gridType: getGridType(diagramSettings),
    horizontalGridlines: { lineColor: getGridColor(diagramSettings) } as GridlinesModel,
    verticalGridlines: { lineColor: getGridColor(diagramSettings) } as GridlinesModel,
    snapObjectDistance: 5,
    snapLineColor: 'var(--secondary-color)',
    snapAngle: 5,
  }), [diagramSettings]);

  // ========================================================================
  // Node and Connector Defaults
  // ========================================================================

  // Configure default styling and behavior for new nodes
  const getNodeDefaults = (node: NodeModel): NodeModel => {
    if (!node) return node;

    const nodeConfig = getNodeConfig(node);

    if (nodeConfig && typeof nodeConfig === 'object') {
      // Initialize node structure
      initializeNodeDimensions(node);
      updateNodeConstraints(node);
      updateNodeTemplates(node, diagramRef);
      prepareUserHandlePortData(node);
      updateNodePosition(node, diagramRef);
    }

    return node;
  };

  // Configure default styling and behavior for new connectors
  const getConnectorDefaults = (obj: ConnectorModel): ConnectorModel => {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    obj.type = getConnectorType(diagramSettings);
    obj.cornerRadius = getConnectorCornerRadius(diagramSettings);
    obj.style = {
      strokeColor: GRAY_COLOR,
      strokeWidth: 2,
    };
    obj.targetDecorator = {
      style: {
        fill: GRAY_COLOR,
        strokeColor: GRAY_COLOR,
      },
    };

    return obj;
  };

  // ========================================================================
  // User Handle Events
  // ========================================================================

  // Recompute and apply user handles based on current selection and diagram state
  const refreshSelectedUserHandles = () => {
    const diagram = diagramRef.current;
    if (!diagram) return;

    let handles: UserHandleModel[] = buildUserHandles();
    const firstNode = getFirstSelectedNode(diagram);
    const selectedConnector = diagram.selectedItems?.connectors?.[0];

    if (firstNode && diagram.selectedItems.nodes.length === 1) {
      const portHandles = generatePortBasedUserHandles(firstNode, diagram);
      handles.push(...portHandles);
    } else if (selectedConnector) {
      const length = computeConnectorLength(selectedConnector);
      handles = adjustUserHandlesForConnectorLength(handles, length);
    }

    diagram.selectedItems.userHandles = handles;
    diagram.dataBind();
  };

  // Handle user interactions with custom handles (add node, delete connector, etc.)
  const handleUserHandleMouseDown = (args: UserHandleEventsArgs) => {
    const handleName = (args.element as UserHandleModel)?.name || '';

    // Node port add handle - initiate node creation from port
    if (handleName.startsWith('add-node-from-port-')) {
      const portId = handleName.substring('add-node-from-port-'.length);
      const selectedNode = diagramRef.current?.selectedItems?.nodes?.[0];

      if (selectedNode?.id && portId && onUserhandleAddNodeClick) {
        (diagramRef.current as any).drawingObject = {
          type: 'Straight',
          sourceID: selectedNode.id,
          sourcePortID: portId,
        };
        (diagramRef.current as DiagramModel).tool = DiagramTools.DrawOnce;
        onUserhandleAddNodeClick(selectedNode, portId);
      }
      return;
    }

    // Connector insert node handle
    if (handleName === 'insertNodeOnConnector') {
      const selectedConnector = diagramRef.current?.selectedItems?.connectors?.[0];
      if (selectedConnector && onConnectorUserhandleAddNodeClick) {
        onConnectorUserhandleAddNodeClick(selectedConnector);
      }
      return;
    }

    // Connector delete handle
    if (args.element && handleName === 'deleteConnector') {
      (diagramRef.current as any).remove();
      return;
    }
  };

  // ========================================================================
  // Scroll and Zoom Events
  // ========================================================================

  // Handle scroll/zoom changes - update overview and zoom display
  const handleScrollChange = (_args: IScrollChangeEventArgs) => {
    if (diagramRef.current) {
      const currentZoom = Math.round(diagramRef.current.scrollSettings.currentZoom * 100);

      // Update zoom percentage if changed
      if (currentZoom !== previousZoom) {
        setZoomPercentage(currentZoom);
        setShowZoomPercentage(true);
        setPreviousZoom(currentZoom);

        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }

        zoomTimeoutRef.current = setTimeout(() => {
          setShowZoomPercentage(false);
        }, 2000);
      }
    }

    // Show overview during pan
    setShowOverview(true);

    if (overviewTimeoutRef.current) {
      clearTimeout(overviewTimeoutRef.current);
    }

    // Auto-hide overview unless always-on setting is enabled
    if (!diagramSettings.showOverviewAlways) {
      overviewTimeoutRef.current = setTimeout(() => {
        setShowOverview(false);
      }, 2000);
    }
  };

  // ========================================================================
  // Connector Styling Events
  // ========================================================================

  // Apply hover styling to connectors
  const handleMouseEnter = (args: IMouseEventArgs) => {
    const connector = (args as any)?.actualObject;
    if (connector && connector instanceof Connector) {
      applyConnectorHoverStyle(connector, HOVER_COLOR);
    }
  };

  // Reset connector styling on mouse leave
  const handleMouseLeave = (args: IMouseEventArgs) => {
    const connector = (args as any)?.element;
    if (connector && connector instanceof Connector) {
      resetConnectorToDefaultStyle(connector);
    }
  };

  // ========================================================================
  // Collection Change Events (Node/Connector Addition)
  // ========================================================================

  // Handle addition of nodes and connectors to the diagram
  const handleCollectionChange = (args: ICollectionChangeEventArgs) => {
    if (args.type === 'Addition' && (args as any).element) {
      const element = (args as any).element as any;

      // Node addition
      if (!element.sourceID) {
        handleNodeAddition(element);
      }

      // Connector draw completion and Addition
      if (element.sourceID && element.targetID) {
        finalizeConnectorStyle(element);
      } else if (element.sourceID === '' || element.targetID === '') {
        // Remove incomplete connector
        setTimeout(() => {
          (diagramRef.current as any)?.remove(element);
        });
      }

      // After any addition, refresh user handles to reflect new connection state
      // (e.g., hide port-based add handles once a port becomes connected)
      setTimeout(() => refreshSelectedUserHandles());
    }
  };

  // Process newly added node - attach handlers, fit to view, etc.
  const handleNodeAddition = (node: NodeModel) => {
    const diagram = diagramRef.current;
    if (!diagram) return;

    // Re-apply sticky note template on addition
    const nodeConfig = getNodeConfig(node);
    if (nodeConfig && isStickyNote(nodeConfig)) {
      initializeStickyNote(node, diagramRef);
    } else {
      // Attach event handlers to non-sticky node templates
      attachNodeTemplateEvents(node);
    }

    const isOutOfView = isNodeOutOfViewport(diagram, node);
    const isFirstNode = !hasFirstNodeAdded && diagram.nodes?.length === 1;

    // Auto-fit view if node is outside viewport
    if (isOutOfView) {
      setTimeout(() => {
        diagram.fitToPage({
          mode: 'Page',
          region: 'Content',
          margin: { left: 50, top: 50, right: 50, bottom: 50 },
        });
      }, 100);
    }

    // Trigger callback for first node addition
    if (isFirstNode) {
      setHasFirstNodeAdded(true);
      if (onNodeAddedFirstTime) onNodeAddedFirstTime();
    }
  };

  // Handle drawing event - remove incomplete connectors
  const handleElementDraw = (args: IElementDrawEventArgs) => {
    if (!args || (args as any).objectType !== 'Connector') return;

    const connector = (args as any).source as any;
    if (!connector || typeof connector !== 'object') return;

    // Apply dotted styling for disconnected connector
    applyDisconnectedConnectorStyle(connector);

    // Remove connector if still disconnected after draw complete
    if ((args as any).state === 'Completed') {
      removeDisconnectedConnectorIfInvalid(connector, diagramRef);
      // Refresh handles since connection state may have changed after draw completes
      setTimeout(() => refreshSelectedUserHandles());
    }
  };

  // ========================================================================
  // Click and Selection Events
  // ========================================================================

  // Handle diagram canvas clicks
  const handleClick = (args: IMouseEventArgs) => {
    const clickedElement = (args as any).element;

    // Reset drawing tool if userhandle mode active
    if (isUserHandleAddNodeEnabled && diagramRef?.current) {
      diagramRef.current.tool = DiagramTools.Default;
    }

    // Prevent closing palette on userhandle click
    const isCustomUserHandleClick = clickedElement?.name?.startsWith('add-node-from-port-');
    if (isCustomUserHandleClick) {
      return;
    }

    // Canvas click - close palettes
    if (onCanvasClick && (args as any).actualObject === undefined) {
      onCanvasClick();
    }
  };

  // Handle double-click on nodes
  const handleDoubleClick = (args: IDoubleClickEventArgs) => {
    const src: any = (args as any)?.source;
    if (!src?.id) return;

    const nodeId = src.id as string;
    const node = src as NodeModel;
    const nodeConfig = (node.addInfo as any)?.nodeConfig as NodeConfig | undefined;

    if (!nodeConfig) return;

    // Sticky note edit mode initialize
    if (isStickyNote(nodeConfig)) {
      handleStickyNoteEditMode(node);
      return;
    }

    // Regular node edit mode initialize
    if (onNodeDoubleClick) {
      setSelectedNodeIds([nodeId]);
      updateNodeSelection([nodeId]);
      onNodeDoubleClick(nodeId);
    }
  };

  // Handle selection change - update selected nodes for custom selection style
 const handleSelectionChange = (args: ISelectionChangeEventArgs) => {
    // Prevent any selection when workflow is locked
    if (isWorkflowLocked) {
      args.cancel = true as any;
      if (diagramRef.current) {
        diagramRef.current.clearSelection();
      }
      return;
    }

    if ((args as any)?.newValue && (args as any).newValue.length > 0) {
      const selectedIds = (args as any).newValue.map((item: any) => item.id as string);
      setSelectedNodeIds(selectedIds);

      updateNodeSelection(selectedIds);
      updateResizeHandleVisibility(selectedIds, diagramRef);
    } else {
      setSelectedNodeIds([]);
      updateNodeSelection(null);
    }
  };

  // ========================================================================
  // Context Menu Events
  // ========================================================================

  // Prepare context menu based on selection
  const handleContextMenuOpen = (args: any) => {
    const diagram = diagramRef.current!;
    const firstNode = getFirstSelectedNode(diagram);

    const selectedNodes = diagram?.selectedItems?.nodes ?? [];
    const selectedConnectors = diagram?.selectedItems?.connectors ?? [];

    const hasNode = selectedNodes.length > 0;
    const hasConnector = selectedConnectors.length > 0;
    const nodeIsStickyNote = firstNode && isStickyNote((firstNode?.addInfo as any)?.nodeConfig);

    const availableIds = getAvailableContextMenuIds(args.items);

    filterContextMenuItems(args, hasNode, hasConnector, !!nodeIsStickyNote, isWorkflowLocked, availableIds);
  };

  // Handle context menu item selection
  const handleContextMenuClick = (args: any) => {
    if (!(args as any)?.item?.id) return;

    const itemId = (args as any).item.id as string;
    const diagram = diagramRef.current;

    if (!diagram) return;

    switch (itemId) {
      case 'editNode': {
        const firstNode = getFirstSelectedNode(diagram);
        if (firstNode?.id) onNodeDoubleClick(firstNode.id);
        break;
      }

      case 'delete': {
        diagram.remove();
        break;
      }

      case 'addNode': {
        onAddNode?.();
        break;
      }

      case 'autoAlign': {
        onAutoAlignNodes?.();
        break;
      }

      case 'addSticky': {
        if (onAddStickyNote) {
          const position =
            (args as any).event && typeof (args as any).event === 'object'
              ? { x: (args as any).event.pageX, y: (args as any).event.pageY, fromMouse: true }
              : { x: 300, y: 300, fromMouse: false };
          onAddStickyNote(position);
        }
        break;
      }

      case 'lockWorkflow': {
        const next = !isWorkflowLocked;
        setIsWorkflowLocked(next);
        applyWorkflowLock(next);
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

  // Apply or remove workflow diagram lock state
  const applyWorkflowLock = (locked: boolean) => {
    const diagram = diagramRef.current;
    if (!diagram) return;

    if (locked) {
      diagram.clearSelection();
      diagram.constraints =
        diagram.constraints &
        ~DiagramConstraints.UserInteraction &
        ~DiagramConstraints.PageEditable &
        ~DiagramConstraints.UndoRedo;
    } else {
      diagram.constraints = DiagramConstraints.Default;
    }

    // Broadcast lock state for other UI
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('workflow-lock-changed', { detail: { locked } }));
      } catch {}
    }
  };

  // Subtle nudge to draw attention to the lock button when user interacts
  const nudgeLockIndicator = () => {
    if (!isWorkflowLocked) return;
    // Restart animation on every interaction by toggling the class
    setShowLockHint(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShowLockHint(true));
    });
  };

  // ========================================================================
  // Diagram Loaded
  // ========================================================================

  // Handle diagram loaded event
  const handleDiagramLoaded = () => {
    // Hide showing plus button initially if saved diagram file is loaded
    onNodeAddedFirstTime?.();
  };

  // ========================================================================
  // Command Manager
  // ========================================================================

  // Configure keyboard shortcuts and custom commands
  const getCommandManagerSettings = (): CommandManagerModel => {
    return {
      commands: [
        {
          name: 'spacePan',
          canExecute: () => {
            return diagramRef.current != null && !isPanning;
          },
          execute: () => {
            if (diagramRef.current && !isPanning) {
              setPreviousDiagramTool(diagramRef.current.tool);
              diagramRef.current.tool = DiagramTools.ZoomPan;
              setIsPanning(true);
            }
          },
          gesture: {
            key: Keys.Space,
            keyModifiers: KeyModifiers.None,
          },
        },
        {
          name: 'group',
          canExecute: () => false, // Disable grouping
          execute: () => {},
          gesture: {
            key: Keys.G,
            keyModifiers: KeyModifiers.Control,
          },
        },
      ],
    };
  };

  // ========================================================================
  // Effects - Lifecycle & Data Management
  // ========================================================================

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (overviewTimeoutRef.current) clearTimeout(overviewTimeoutRef.current);
      if (zoomTimeoutRef.current) clearTimeout(zoomTimeoutRef.current);
    };
  }, []);

  // Update node selection styling
  useEffect(() => {
    if (selectedNodeIds.length > 0) {
      setTimeout(() => {
        updateNodeSelection(selectedNodeIds);
      }, 100);
    }
  }, [selectedNodeIds]);

  // Apply selection-based user handle updates outside of render
  useEffect(() => {
    refreshSelectedUserHandles();
  }, [selectedNodeIds]);

  // Handle space key release for pan mode exit
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
    return () => document.removeEventListener('keyup', handleKeyUp);
  }, [isPanning, previousDiagramTool]);

  // Load saved diagram on mount
  useEffect(() => {
    const diagram = diagramRef.current;
    if (diagram && project?.workflowData?.diagramString) {
      diagram.loadDiagram(project.workflowData.diagramString);

      if (!hasFirstNodeAdded) {
        setHasFirstNodeAdded(true);
        onNodeAddedFirstTime?.();
      }

      // Reset and fit template diagrams
      if ((project as any).isTemplate) {
        (diagram as any).reset();
        (diagram as any).fitToPage();
      }

      // Apply lock state if present in project data
      try {
        const locked = project?.workflowData?.locked;
        if (locked) {
          setIsWorkflowLocked(true);
          applyWorkflowLock(true);
        } else {
          if (typeof window !== 'undefined') {
            try { window.dispatchEvent(new CustomEvent('workflow-lock-changed', { detail: { locked: false } })); } catch {}
          }
        }
      } catch {}
    }
  }, [diagramRef.current, project?.workflowData?.diagramString]);

  // Update diagram when settings change
  useEffect(() => {
    if (!diagramRef.current || !diagramSettings) return;

    const diagram = diagramRef.current;

    // Update grid and snap settings
    const gridType = getGridType(diagramSettings);
    const gridColor = getGridColor(diagramSettings);
    const constraints = getSnapConstraints(diagramSettings);

    diagram.snapSettings = {
      ...diagram.snapSettings,
      gridType,
      constraints,
      horizontalGridlines: { ...diagram.snapSettings.horizontalGridlines, lineColor: gridColor },
      verticalGridlines: { ...diagram.snapSettings.verticalGridlines, lineColor: gridColor },
    };

    // Update all connectors
    if (Array.isArray(diagram.connectors)) {
      diagram.connectors.forEach((connector: ConnectorModel) => {
        connector.type = getConnectorType(diagramSettings);
        connector.cornerRadius = getConnectorCornerRadius(diagramSettings);
      });
    }

    // Show overview if always-on setting enabled
    if (diagramSettings.showOverviewAlways) {
      setShowOverview(true);
    }
  }, [diagramSettings]);

  // Pass diagram ref to parent
  useEffect(() => {
    if (diagramRef.current && onDiagramRef) {
      onDiagramRef(diagramRef.current);
    }
  }, [onDiagramRef]);

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div
      className={`diagram-editor-container${isWorkflowLocked ? ' workflow-locked' : ''}`}
      onMouseDown={nudgeLockIndicator}
      onWheel={nudgeLockIndicator}
      onTouchStart={nudgeLockIndicator}
    >
      {/* Initial add button overlay */}
      {showInitialAddButton && (
        <div className="center-initial-plus-btn">
          <button className="initial-plus-btn-actual" type="button" onClick={onInitialAddClick} aria-label="Add a trigger">
            <span className="initial-plus-icon">+</span>
          </button>
          <div className="initial-plus-label">Add a trigger</div>
        </div>
      )}

      {/* Lock indicator (visible when locked) */}
      {isWorkflowLocked && (
        <ButtonComponent
          title='Diagram is locked. Click to unlock.'
          className={`diagram-lock-indicator e-primary${showLockHint ? ' hint' : ''}`}
          onClick={() => {
            setIsWorkflowLocked(false);
            applyWorkflowLock(false);
          }}
          aria-label="Unlock diagram"
        >
          {(() => {
            const LockIcon = IconRegistry['LockIcon'] as any;
            return <LockIcon />;
          })()}
        </ButtonComponent>
      )}

      {/* Main diagram component */}
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
        elementDraw={handleElementDraw}
        collectionChange={handleCollectionChange}
        snapSettings={snapSettings}
        scrollSettings={{ scrollLimit: 'Infinity' }}
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
        selectedItems={{ userHandles: baseUserHandles }}
        onUserHandleMouseDown={handleUserHandleMouseDown}
        historyChange={onDiagramChange}
        loaded={handleDiagramLoaded}
      >
        <Inject
          services={[
            UndoRedo,
            DataBinding,
            DiagramContextMenu,
            Snapping,
            ComplexHierarchicalTree,
          ]}
        />
      </DiagramComponent>

      {/* Overview panel with zoom display */}
      <div
        className="diagram-overview-container"
        style={{
          opacity: showOverview && diagramSettings?.showOverview ? 1 : 0,
          visibility: showOverview && diagramSettings?.showOverview ? 'visible' : 'hidden',
        }}
      >
        {showZoomPercentage && <div className="zoom-percentage-display">{zoomPercentage}%</div>}
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

