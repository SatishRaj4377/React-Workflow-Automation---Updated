import './Editor.css';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBlocker } from 'react-router';
import { DiagramTools, NodeConstraints, NodeModel, PortConstraints, ConnectorModel } from '@syncfusion/ej2-react-diagrams';
import EditorHeader from '../Header/EditorHeader';
import DiagramEditor from '../DiagramEditor';
import Toolbar from '../Toolbar';
import Toast, { showSuccessToast, showErrorToast } from '../Toast';
import NodePaletteSidebar from '../NodePaletteSidebar';
import NodeConfigSidebar from '../NodeConfigSidebar';
import { useTheme } from '../../contexts/ThemeContext';
import ConfirmationDialog from '../ConfirmationDialog';
import { ProjectData, NodeConfig, NodeTemplate, DiagramSettings, StickyNotePosition, ToolbarAction, ExecutionContext, NodeToolbarAction, PaletteFilterContext, WorkflowData } from '../../types';
import WorkflowProjectService from '../../services/WorkflowProjectService';
import { calculateNewNodePosition, createConnector, createNodeFromTemplate, generateOptimizedThumbnail, getDefaultDiagramSettings, getNodeConfig, getNodePortById, isAiAgentNode, findAiAgentBottomConnectedNodes, getAiAgentBottomNodePosition, isAgentBottomToToolConnector, getNodeCenter, findFirstPortId, adjustNodesSpacing, handleEditorKeyDown, refreshNodeTemplate, setGlobalNodeToolbarHandler, applyStaggerMetadata, getNextStaggeredOffset, resetExecutionStates, diagramHasChatTrigger } from '../../utilities';
import { WorkflowExecutionService } from '../../execution/WorkflowExecutionService';
import { ChatPopup } from '../ChatPopup';
import { MessageComponent } from '@syncfusion/ej2-react-notifications';
import { createSpinner, showSpinner, hideSpinner } from '@syncfusion/ej2-popups';
import { ensureGlobalFormPopupHost } from '../FormPopup';

interface EditorProps {
  project: ProjectData;
  onSaveProject: (project: ProjectData) => void;
  onBackToHome: () => void;
}

const Editor: React.FC<EditorProps> = ({project, onSaveProject, onBackToHome, }) => {
  const { theme } = useTheme();
  const workflowExecutionRef = useRef<WorkflowExecutionService | null>(null);
  const chatPendingMessageRef = useRef<{ text: string; at: string } | null>(null);
  const assistantRespondedRef = useRef<boolean>(false);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const [nodePaletteSidebarOpen, setNodePaletteSidebarOpen] = useState(false);
  const [nodeConfigPanelOpen, setNodeConfigPanelOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeConfig | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isChatOpen, setChatOpen] = useState(false);
  const [chatPromptSuggestions, setChatPromptSuggestions] = useState<string[]>([]);
  const [executionContext, setExecutionContext] = useState<ExecutionContext>({ results: {}, variables: {} });
  const [waitingTrigger, setWaitingTrigger] = useState<{ active: boolean; type?: string }>({ active: false });
  const [projectName, setProjectName] = useState(project.name);
  const [diagramRef, setDiagramRef] = useState<any>(null);
  const [isPanActive, setIsPanActive] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isUserhandleAddNodeSelectionMode, setUserhandleAddNodeSelectionMode] = useState(false);
  const [selectedPortConnection, setSelectedPortConnection] = useState<{nodeId: string, portId: string} | null>(null);
  const [isConnectorInsertSelectionMode, setConnectorInsertSelectionMode] = useState(false);
  const [selectedConnectorForInsertion, setSelectedConnectorForInsertion] = useState<ConnectorModel | null>(null);
  const [paletteFilterContext, setPaletteFilterContext] = useState<PaletteFilterContext>({ mode: 'default' });
  const [showInitialAddButton, setShowInitialAddButton] = useState(
    !project.workflowData?.diagramString || project.workflowData.diagramString.trim() === ''
  );
  const [diagramSettings, setDiagramSettings] = useState<DiagramSettings>(() => {
    const defaultDiagramSettings = getDefaultDiagramSettings();
    return {
      ...project.diagramSettings,
      gridStyle: project.diagramSettings?.gridStyle ?? defaultDiagramSettings.gridStyle,
      connectorType: project.diagramSettings?.connectorType ?? defaultDiagramSettings.connectorType,
      connectorCornerRadius: project.diagramSettings?.connectorCornerRadius ?? defaultDiagramSettings.connectorCornerRadius,
      snapping: project.diagramSettings?.snapping ?? defaultDiagramSettings.snapping,
      showOverview: project.diagramSettings?.showOverview ?? defaultDiagramSettings.showOverview,
      showOverviewAlways: project.diagramSettings?.showOverviewAlways ?? defaultDiagramSettings.showOverviewAlways
    }
  });
  
  const blocker = useBlocker(React.useCallback(() => isDirty, [isDirty]));

  const handleSave = useCallback(async () => {
    if (editorContainerRef.current) showSpinner(editorContainerRef.current);
    try {
      if (diagramRef) {
        // Reset execution states before saving to ensure clean thumbnail
        resetExecutionStates(diagramRef);
        
        // Save diagram as string using EJ2's built-in method
        const diagramString = diagramRef.saveDiagram();

        // Generate thumbnail with current diagram output
        const thumbnailBase64 = await generateOptimizedThumbnail(diagramRef.id);

        const updatedProject: ProjectData = {
          ...project,
          name: projectName,
          workflowData: {
            ...(project.workflowData ?? {}),
            diagramString: diagramString,
          } as WorkflowData,
          diagramSettings: diagramSettings,
          thumbnail: thumbnailBase64 ?? project.thumbnail,
        };

        WorkflowProjectService.saveProject(updatedProject);
        onSaveProject(updatedProject);
        setIsDirty(false);
        setIsInitialLoad(false);
        showSuccessToast('Workflow Saved', 'Your workflow has been saved successfully.');
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      showErrorToast('Save Failed', 'There was an error saving your workflow.');
    } finally {
      if (editorContainerRef.current) hideSpinner(editorContainerRef.current);
    }
  }, [diagramRef, project, projectName, diagramSettings, onSaveProject]);

  const handleDiagramChange = () => {
    // Mark as dirty when diagram changes
    setIsDirty(true);
  };

  const handleNodeDoubleClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setNodeConfigPanelOpen(true);
    setNodePaletteSidebarOpen(false);
  };

  const handleSingleNodeExecute = async (nodeId: string) => {
    const svc = workflowExecutionRef.current;
    if (!svc) { return; }

    try {
      const res = await svc.executeSingleNode(nodeId);
      if (res?.success) {
        showSuccessToast('Node executed', 'Output captured in execution context.');
        return;
      }
    } catch (err) {}
  };

  const handleNodeToolbarAction = useCallback((nodeId: string, action: NodeToolbarAction) => {
    if (!diagramRef) return;

    switch (action) {
      case 'execute-step':
        handleSingleNodeExecute(nodeId);
        break;
      case 'edit':
        handleNodeDoubleClick(nodeId);
        break;
      case 'delete':
        diagramRef.remove(diagramRef.getObject(nodeId));
        setIsDirty(true);
        break;
    }
  }, [diagramRef]);

  // Ensure the global node toolbar handler is available before any templates mount
  setGlobalNodeToolbarHandler(handleNodeToolbarAction);

  const handleNodeConfigChange = (nodeId: string, config: NodeConfig) => {
    setSelectedNode(config);
    
    // Update the node's addInfo and node's template
    if (diagramRef) {
      const node = diagramRef.getObject(nodeId);
      if (node) {
        node.addInfo = { ...node.addInfo, nodeConfig: config };
        // Rebuild the node HTML and reattach toolbar handlers via global handler
        refreshNodeTemplate(diagramRef, nodeId);
        setIsDirty(true);
      }
    }

    // If this is the Chat node, immediately reflect its prompt suggestions in the popup
    try {
      if (config?.nodeType === 'Chat') {
        const s = (config as any)?.settings?.general?.promptSuggestions;
        setChatPromptSuggestions(Array.isArray(s) ? s : []);
      }
    } catch {}
  };

  const handleUserhandleAddNodeClick = (node: NodeModel, portId: string) => {
    if (!diagramRef && !node) return;
    const port = getNodePortById(node, portId); 
    if (!port?.constraints) return;
    
    // Only allow if port is OutConnect and Draw (connectable)
    const isConnectable =
      ((port.constraints & PortConstraints.OutConnect) !== 0) &&
      ((port.constraints & PortConstraints.Draw) !== 0);

    if (isConnectable) {
      setSelectedPortConnection({ nodeId: node?.id as string, portId });
      setUserhandleAddNodeSelectionMode(true);
      setNodeConfigPanelOpen(false);

      // Determine palette filter context
      try {
        const cfg = getNodeConfig(node);
        const isAgent = cfg ? isAiAgentNode(cfg) : false;
        const isBottomPort = (portId || '').toLowerCase().startsWith('bottom');

        if (isAgent && isBottomPort) {
          setPaletteFilterContext({ mode: 'port-agent-bottom' });
        } else {
          // Generic from any node port (core/flow/trigger) → show only Core & Flow
          setPaletteFilterContext({ mode: 'port-core-flow' });
        }
      } catch {
        setPaletteFilterContext({ mode: 'port-core-flow' });
      }

      setNodePaletteSidebarOpen(true);
    } else {
      // Not connectable, do nothing
      setUserhandleAddNodeSelectionMode(false);
      setSelectedPortConnection(null);
      setNodePaletteSidebarOpen(false);
      setPaletteFilterContext({ mode: 'default' });
    }
  };

  const handleAddNode = (nodeTemplate: NodeTemplate) => {
    if (isUserhandleAddNodeSelectionMode) {
      addNodeFromPort(nodeTemplate);
    } else if (isConnectorInsertSelectionMode) {
      insertNodeBetweenSelectedConnector(nodeTemplate);
    } else {
      addNodeToDiagram(nodeTemplate);
    }
    setIsDirty(true);
  };

  // Handles adding a new node connected to a selected userhandles node port
  const addNodeFromPort = (nodeTemplate: NodeTemplate) => {
    if (!diagramRef || !selectedPortConnection) return;

    // Get the source node where the user handle was triggered
    const sourceNode = diagramRef.getObject(selectedPortConnection.nodeId);
    if (!sourceNode) {
      console.error('Source node not found for connection.');
      return;
    }

    // Calculate position for the new node based on the source
    const { offsetX: x, offsetY: y } = calculateNewNodePosition(sourceNode, selectedPortConnection.portId);
    
    // Create the new node and connector using utility functions
    const newNode = createNodeFromTemplate(nodeTemplate, { x, y });
    const connector = createConnector(
      selectedPortConnection.nodeId,
      newNode.id || '',
      selectedPortConnection.portId,
      nodeTemplate?.category === 'tool' ? 'top-port' : 'left-port'
    );

    // Add the new elements to the diagram
    diagramRef.add(newNode);
    diagramRef.add(connector);
    // If the source node is an AI Agent and the user added a node from a bottom port,
    // reposition that agent's bottom targets so they stay centered and spaced.
    try {
      const srcCfg = getNodeConfig(sourceNode as NodeModel);
      if (srcCfg && isAiAgentNode(srcCfg) && selectedPortConnection.portId.toLowerCase().startsWith('bottom')) {
        repositionAiAgentTargets(sourceNode as NodeModel);
      }
    } catch (err) {}
    diagramRef.tool = DiagramTools.Default; // Reset the diagram tool

    // Reset the component's state after connection
    setUserhandleAddNodeSelectionMode(false);
    setSelectedPortConnection(null);
    setNodePaletteSidebarOpen(false);
  };

  // Handles adding a new node directly to the diagram canvas
  const addNodeToDiagram = (nodeTemplate: NodeTemplate) => {
    if (!diagramRef) return;
    
    // Create new node using utility function
    const newNode = createNodeFromTemplate(nodeTemplate);
    diagramRef.add(newNode);
  };

  // Insert a node between the currently selected connector's source and target
  const insertNodeBetweenSelectedConnector = async (nodeTemplate: NodeTemplate) => {
    if (!diagramRef || !selectedConnectorForInsertion) return;

    const conn = selectedConnectorForInsertion as any;

    // Restrict: do not allow inserting into AI Agent bottom* -> Tool connectors
    try {
      if (isAgentBottomToToolConnector(conn, diagramRef)) {
        resetConnectorInsertMode();
        setNodePaletteSidebarOpen(false);
        return;
      }
    } catch {}

    const sourceNode = diagramRef.getObject(conn.sourceID) as NodeModel | null;
    const targetNode = diagramRef.getObject(conn.targetID) as NodeModel | null;
    if (!sourceNode || !targetNode) {
      addNodeToDiagram(nodeTemplate);
      resetConnectorInsertMode();
      return;
    }

    const sourceNodeCenterPoint = getNodeCenter(sourceNode);
    const targetNodeCenterPoint = getNodeCenter(targetNode);

    // Compute midpoint between source and target to place new node
    const midX = (sourceNodeCenterPoint.x + targetNodeCenterPoint.x) / 2;
    const midY = (sourceNodeCenterPoint.y + targetNodeCenterPoint.y) / 2;

    // Add node
    const newInsertedNode = createNodeFromTemplate(nodeTemplate, { x: midX, y: midY });
    diagramRef.add(newInsertedNode);

    // Remove existing connector
    diagramRef.remove(conn);


    // Wire two new connectors
    // Preserve the original sourcePortID and targetPortID from the split connector,
    // and dynamically pick the first IN/OUT ports on the new node to avoid hardcoding
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

    // Source and Target node adjustment to avoid overlapping
    adjustNodesSpacing(sourceNode, targetNode, 250);
    resetConnectorInsertMode();
    setNodePaletteSidebarOpen(false);
  };

  const resetConnectorInsertMode = () => {
    setConnectorInsertSelectionMode(false);
    setSelectedConnectorForInsertion(null);
  };

  // reposition targets connected to an AI Agent bottom port (extracted so it can be reused)
  const repositionAiAgentTargets = (agent: NodeModel) => {
    if (!diagramRef || !agent) return;
    
    // Get all nodes connected to bottom ports
    const targets: NodeModel[] = findAiAgentBottomConnectedNodes(agent, diagramRef);
    if (targets.length === 0) return;

    // Position each target node
    targets.forEach((target: NodeModel, _: number) => {
      // Place this target relative to all other targets
      const position = getAiAgentBottomNodePosition(agent, 'bottom-port', diagramRef, target);
      target.offsetX = position.offsetX;
      target.offsetY = position.offsetY;
    });

    diagramRef.dataBind();
  };

  const handleDiagramSettingsChange = (settings: DiagramSettings) => {
    setDiagramSettings(settings);
    setIsDirty(true);
  };

  // TOOLBAR HANDLERS - BEGIN
  const handleToolbarAction = (action: ToolbarAction) => {
    switch (action) {
      case 'addNode':
        setNodeConfigPanelOpen(false);
        setNodePaletteSidebarOpen(!nodePaletteSidebarOpen);
        break;
      case 'execute':
        handleExecuteWorkflow();
        break;
      case 'cancel':
        handleCancelExecution();
        break;
      case 'autoAlign':
        handleAutoAlign();
        break;
      case 'fitToPage':
        diagramRef?.fitToPage({
          canZoomIn: false,
          canZoomOut: false,
          margin: { top: 100, left: 100, bottom: 100, right: 100 },
        });
        break;
      case 'zoomIn':
        diagramRef?.zoomTo({ type: 'ZoomIn', zoomFactor: 0.2 });
        break;
      case 'zoomOut':
        diagramRef?.zoomTo({ type: 'ZoomOut', zoomFactor: 0.2 });
        break;
      case 'resetZoom':
        diagramRef?.reset();
        break;
      case 'addSticky':
        handleAddStickyNote();
        break;
      case 'togglePan':
        handleTogglePan();
        break;
      default:
        console.warn(`Unhandled toolbar action: ${action}`);
    }
  };
  const handleExecuteWorkflow = async () => {
    if (!workflowExecutionRef.current) {
      showErrorToast('Execution Failed', 'Workflow service not initialized');
      return;
    }

    setIsExecuting(true);

    // Track if any node posted an assistant message during this run
    assistantRespondedRef.current = false;
    const markAssistantResponded = () => { assistantRespondedRef.current = true; };
    if (typeof window !== 'undefined') {
      window.addEventListener('wf:chat:assistant-response', markAssistantResponded as EventListener);
    }
    
    try {
      const result = await workflowExecutionRef.current.executeWorkflow();
      if (result) {
        setExecutionContext(workflowExecutionRef.current.getExecutionContext());
      }
      // Only send a final completion note if no assistant message was already posted
      if (!assistantRespondedRef.current && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wf:chat:assistant-response', {
            detail: { text: 'Workflow execution completed.' }
          })
        );
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      showErrorToast('Execution Failed', errMsg);
      // Only send a failure note if no assistant message was already posted
      if (!assistantRespondedRef.current && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('wf:chat:assistant-response', {
            detail: { text: `Workflow execution failed: ${errMsg}` }
          })
        );
      }
    } finally {
      setIsExecuting(false);
      if (typeof window !== 'undefined') {
        window.removeEventListener('wf:chat:assistant-response', markAssistantResponded as EventListener);
      }
    }
  };
  const handleCancelExecution = () => {
    if (workflowExecutionRef.current) {
      workflowExecutionRef.current.stopExecution();
    }
    setIsExecuting(false);
    // Cancel any pending chat trigger listener to avoid multiple executions
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wf:chat:cancel'));
      window.dispatchEvent(
        new CustomEvent('wf:chat:assistant-response', {
          detail: { text: 'Workflow execution has been cancelled.' }
        })
      );
    }
  };
  const handleTogglePan = () => {
    if (!diagramRef) return;
    const currentlyPan = diagramRef.tool === DiagramTools.ZoomPan;
    diagramRef.tool = currentlyPan ? DiagramTools.Default : DiagramTools.ZoomPan;
    setIsPanActive(!currentlyPan);
  };
  const handleAddStickyNote = (position?: StickyNotePosition) => {
    if (diagramRef) {
      // if no position is provided, place the sticky note in the center of the diagram (bit left)
      if (
        !position ||
        typeof position !== 'object' ||
        typeof position.x !== 'number' ||
        typeof position.y !== 'number'
      ) {
        position = {
          x: diagramRef.scrollSettings.viewPortWidth / 3,
          y: diagramRef.scrollSettings.viewPortHeight / 2,
        };
      }
      
      let x : number= position.x;
      let y :number = position.y;
      let index: number | undefined;

      // Apply staggering only if postion is not from mouse
      if (!position.fromMouse) {
        const staggered = getNextStaggeredOffset(diagramRef, x, y, {
          group: 'sticky',
          strategy: 'grid',
          stepX: 220,
          stepY: 220,
        });
        x = staggered.x;
        y = staggered.y;
        index = staggered.index;
      }
      const timestamp = Date.now();
      const stickyNote: NodeModel = {
        id: `sticky-${timestamp}`,
        width: 240,
        height: 240,
        offsetX: x,
        offsetY: y - 64, // removing the header height
        constraints: (NodeConstraints.Default & ~NodeConstraints.Rotate),
        addInfo: {
          nodeConfig: {
            id: `sticky-${timestamp}`,
            category: 'sticky',
            displayName: 'Sticky Note',
          } as NodeConfig
        }
      };

      // Persist stagger metadata only if staggering was applied
      if (index !== undefined) {
        applyStaggerMetadata(stickyNote, 'sticky', index);
      }

      diagramRef.add(stickyNote);
    }
  };
  const handleAutoAlign = () => {
    if (!diagramRef) return;

    // Run default layout first
    diagramRef.doLayout();

    // Reuse existing utilities instead of scanning connectors manually
    const nodes: any[] = (diagramRef.nodes && Array.isArray(diagramRef.nodes)) ? diagramRef.nodes : [];
    nodes.forEach((n: NodeModel) => {
      try {
        const cfg = getNodeConfig(n);
        if (cfg && isAiAgentNode(cfg)) {
          const bottomTargets = findAiAgentBottomConnectedNodes(n, diagramRef);
          if (bottomTargets.length > 0) {
            repositionAiAgentTargets(n);
          }
        }
      } catch (err) { /* ignore */ }
    });
    diagramRef.dataBind();
    diagramRef.reset();
    diagramRef.fitToPage();
  };
  // TOOLBAR HANDLERS - END

  // Handle selected node changes
  useEffect(() => {
    if (selectedNodeId && diagramRef) {
      // Get node from diagram
      const node = diagramRef.getObject(selectedNodeId);
      if (node && node.addInfo && node.addInfo.nodeConfig) {
        setSelectedNode(node.addInfo.nodeConfig);
        setNodePaletteSidebarOpen(false);
        setNodeConfigPanelOpen(true);
      } else {
        setNodeConfigPanelOpen(false);
        setSelectedNode(null);
      }
    } else {
      setNodeConfigPanelOpen(false);
      setSelectedNode(null);
    }
  }, [selectedNodeId, diagramRef]);

  // Helper: extract prompt suggestions from the Chat trigger node (if present)
  const extractChatSuggestions = useCallback((): string[] => {
    try {
      if (!diagramRef) return [];
      const nodes: any[] = Array.isArray(diagramRef.nodes) ? diagramRef.nodes : [];
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
  }, [diagramRef]);

  // Sync chat suggestions whenever diagram ref becomes available/changes
  useEffect(() => {
    setChatPromptSuggestions(extractChatSuggestions());
  }, [extractChatSuggestions]);

  // Initialize workflow execution service when diagram ref changes
  useEffect(() => {
    if (diagramRef) {
      // Provide a global handler so template refreshes from utilities still wire events
      setGlobalNodeToolbarHandler(handleNodeToolbarAction);

      workflowExecutionRef.current = new WorkflowExecutionService(diagramRef);
      
      // Start listening for updates to execution context
      workflowExecutionRef.current.onExecutionContextUpdate((context) => {
        setExecutionContext(context);
      });
    }

    return () => {
      // Cleanup on unmount
      if (workflowExecutionRef.current) {
        workflowExecutionRef.current.cleanup();
      }
      setGlobalNodeToolbarHandler(undefined);
    };
  }, [diagramRef, handleNodeToolbarAction]);

  useEffect(() => {
    // Check initial pan state on mount
    if (diagramRef?.tool === DiagramTools.ZoomPan) {
      setIsPanActive(true);
    }

    // Spacebar toggles temporary pan in EJ2; reflect active while pressed
    const onKeyDown = (e: KeyboardEvent) => {
      // Only toggle pan if not editing text - prevent interfering with typing space key
      const activeElement = document.activeElement;
      const isEditingText = activeElement instanceof HTMLInputElement || 
                           activeElement instanceof HTMLTextAreaElement ||
                           activeElement?.getAttribute('contenteditable') === 'true';
      
      if (e.code === 'Space' && !isEditingText) {
        setIsPanActive(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Only handle space key up if not editing text
      const activeElement = document.activeElement;
      const isEditingText = activeElement instanceof HTMLInputElement || 
                           activeElement instanceof HTMLTextAreaElement ||
                           activeElement?.getAttribute('contenteditable') === 'true';
      
      if (e.code === 'Space' && !isEditingText) {
        // After space released, reflect actual tool state
        const active = diagramRef?.tool === DiagramTools.ZoomPan;
        setIsPanActive(!!active);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [diagramRef]);

  // Initialize EJ2 spinner on the editor container once
  useEffect(() => {
    if (editorContainerRef.current) {
      try {
        createSpinner({ target: editorContainerRef.current, cssClass: 'e-spin-overlay editor-save-spinner' });
      } catch {}
    }
    return () => {
      try {
        if (editorContainerRef.current) hideSpinner(editorContainerRef.current);
      } catch {}
    };
  }, []);

  const handleExport = () => {
    if (diagramRef) {
      const diagramString = diagramRef.saveDiagram();
      const currentProjectData = {
        ...project,
        name: projectName,
        workflowData: {
          ...(project.workflowData ?? {}),
          diagramString,
        },
        diagramSettings,
      } as ProjectData;

      WorkflowProjectService.exportProject(currentProjectData);
      showSuccessToast('Export Complete', 'Project has been exported successfully.');
    }
  };

  const handleImport = (importedProject: any) => {
    try {
      // Validate the imported data structure
      if (!importedProject || typeof importedProject !== 'object') {
        throw new Error('Invalid project file format');
      }
      const now = new Date();

      // Set project data
      setProjectName(importedProject.name || 'Imported Project');
      setDiagramSettings(importedProject.diagramSettings || getDefaultDiagramSettings());

      // Load the diagram if available
      if (diagramRef && importedProject.workflowData?.diagramString) {
        diagramRef.loadDiagram(importedProject.workflowData.diagramString);
      }

      // Update parent component with imported project
      const updatedProject = {
        ...importedProject,
        id: project.id, // Keep current project ID to replace current project
        isBookmarked: false,
        lastModified: now.toISOString(),
        workflowData: {
          ...importedProject.workflowData,
          metadata: {
            ...importedProject.workflowData.metadata,
            created: now, // Set new creation date
            modified: now, // Set new modification date
          },
        },
      };
      
      onSaveProject(updatedProject);
      setIsDirty(false);
      setIsInitialLoad(false);
      
      showSuccessToast('Import Complete', 'Project has been imported successfully.');
    } catch (error) {
      console.error('Import failed:', error);
      showErrorToast('Import Failed', 'There was an error importing the project file.');
    }
  };

  // When a navigation is blocked, open the confirmation dialog
  useEffect(() => {
    if (blocker.state === 'blocked') {
      // If execution is running, stop it silently before confirming navigation
      try { workflowExecutionRef.current?.stopExecution(true); } catch {}
      setShowLeaveDialog(true);
    }
  }, [blocker.state]);

  // On page refresh or tab close action, show a warning to the user
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = ''; // triggers the native prompt
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Handle all keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      handleEditorKeyDown(
        e,
        handleToolbarAction,
        isExecuting,
        isDirty,
        handleSave,
        showSuccessToast
      );
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isExecuting, isDirty, handleSave, handleToolbarAction]);

  // Auto-start the workflow on user prompt when a Chat trigger exists
  useEffect(() => {
    const handleChatPromptEvent = (e: Event) => {
      const ce = e as CustomEvent<{ text?: string; at?: string }>;
      const text = (ce.detail?.text || '').trim();
      if (!text) return; // ignore empty after trim

      const promptPayload = { text, at: ce.detail?.at || new Date().toISOString() };

      // Send the prompt to the waiting Chat trigger (used once it's ready)
      const dispatchPromptToWaitingChatTrigger = () => {
        window.dispatchEvent(new CustomEvent('wf:chat:message', { detail: promptPayload }));
      };

      // If execution already running, just forward the message.
      if (isExecuting) {
        dispatchPromptToWaitingChatTrigger();
        return;
      }

      // If a Chat trigger exists, start the workflow like clicking Execute
      if (diagramHasChatTrigger(diagramRef) && workflowExecutionRef.current) {
        // Cache the prompt until the Chat trigger announces it's ready
        chatPendingMessageRef.current = promptPayload;

        // Forward exactly once when the trigger signals it's listening
        const onChatTriggerReadyOnce = () => {
          const payload = chatPendingMessageRef.current;
          chatPendingMessageRef.current = null;
          if (payload) {
            window.dispatchEvent(new CustomEvent('wf:chat:message', { detail: payload }));
          }
        };

        window.addEventListener('wf:chat:ready', onChatTriggerReadyOnce as EventListener, { once: true });

        // Ensure chat popup is visible
        setChatOpen(true);

        // Start the workflow similar to clicking Execute
        handleExecuteWorkflow();
      } else {
        // No Chat trigger present; optionally forward (or ignore)
        dispatchPromptToWaitingChatTrigger();
      }
    };

    window.addEventListener('wf:chat:prompt', handleChatPromptEvent as EventListener);
    return () => {
      window.removeEventListener('wf:chat:prompt', handleChatPromptEvent as EventListener);
    };
  }, [isExecuting, diagramHasChatTrigger, handleExecuteWorkflow]);

  // Listen for trigger waiting/resume events to show a banner above the toolbar
  useEffect(() => {
    const onWaiting = (e: Event) => {
      const ce = e as CustomEvent<{ type?: string }>;
      setWaitingTrigger({ active: true, type: ce.detail?.type });
    };
    const onResumed = () => setWaitingTrigger({ active: false });
    const onClear = () => setWaitingTrigger({ active: false });

    window.addEventListener('wf:trigger:waiting', onWaiting as EventListener);
    window.addEventListener('wf:trigger:resumed', onResumed as EventListener);
    window.addEventListener('wf:trigger:clear', onClear as EventListener);

    return () => {
      window.removeEventListener('wf:trigger:waiting', onWaiting as EventListener);
      window.removeEventListener('wf:trigger:resumed', onResumed as EventListener);
      window.removeEventListener('wf:trigger:clear', onClear as EventListener);
    };
  }, []);


  // Handle the chat and form node trigger intialization
  useEffect(() => {
    // Ensure global Form popup host is mounted once
    try { ensureGlobalFormPopupHost(); } catch {}

    const handler = () => setChatOpen(true);
    window.addEventListener('wf:chat:open', handler);

    return () => window.removeEventListener('wf:chat:open', handler);
  }, []);

  return (
    <div className="editor-container" data-theme={theme} ref={editorContainerRef}>
      {/* Header */}
      <EditorHeader
        projectName={projectName}
        onBack={() => onBackToHome()}
        onSave={handleSave}
        enableSaveBtn={isInitialLoad || isDirty}
        onProjectNameChange={(name) => {
          setProjectName(name);
          setIsDirty(true);
        }}
        diagramSettings={diagramSettings}
        onDiagramSettingsChange={handleDiagramSettingsChange}
        onExport={handleExport}
        onImport={handleImport}
      />
      {/* Main Section */}
      <div className="editor-content">
        {/* Sidebar for Configuration */}
        <NodeConfigSidebar 
          isOpen={nodeConfigPanelOpen}
          onClose={() => setNodeConfigPanelOpen(false)}
          onDeleteNode={(nodeId) => diagramRef.remove(diagramRef.getNodeObject(nodeId))}
          selectedNode={selectedNode}
          onNodeConfigChange={handleNodeConfigChange}
          diagram={diagramRef}
          executionContext={executionContext}
          isChatOpen={isChatOpen}
          setChatOpen={setChatOpen}
        />

        {/* Chat Component - shown when the user execute the chat trigger node */}
        <ChatPopup 
          open={isChatOpen} 
          onClose={() => setChatOpen(false)} 
          promptSuggestions={chatPromptSuggestions}
        />        

        {/* Sidebar for Node Palette */}
        <NodePaletteSidebar 
          isOpen={nodePaletteSidebarOpen}
          onClose={() => setNodePaletteSidebarOpen(false)}
          onAddNode={handleAddNode}
          paletteFilterContext={paletteFilterContext}
        />
                
        {/* Main Diagram Area */}
        <div className="diagram-container">
          <DiagramEditor 
            onAddNode={() => {
              setNodeConfigPanelOpen(false);
              setPaletteFilterContext({ mode: 'default' });
              setNodePaletteSidebarOpen(true);
            }}
            onNodeDoubleClick={handleNodeDoubleClick}
            onDiagramRef={(ref) => setDiagramRef(ref)}
            project={project}
            onDiagramChange={handleDiagramChange}
            onAddStickyNote={handleAddStickyNote}
            onUserhandleAddNodeClick={handleUserhandleAddNodeClick}
            onConnectorUserhandleAddNodeClick={(connector) => {
              setSelectedConnectorForInsertion(connector as any);
              setConnectorInsertSelectionMode(true);
              setNodeConfigPanelOpen(false);
              setPaletteFilterContext({ mode: 'connector-insert' });
              setNodePaletteSidebarOpen(true);
            }}
            isUserHandleAddNodeEnabled= {isUserhandleAddNodeSelectionMode}
            diagramSettings={diagramSettings}
            showInitialAddButton={showInitialAddButton}
            onInitialAddClick={() => {
              setNodeConfigPanelOpen(false);
              setPaletteFilterContext({ mode: 'initial-add' });
              setNodePaletteSidebarOpen(true);
            }}
            onNodeAddedFirstTime={() => setShowInitialAddButton(false)}
            onAutoAlignNodes={handleAutoAlign}
            onCanvasClick={() => {
              setUserhandleAddNodeSelectionMode(false)
              resetConnectorInsertMode();
              setNodePaletteSidebarOpen(false);
              setNodeConfigPanelOpen(false);
              setPaletteFilterContext({ mode: 'default' });
            }}
          />
        </div>
        
        {/* Trigger waiting banner */}
        <div className={`trigger-start-notification ${waitingTrigger.active ? 'active' : ''}`}>
          <MessageComponent severity="Info" cssClass="e-content-center" showIcon={false} title={waitingTrigger.type + " Trigger"} >
            <span className="spinner-inline" />
            Waiting for trigger event
          </MessageComponent>
        </div>

        {/* Floating Toolbar */}
        <div className="editor-toolbar">
          <Toolbar 
            onAction={handleToolbarAction}
            isExecuting={isExecuting}
            isPanActive={isPanActive}
          />
        </div>
      </div>
      
      {/* Toast Popup */}
      <Toast />
      
      {/* Show the save confirmation dialog on page leave */}
      <ConfirmationDialog
        isOpen={showLeaveDialog}
        onDismiss={() => {
          // do nothing, stay in the same page
          setShowLeaveDialog(false);
          if (blocker.state === 'blocked') {
            blocker.reset();
          }
        }}
        onConfirm={() => {
          // Save changes and navigate. Ensure execution is stopped silently.
          try { workflowExecutionRef.current?.stopExecution(true); } catch {}
          handleSave();
          setShowLeaveDialog(false);
          if (blocker.state === 'blocked') {
            blocker.proceed();
          }
        }}
        onClose={() => {
          // Discard changes and navigate. Ensure execution is stopped silently.
          try { workflowExecutionRef.current?.stopExecution(true); } catch {}
          setShowLeaveDialog(false);
          if (blocker.state === 'blocked') {
            blocker.proceed();
          }
        }}
        content="You have unsaved changes. Do you want to save before leaving?"
        buttonContent={{ primary: 'Save & Leave', secondary: 'Discard Changes' }}
        variant="primary"
      />
    </div>
  );
};

export default Editor;