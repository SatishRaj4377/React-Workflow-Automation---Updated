import './Editor.css';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBlocker } from 'react-router';
import { DiagramTools, NodeModel, PortConstraints, ConnectorModel } from '@syncfusion/ej2-react-diagrams';
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
import { generateOptimizedThumbnail, getDefaultDiagramSettings, getNodeConfig, getNodePortById, isAiAgentNode, findAiAgentBottomConnectedNodes, getAiAgentBottomNodePosition, handleEditorKeyDown, refreshNodeTemplate, setGlobalNodeToolbarHandler, applyStaggerMetadata, resetExecutionStates, diagramHasChatTrigger } from '../../utilities';
import { extractChatPromptSuggestions, isEditingTextElement, determinePaletteFilterContext, handleAddStickyNote as handleAddStickyNoteUtil, addNodeToDiagram, addNodeFromPort, insertNodeBetweenSelectedConnector, handleAutoAlign as handleAutoAlignUtil } from '../../utilities/editorUtils';
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
  // ========================================================================
  // Theme & Context
  // ========================================================================
  const { theme } = useTheme();

  // ========================================================================
  // References
  // ========================================================================

  // Workflow execution service for running nodes and full workflows
  const workflowExecutionRef = useRef<WorkflowExecutionService | null>(null);
  // Cache for pending chat message until Chat trigger is ready
  const chatPendingMessageRef = useRef<{ text: string; at: string } | null>(null);
  // Flag to prevent duplicate chat completion messages during execution
  const assistantRespondedRef = useRef<boolean>(false);
  // Main editor container for spinner overlay
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  // ========================================================================
  // State Management - UI Panels & Selection
  // ========================================================================

  // Left sidebar panel state (node palette)
  const [nodePaletteSidebarOpen, setNodePaletteSidebarOpen] = useState(false);
  // Right sidebar panel state (node configuration)
  const [nodeConfigPanelOpen, setNodeConfigPanelOpen] = useState(false);
  // Selected node ID for editing in config panel
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Selected node configuration object
  const [selectedNode, setSelectedNode] = useState<NodeConfig | null>(null);

  // ========================================================================
  // State Management - Execution & Chat
  // ========================================================================

  // Execution in progress flag
  const [isExecuting, setIsExecuting] = useState(false);
  // Chat popup visibility flag
  const [isChatOpen, setChatOpen] = useState(false);
  // Prompt suggestions from Chat trigger node
  const [chatPromptSuggestions, setChatPromptSuggestions] = useState<string[]>([]);
  // Execution context containing results and variables from executed nodes
  const [executionContext, setExecutionContext] = useState<ExecutionContext>({ results: {}, variables: {} });
  // Trigger waiting state (shown in banner when waiting for trigger event)
  const [waitingTrigger, setWaitingTrigger] = useState<{ active: boolean; type?: string }>({ active: false });

  // ========================================================================
  // State Management - Project & Diagram
  // ========================================================================

  // Current project name for editing in header
  const [projectName, setProjectName] = useState(project.name);
  // Diagram reference from DiagramEditor component
  const [diagramRef, setDiagramRef] = useState<any>(null);
  // Pan tool active flag for UI indicator
  const [isPanActive, setIsPanActive] = useState(false);
  // Dirty flag for unsaved changes detection
  const [isDirty, setIsDirty] = useState(false);
  // Initial load flag to prevent showing save button on first render
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  // Show leave confirmation dialog flag
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  // ========================================================================
  // State Management - Node Addition & Connector Insertion
  // ========================================================================

  // User handle node add mode active flag (adding node from port)
  const [isUserhandleAddNodeSelectionMode, setUserhandleAddNodeSelectionMode] = useState(false);
  // Selected port for node addition from user handle
  const [selectedPortConnection, setSelectedPortConnection] = useState<{nodeId: string, portId: string} | null>(null);
  // Connector insertion mode active flag (inserting node between connectors)
  const [isConnectorInsertSelectionMode, setConnectorInsertSelectionMode] = useState(false);
  // Selected connector for node insertion
  const [selectedConnectorForInsertion, setSelectedConnectorForInsertion] = useState<ConnectorModel | null>(null);
  // Palette filter context to show only compatible nodes for current mode
  const [paletteFilterContext, setPaletteFilterContext] = useState<PaletteFilterContext>({ mode: 'default' });
  // Show initial add button overlay when diagram is empty
  const [showInitialAddButton, setShowInitialAddButton] = useState(
    !project.workflowData?.diagramString || project.workflowData.diagramString.trim() === ''
  );

  // ========================================================================
  // State Management - Diagram Settings
  // ========================================================================

  // Diagram settings (grid, snap, connectors, overview) with defaults
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
  
  // Navigation blocker for unsaved changes confirmation
  const blocker = useBlocker(React.useCallback(() => isDirty, [isDirty]));

  // ========================================================================
  // Project Management Handlers
  // ========================================================================

  // Save project to storage with thumbnail regeneration
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

  // Mark project as dirty when diagram changes
  const handleDiagramChange = () => {
    setIsDirty(true);
  };

  // Export current project as JSON file
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

  // Import project data and load diagram
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

  // ========================================================================
  // Node & Configuration Panel Handlers
  // ========================================================================

  // Open node config sidebar on node double click
  const handleNodeDoubleClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setNodeConfigPanelOpen(true);
    setNodePaletteSidebarOpen(false);
  };

  // Execute a single node and update execution context
  const handleSingleNodeExecute = async (nodeId: string) => {
    const svc = workflowExecutionRef.current;
    if (!svc) { return; }

    try {
      const res = await svc.executeSingleNode(nodeId);
      if (res?.success) {
        showSuccessToast('Node executed', "Results available in the node Configuration Panel Output tab.");
        return;
      }
    } catch (err) {}
  };

  // Handle node template toolbar actions (execute, edit, delete)
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

  // Update node configuration and refresh diagram
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

  // ========================================================================
  // Node Addition & Connector Insertion Handlers
  // ========================================================================

  // Start add-node-from-port flow when user handle is clicked
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

      // Determine palette filter context based on port and node type
      try {
        const cfg = getNodeConfig(node);
        const isAgent = cfg ? isAiAgentNode(cfg) : false;
        const isBottomPort = (portId || '').toLowerCase().startsWith('bottom');
        const context = determinePaletteFilterContext(isAgent, isBottomPort);
        setPaletteFilterContext({ mode: context as any });
      } catch {
        setPaletteFilterContext({ mode: 'port-core-flow' });
      }

      setNodePaletteSidebarOpen(true);
    } else {
      // Port not connectable - reset modes
      setUserhandleAddNodeSelectionMode(false);
      setSelectedPortConnection(null);
      setNodePaletteSidebarOpen(false);
      setPaletteFilterContext({ mode: 'default' });
    }
  };

  // Route add-node based on current insertion mode (port, connector, or canvas)
  const handleAddNode = (nodeTemplate: NodeTemplate) => {
    if (isUserhandleAddNodeSelectionMode) {
      addNodeFromPort(diagramRef, selectedPortConnection!, nodeTemplate, {
        resetState: () => {
          setUserhandleAddNodeSelectionMode(false);
          setSelectedPortConnection(null);
          setNodePaletteSidebarOpen(false);
        },
        repositionTargets: repositionAiAgentTargets,
      });
    } else if (isConnectorInsertSelectionMode) {
      insertNodeBetweenSelectedConnector(diagramRef, selectedConnectorForInsertion, nodeTemplate, {
        resetConnectorMode: resetConnectorInsertMode,
        closePanel: () => setNodePaletteSidebarOpen(false),
      });
    } else {
      addNodeToDiagram(diagramRef, nodeTemplate);
    }
    setIsDirty(true);
  };

  // Reset connector insertion mode state
  const resetConnectorInsertMode = () => {
    setConnectorInsertSelectionMode(false);
    setSelectedConnectorForInsertion(null);
  };

  // Reposition AI Agent bottom targets to keep centered and spaced
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

  // ========================================================================
  // Diagram Settings & Toolbar Handlers
  // ========================================================================

  // Update diagram settings and mark dirty
  const handleDiagramSettingsChange = (settings: DiagramSettings) => {
    setDiagramSettings(settings);
    setIsDirty(true);
  };

  // Dispatch toolbar actions to editor behaviors
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
        handleAutoAlignWrapper();
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
        handleAddStickyNoteWrapper();
        break;
      case 'togglePan':
        handleTogglePan();
        break;
      default:
        console.warn(`Unhandled toolbar action: ${action}`);
    }
  };

  // ========================================================================
  // Workflow Execution Handlers
  // ========================================================================

  // Execute full workflow and stream chat messages
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

  // Cancel current execution and notify chat listeners
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

  // ========================================================================
  // Diagram Interaction Handlers
  // ========================================================================

  // Toggle pan tool in diagram
  const handleTogglePan = () => {
    if (!diagramRef) return;
    const currentlyPan = diagramRef.tool === DiagramTools.ZoomPan;
    diagramRef.tool = currentlyPan ? DiagramTools.Default : DiagramTools.ZoomPan;
    setIsPanActive(!currentlyPan);
  };

  // Add sticky note with auto-positioning and stagger support
  const handleAddStickyNoteWrapper = (position?: StickyNotePosition) => {
    handleAddStickyNoteUtil(diagramRef, position, {
      applyStagger: (note, index) => applyStaggerMetadata(note, 'sticky', index),
      addNode: (note) => diagramRef.add(note),
    });
  };

  // Auto-align all nodes in diagram and fix AI Agent bottom targets spacing
  const handleAutoAlignWrapper = () => {
    handleAutoAlignUtil(diagramRef, {
      repositionAgentTargets: repositionAiAgentTargets,
    });
  };

  // ========================================================================
  // Effects - State Synchronization & Initialization
  // ========================================================================

  // Sync selected node configuration panel with diagram selection
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

  // Sync chat prompt suggestions from Chat trigger node when diagram ref changes
  useEffect(() => {
    setChatPromptSuggestions(extractChatPromptSuggestions(diagramRef));
  }, [diagramRef]);

  // ========================================================================
  // Effects - Execution Service & Global Handlers
  // ========================================================================

  // Initialize execution service and global handlers on diagram mount
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

  // ========================================================================
  // Effects - Keyboard & Input Interactions
  // ========================================================================

  // Reflect temporary pan with spacebar without interfering typing
  useEffect(() => {
    // Check initial pan state on mount
    if (diagramRef?.tool === DiagramTools.ZoomPan) {
      setIsPanActive(true);
    }

    // Spacebar toggles temporary pan in EJ2; reflect active while pressed
    const onKeyDown = (e: KeyboardEvent) => {
      // Only toggle pan if not editing text - prevent interfering with typing space key
      const activeElement = document.activeElement;
      const editing = isEditingTextElement(activeElement);
      if (e.code === 'Space' && !editing) {
        setIsPanActive(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      // Only handle space key up if not editing text
      const activeElement = document.activeElement;
      const editing = isEditingTextElement(activeElement);
      if (e.code === 'Space' && !editing) {
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

  // Wire global keyboard shortcuts for editor
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

  // ========================================================================
  // Effects - UI Initialization & Spinners
  // ========================================================================

  // Initialize spinner on editor container
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

  // ========================================================================
  // Effects - Navigation & Unsaved Changes Detection
  // ========================================================================

  // Show leave dialog when navigation is blocked with dirty changes
  useEffect(() => {
    if (blocker.state === 'blocked') {
      // If execution is running, stop it silently before confirming navigation
      try { workflowExecutionRef.current?.stopExecution(true); } catch {}
      setShowLeaveDialog(true);
    }
  }, [blocker.state]);

  // Warn user about unsaved changes on refresh/close
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

  // ========================================================================
  // Effects - Chat & Execution Listeners
  // ========================================================================

  // Auto-start workflow on chat prompt if Chat trigger exists
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

  // Listen for trigger waiting/resume/clear events for banner
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

  // Ensure chat and form infra is mounted once
  useEffect(() => {
    // Ensure global Form popup host is mounted once
    try { ensureGlobalFormPopupHost(); } catch {}

    const handler = () => setChatOpen(true);
    window.addEventListener('wf:chat:open', handler);

    return () => window.removeEventListener('wf:chat:open', handler);
  }, []);

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className="editor-container" data-theme={theme} ref={editorContainerRef}>
      {/* Header with project name, save, settings, export/import */}
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
      
      {/* Main editor content area */}
      <div className="editor-content">
        {/* Right sidebar - Node configuration panel */}
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

        {/* Chat popup for workflow execution interactions */}
        <ChatPopup 
          open={isChatOpen} 
          onClose={() => setChatOpen(false)} 
          promptSuggestions={chatPromptSuggestions}
        />        

        {/* Left sidebar - Node palette for adding nodes */}
        <NodePaletteSidebar 
          isOpen={nodePaletteSidebarOpen}
          onClose={() => setNodePaletteSidebarOpen(false)}
          onAddNode={handleAddNode}
          paletteFilterContext={paletteFilterContext}
        />
                
        {/* Central diagram rendering area */}
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
            onAddStickyNote={handleAddStickyNoteWrapper}
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
            onAutoAlignNodes={handleAutoAlignWrapper}
            onCanvasClick={() => {
              setUserhandleAddNodeSelectionMode(false)
              resetConnectorInsertMode();
              setNodePaletteSidebarOpen(false);
              setNodeConfigPanelOpen(false);
              setPaletteFilterContext({ mode: 'default' });
            }}
          />
        </div>
        
        {/* Banner shown when waiting for trigger event during execution */}
        <div className={`trigger-start-notification ${waitingTrigger.active ? 'active' : ''}`}>
          <MessageComponent severity="Info" cssClass="e-content-center" showIcon={false} title={waitingTrigger.type + " Trigger"} >
            <span className="spinner-inline" />
            Waiting for trigger event
          </MessageComponent>
        </div>

        {/* Floating toolbar with execution and diagram controls */}
        <div className="editor-toolbar">
          <Toolbar 
            onAction={handleToolbarAction}
            isExecuting={isExecuting}
            isPanActive={isPanActive}
          />
        </div>
      </div>
      
      {/* Toast notifications for save/error/success messages */}
      <Toast />
      
      {/* Confirmation dialog shown when leaving with unsaved changes */}
      <ConfirmationDialog
        isOpen={showLeaveDialog}
        onDismiss={() => {
          // Stay on page - do nothing
          setShowLeaveDialog(false);
          if (blocker.state === 'blocked') {
            blocker.reset();
          }
        }}
        onConfirm={() => {
          // Save and navigate
          try { workflowExecutionRef.current?.stopExecution(true); } catch {}
          handleSave();
          setShowLeaveDialog(false);
          if (blocker.state === 'blocked') {
            blocker.proceed();
          }
        }}
        onClose={() => {
          // Discard and navigate
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