/**
 * Converts RTE HTML to proper DOCX Word-ML format with preserved formatting.
 * Handles bold, italic, underline, colors, lists, tables, and other formatting.
 */
export async function createDocxFromHtml(htmlContent: string): Promise<Blob> {
  const { default: PizZip } = await import('pizzip');
  

  // Convert RTE HTML to Word-ML preserving formatting
  const wordML = htmlToWordML(htmlContent);

  // Minimal DOCX structure with the converted content
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${wordML}
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  // Create ZIP structure
  const zip = new (PizZip as any)();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.folder('_rels').file('.rels', relsXml);
  zip.folder('word').file('document.xml', documentXml);
  zip.folder('word/_rels').file('document.xml.rels', docRelsXml);

  // Generate and return as Blob
  return zip.generate({ type: 'blob' });
}

/**
 * Append HTML content to an existing DOCX while preserving the original formatting.
 * Converts HTML to WordML and injects it at the end of word/document.xml inside w:body.
 */
export async function appendHtmlToDocx(existingDocx: ArrayBuffer, htmlContent: string): Promise<Blob> {
  const { default: PizZip } = await import('pizzip');
  try {
    const zip = new PizZip(existingDocx);
    const docFile = zip.file('word/document.xml');
    if (!docFile) {
      // Fallback to new doc if missing
      return await createDocxFromHtml(htmlContent);
    }
    const xml = docFile.asText();

    const newWordML = htmlToWordML(htmlContent);
    const separator = '<w:p></w:p><w:p></w:p>';

    const bodyCloseIdx = xml.lastIndexOf('</w:body>');
    if (bodyCloseIdx === -1) {
      return await createDocxFromHtml(htmlContent);
    }
    const updatedXml = xml.slice(0, bodyCloseIdx) + separator + newWordML + xml.slice(bodyCloseIdx);
    zip.folder('word')!.file('document.xml', updatedXml);
    return zip.generate({ type: 'blob' });
  } catch {
    return await createDocxFromHtml(htmlContent);
  }
}

/**
 * Converts RTE HTML to Word-ML (WordprocessingML) format.
 * Preserves formatting: bold, italic, underline, colors, lists, tables, etc.
 */
function htmlToWordML(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  
  const result: string[] = [];
  
  // Process root children (paragraphs, lists, tables)
  const rootDiv = doc.documentElement.querySelector('div');
  if (rootDiv) {
    for (const node of Array.from(rootDiv.childNodes)) {
      const wordML = nodeToWordML(node as Node);
      if (wordML) result.push(wordML);
    }
  }

  return result.join('\n');
}

/**
 * Recursively convert HTML nodes to Word-ML.
 */
function nodeToWordML(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent || '').trim();
    if (!text) return '';
    // Wrap text in a paragraph with proper escaping
    return `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'p':
      return handleParagraph(el);
    case 'br':
      return '<w:p></w:p>';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return handleHeading(el, tag);
    case 'ul':
    case 'ol':
      return handleList(el, tag === 'ol');
    case 'li':
      return handleListItem(el);
    case 'table':
      return handleTable(el);
    case 'strong':
    case 'b':
      return handleBold(el);
    case 'em':
    case 'i':
      return handleItalic(el);
    case 'u':
      return handleUnderline(el);
    case 'a':
      return handleLink(el);
    case 'blockquote':
      return handleBlockquote(el);
    default:
      // For unknown tags, process children
      return Array.from(el.childNodes)
        .map(n => nodeToWordML(n))
        .filter(Boolean)
        .join('\n');
  }
}

function handleParagraph(el: HTMLElement): string {
  const runs = extractRuns(el);
  const pPr = getParagraphProperties(el);
  return `<w:p>${pPr}<w:pPr><w:spacing w:line="240"/></w:pPr>${runs}</w:p>`;
}

function handleHeading(el: HTMLElement, tag: string): string {
  const level = parseInt(tag[1]);
  const runs = extractRuns(el);
  const pPr = `<w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>`;
  return `<w:p>${pPr}${runs}</w:p>`;
}

function handleList(el: HTMLElement, isOrdered: boolean): string {
  const items: string[] = [];
  let index = 1;
  
  for (const li of Array.from(el.querySelectorAll(':scope > li'))) {
    const bullet = isOrdered ? `${index}.` : '•';
    const text = (li.textContent || '').trim();
    items.push(`<w:p><w:pPr><w:ind w:left="720"/></w:pPr><w:r><w:t>${bullet} ${escapeXml(text)}</w:t></w:r></w:p>`);
    index++;
  }
  
  return items.join('\n');
}

function handleListItem(el: HTMLElement): string {
  const runs = extractRuns(el);
  return `<w:p><w:pPr><w:ind w:left="720"/></w:pPr>${runs}</w:p>`;
}

function handleTable(el: HTMLElement): string {
  const rows: string[] = [];
  
  for (const tr of Array.from(el.querySelectorAll('tr'))) {
    const cells: string[] = [];
    const isHeader = tr.querySelector('th') !== null;
    
    for (const td of Array.from(tr.querySelectorAll('td, th'))) {
      const text = (td.textContent || '').trim();
      const cellPr = isHeader 
        ? '<w:tcPr><w:shd w:fill="D3D3D3"/></w:tcPr>' 
        : '';
      cells.push(`<w:tc>${cellPr}<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p></w:tc>`);
    }
    
    rows.push(`<w:tr>${cells.join('')}</w:tr>`);
  }
  
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="auto"/></w:tblPr>${rows.join('')}</w:tbl>`;
}

function handleBold(el: HTMLElement): string {
  const text = (el.textContent || '').trim();
  return `<w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r>`;
}

function handleItalic(el: HTMLElement): string {
  const text = (el.textContent || '').trim();
  return `<w:r><w:rPr><w:i/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r>`;
}

function handleUnderline(el: HTMLElement): string {
  const text = (el.textContent || '').trim();
  return `<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r>`;
}

function handleLink(el: HTMLElement): string {
  const href = el.getAttribute('href') || '';
  const text = (el.textContent || '').trim();
  return `<w:hyperlink w:anchor="${escapeXml(href)}"><w:r><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr><w:t>${escapeXml(text)}</w:t></w:r></w:hyperlink>`;
}

function handleBlockquote(el: HTMLElement): string {
  const runs = extractRuns(el);
  const pPr = '<w:pPr><w:ind w:left="720"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="1" w:color="D3D3D3"/></w:pBdr></w:pPr>';
  return `<w:p>${pPr}${runs}</w:p>`;
}

function extractRuns(el: HTMLElement): string {
  const runs: string[] = [];
  
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent || '').trim();
      if (text) {
        runs.push(`<w:r><w:t>${escapeXml(text)}</w:t></w:r>`);
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName.toLowerCase();
      
      if (['strong', 'b'].includes(tag)) {
        runs.push(`<w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml((child.textContent || '').trim())}</w:t></w:r>`);
      } else if (['em', 'i'].includes(tag)) {
        runs.push(`<w:r><w:rPr><w:i/></w:rPr><w:t>${escapeXml((child.textContent || '').trim())}</w:t></w:r>`);
      } else if (tag === 'u') {
        runs.push(`<w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>${escapeXml((child.textContent || '').trim())}</w:t></w:r>`);
      }
    }
  }
  
  return runs.join('');
}

function getParagraphProperties(el: HTMLElement): string {
  const style = el.getAttribute('style') || '';
  const alignment = style.includes('center') ? 'center' : style.includes('right') ? 'right' : 'left';
  return alignment !== 'left' ? `<w:pPr><w:jc w:val="${alignment}"/></w:pPr>` : '';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Trigger a browser download for a Blob with the given filename.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
