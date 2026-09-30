import mammoth from 'mammoth';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

/**
 * Parses any uploaded document file (.docx, .doc, .xlsx, .xls, .pdf, .txt, .md, etc.)
 * into clean, formatted human-readable text as it is in the given input document.
 */
export async function parseDocumentFile(file: File): Promise<string> {
  const fileName = file.name;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // 1. Word Document (.docx)
  if (ext === 'docx') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      if (result.value && result.value.trim().length > 0) {
        return result.value.trim();
      }
      // JSZip fallback if mammoth returns empty
      const zipText = await extractDocxWithJSZip(arrayBuffer);
      if (zipText) return zipText;
    } catch (err) {
      console.warn("Mammoth docx parsing failed, attempting JSZip fallback:", err);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const zipText = await extractDocxWithJSZip(arrayBuffer);
        if (zipText) return zipText;
      } catch (zipErr) {
        console.error("JSZip fallback failed:", zipErr);
      }
    }
  }

  // 2. Excel Spreadsheets (.xlsx, .xls)
  if (ext === 'xlsx' || ext === 'xls') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      let sheetsText = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        if (csv.trim()) {
          sheetsText += `[Sheet: ${sheetName}]\n${csv.trim()}\n\n`;
        }
      });
      if (sheetsText.trim()) return sheetsText.trim();
    } catch (err) {
      console.warn("Excel parsing failed:", err);
    }
  }

  // 3. PDF Files (.pdf)
  if (ext === 'pdf') {
    try {
      const text = await file.text();
      const extracted = extractPdfText(text, fileName);
      if (extracted) return extracted;
    } catch (err) {
      console.warn("PDF parsing failed:", err);
    }
  }

  // 4. Plain Text Files (.txt, .md, .csv, .json, .html, .xml, .log)
  try {
    const text = await file.text();
    if (text.startsWith('PK') || /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 300))) {
      return sanitizeAndExtractDocContent(text, fileName);
    }
    return text.trim();
  } catch (err) {
    console.error("FileReader text reading failed:", err);
    return `[Attached Document: ${fileName}]`;
  }
}

/**
 * JSZip fallback helper to parse word/document.xml from a .docx binary array buffer
 */
export async function extractDocxWithJSZip(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXml = zip.file('word/document.xml');
  if (!docXml) return '';

  const xmlText = await docXml.async('text');
  return parseWordXmlText(xmlText);
}

/**
 * Extracts formatted text lines from word/document.xml string
 */
export function parseWordXmlText(xmlText: string): string {
  if (!xmlText) return '';

  // Extract paragraphs <w:p>
  const paragraphs: string[] = [];
  const pMatches = xmlText.match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];

  for (const p of pMatches) {
    // Extract all text elements <w:t> in this paragraph
    const tMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/g) || [];
    const line = tMatches.map(t => {
      return t
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
    }).join('');

    if (line.trim()) {
      paragraphs.push(line.trim());
    }
  }

  if (paragraphs.length > 0) {
    return paragraphs.join('\n\n');
  }

  // Fallback: strip tags
  return xmlText
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts printable text strings from raw PDF text stream
 */
export function extractPdfText(rawPdfText: string, fileName: string): string {
  const matches: string[] = [];
  const textGroupRegex = /\(([^()]{2,1000})\)/g;
  let match;
  while ((match = textGroupRegex.exec(rawPdfText)) !== null) {
    const extracted = match[1].replace(/\\[nrtbf]/g, ' ').trim();
    if (
      extracted.length > 2 && 
      /^[a-zA-Z0-9\s.,;:!?'"-/()#@$&%*+=\[\]{}<>\/]+$/.test(extracted) && 
      !extracted.includes('/Font') && 
      !extracted.includes('/Type') &&
      !extracted.includes('/Catalog') &&
      !extracted.includes('Identity')
    ) {
      matches.push(extracted);
    }
  }

  if (matches.length > 3) {
    const uniqueLines = Array.from(new Set(matches));
    return uniqueLines.join('\n');
  }

  const cleaned = rawPdfText
    .replace(/%PDF-[\s\S]*?obj/gi, '')
    .replace(/<<[\s\S]*?>>/gi, '')
    .replace(/stream[\s\S]*?endstream/gi, '')
    .replace(/xref[\s\S]*?trailer/gi, '')
    .replace(/[^\x20-\x7E\n\r]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > 20) {
    return cleaned;
  }

  return `Document (${fileName || 'Requirements.pdf'})\n\nRequirements specification document attached for AI scenario synthesis.`;
}

/**
 * Sanitizes and extracts readable content if raw text contains binary zip headers (PK...) or raw XML/PDF syntax
 */
export function sanitizeAndExtractDocContent(rawText: string, fileName: string = ''): string {
  if (!rawText) return '';
  const trimmed = rawText.trim();

  // Handle Zip / Docx binary data (starts with PK\x03\x04 or contains word/document.xml / [Content_Types].xml)
  if (trimmed.startsWith('PK') || trimmed.includes('[Content_Types].xml') || trimmed.includes('word/document.xml')) {
    // Try to extract text inside <w:t> or <w:p> XML tags if word/document.xml string is in rawText
    if (trimmed.includes('word/document.xml') || trimmed.includes('<w:t')) {
      const extracted = parseWordXmlText(trimmed);
      if (extracted && !extracted.startsWith('PK')) return extracted;
    }

    // Try extracting clean text inside XML tags or parenthesis
    const xmlTagMatches: string[] = [];
    const tTagRegex = /<w:t[^>]*>(.*?)<\/w:t>/gi;
    let tMatch;
    while ((tMatch = tTagRegex.exec(trimmed)) !== null) {
      const val = tMatch[1].replace(/<[^>]+>/g, '').trim();
      if (val.length > 1) xmlTagMatches.push(val);
    }

    if (xmlTagMatches.length > 0) {
      return xmlTagMatches.join('\n\n');
    }

    // Extract readable ASCII string words
    const asciiWords = trimmed
      .replace(/[^\x20-\x7E\n\r]/g, ' ')
      .replace(/PK[\s\S]*?xml/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const cleanWords = asciiWords
      .split(' ')
      .filter(w => w.length > 2 && /^[a-zA-Z0-9.,;:!?'"()-]+$/.test(w) && !w.includes('xml') && !w.includes('rels') && !w.includes('Schema'));

    if (cleanWords.length > 10) {
      return cleanWords.join(' ');
    }

    return `Document File: ${fileName || 'Requirements Document'}\n\nDocument uploaded for AI synthesis.`;
  }

  // Handle PDF raw text
  if (trimmed.startsWith('%PDF') || trimmed.includes('/Type /Catalog') || trimmed.includes('/Font') || trimmed.includes('/Pages')) {
    return extractPdfText(trimmed, fileName);
  }

  return rawText;
}
