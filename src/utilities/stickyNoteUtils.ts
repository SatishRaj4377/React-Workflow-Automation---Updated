import { DiagramComponent, NodeModel } from "@syncfusion/ej2-react-diagrams";

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