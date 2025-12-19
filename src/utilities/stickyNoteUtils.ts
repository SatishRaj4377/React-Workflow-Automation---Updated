import { DiagramComponent, NodeModel, NodeConstraints } from "@syncfusion/ej2-react-diagrams";
import { bringConnectorsToFront } from './diagramUtils';

const NODE_STROKEDASH_ARR = '10 4';

// Global flag to track sticky note editing state
export let isStickyNoteEditing = false;

// Get sticky note template
export const getStickyNoteTemplate = (
  diagram: DiagramComponent,
  node: NodeModel
): HTMLElement => {
  const nodeId = node.id;

  const storedMarkdown =
    (node?.addInfo as any)?.markdown ||
    'Double-click to edit\n\nYou can use **bold**, *italic*, `code`, and\n# Headers\n- Lists';

  const markdownHtml = convertMarkdownToHtml(storedMarkdown);

  // Build the DOM programmatically
  const container = document.createElement('div');
  container.className = 'sticky-note-container';
  container.setAttribute('data-node-id', node.id as any);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'sticky-note-delete-btn e-icons e-trash';
  deleteBtn.id = `delete-${nodeId}`;
  deleteBtn.title = 'Delete sticky note';

  const content = document.createElement('div');
  content.className = 'sticky-note-content';

  const preview = document.createElement('div');
  preview.className = 'markdown-preview';
  preview.id = `preview-${nodeId}`;
  preview.style.display = 'block';
  // Preserve spaces & line breaks and still wrap
  preview.style.whiteSpace = 'pre-wrap';
  preview.style.wordWrap = 'break-word';

  // Inject the converted HTML
  preview.innerHTML = markdownHtml;

  const editor = document.createElement('textarea');
  editor.className = 'markdown-editor';
  editor.id = `editor-${nodeId}`;
  editor.style.display = 'none';
  editor.placeholder = 'Type your markdown here...';

  content.appendChild(preview);
  content.appendChild(editor);
  container.appendChild(deleteBtn);
  container.appendChild(content);

  return container;
};

// Simple markdown to HTML converter for sticky node
export const convertMarkdownToHtml = (markdown: string): string => {
  if (!markdown) return '';

  return markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code
    .replace(/`(.*?)`/g, '<code>$1</code>')
    // Lists
    .replace(/^- (.*$)/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
    // Line Break
    .replace(/\n/g, '<br>');
};

// Initialize sticky note node with styling and event handlers
export const initializeStickyNote = (
  stickyNode: NodeModel,
  diagramRef: React.RefObject<DiagramComponent | null>
): void => {
  // Setup markdown editor template
  stickyNode.annotations = [
    {
      id: 'annotation',
      width: stickyNode.width,
      height: stickyNode.height,
      horizontalAlignment: 'Stretch',
      verticalAlignment: 'Stretch',
      template: diagramRef.current
        ? getStickyNoteTemplate(diagramRef.current, stickyNode)
        : '<div>Loading sticky note...</div>',
    },
  ];

  // Attach delete button handler
  setTimeout(() => {
    attachStickyNoteDeleteHandler(stickyNode, diagramRef);
  }, 0);

  // Apply sticky note styling
  applyStickyNoteStyle(stickyNode);

  // Set default dimensions
  setStickyNoteDimensions(stickyNode);

  // Position sticky note behind other nodes
  setTimeout(() => {
    setStickyNoteZIndex(stickyNode, diagramRef);
  });
};

// Apply visual styling to sticky note
const applyStickyNoteStyle = (stickyNode: NodeModel): void => {
  stickyNode.style = {
    fill: 'var(--sticky-note-bg-color)',
    strokeColor: 'var(--sticky-note-stroke-color)',
    strokeWidth: 2,
    strokeDashArray: NODE_STROKEDASH_ARR,
    opacity: 0.7,
  };
  stickyNode.shape = { cornerRadius: 15 };
};

// Set minimum and default dimensions for sticky note
const setStickyNoteDimensions = (stickyNode: NodeModel): void => {
  stickyNode.minWidth = 160;
  stickyNode.minHeight = 80;

  // Preserve existing dimensions if loaded from saved state
  if (!stickyNode.width || stickyNode.width < 160) {
    stickyNode.width = 200;
  }
  if (!stickyNode.height || stickyNode.height < 80) {
    stickyNode.height = 120;
  }
};

// Attach delete button click event handler
const attachStickyNoteDeleteHandler = (
  stickyNode: NodeModel,
  diagramRef: React.RefObject<DiagramComponent | null>
): void => {
  const deleteBtn = document.getElementById(`delete-${stickyNode.id}`);
  if (deleteBtn && diagramRef.current) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      diagramRef.current?.remove(stickyNode);
    });
  }
};

// Set z-index to position sticky note behind other elements
export const setStickyNoteZIndex = (
  stickyNode: NodeModel,
  diagramRef: React.RefObject<DiagramComponent | null>
): void => {
  const Z_INDEX = -10000;

  if (stickyNode.id && diagramRef.current) {
    // Update DOM z-index for sticky note
    const stickyNodeElement = document.getElementById(`${stickyNode.id}_annotation_html_element`);
    if (stickyNodeElement) {
      stickyNodeElement.style.zIndex = Z_INDEX.toString();
    }

    // Bring connectors to front to avoid overlap
    bringConnectorsToFront(diagramRef.current);
  }
};

// Handle sticky note edit mode activation and markdown editing
export const handleStickyNoteEditMode = (node: NodeModel): void => {
  const preview = document.getElementById(`preview-${node.id}`);
  const editor = document.getElementById(`editor-${node.id}`) as HTMLTextAreaElement;

  if (!preview || !editor) return;

  // Switch to edit mode
  const storedMarkdown =
    (node.addInfo as any)?.markdown ||
    'Double-click to edit\n\nYou can use **bold**, *italic*, `code`, and\n# Headers\n- Lists';

  node.constraints = NodeConstraints.None;
  preview.style.display = 'none';
  editor.style.display = 'block';
  editor.value = storedMarkdown;
  editor.focus();

  isStickyNoteEditing = true;

  // Prevent diagram keyboard shortcuts while editing
  const keyDownBlocker = (e: KeyboardEvent) => {
    e.stopPropagation();
    const blockedKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'Delete', 'Backspace', 'Tab'];
    if (blockedKeys.includes(e.key)) {
      e.stopPropagation();
    }
  };

  editor.addEventListener('keydown', keyDownBlocker);

  // Handle blur to save content
  const handleBlur = () => {
    saveStickyNoteContent(node, editor, preview);
    editor.removeEventListener('keydown', keyDownBlocker);
    editor.removeEventListener('blur', handleBlur);
    editor.removeEventListener('keydown', handleEscapeKey);
    isStickyNoteEditing = false;
  };

  // Handle Escape key to cancel editing
  const handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      editor.blur();
    }
  };

  editor.addEventListener('blur', handleBlur);
  editor.addEventListener('keydown', handleEscapeKey);
};

// Save sticky note markdown content and switch back to preview mode
const saveStickyNoteContent = (
  node: NodeModel,
  editor: HTMLTextAreaElement,
  preview: HTMLElement
): void => {
  const markdownContent = editor.value;
  const htmlContent = convertMarkdownToHtml(markdownContent);

  // Update preview with rendered HTML
  preview.innerHTML = htmlContent;

  // Switch back to preview mode
  editor.style.display = 'none';
  preview.style.display = 'block';

  // Persist markdown content to node
  if (!node.addInfo) node.addInfo = {};
  (node.addInfo as any).markdown = markdownContent;

  // Restore node constraints
  node.constraints =
    NodeConstraints.Default &
    ~NodeConstraints.Rotate &
    ~NodeConstraints.InConnect &
    ~NodeConstraints.OutConnect;
};