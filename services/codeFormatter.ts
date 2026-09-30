/**
 * Enterprise Vertical Code Formatter & Beautifier
 * Ensures generated Playwright, Appium, Cypress, Selenium, Java, Python, C#,
 * JSON, and XML code is always formatted strictly vertically, line-by-line,
 * with proper indentation, line breaks, and readable structure.
 */

export function formatVerticalCode(code: string, filePath: string = ''): string {
  if (!code || typeof code !== 'string') return code || '';
  let formatted = code;

  // 1. Unescape literal escaped characters if present (from LLM JSON encoding or serialization)
  if (
    formatted.includes('\\n') &&
    (!formatted.includes('\n') || (formatted.match(/\\n/g) || []).length > (formatted.match(/\n/g) || []).length)
  ) {
    formatted = formatted
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\"/g, '"');
  }

  // 2. Format JSON files (e.g. package.json, tsconfig.json)
  const safeFilePath = typeof filePath === 'string' ? filePath : '';
  const isJson = safeFilePath.endsWith('.json') || (
    (formatted.trim().startsWith('{') || formatted.trim().startsWith('[')) &&
    !formatted.includes('class ') &&
    !formatted.includes('import ') &&
    !formatted.includes('function ') &&
    !formatted.includes('export ')
  );

  if (isJson) {
    try {
      const parsed = JSON.parse(formatted);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Fall through to general formatting if JSON parsing fails
    }
  }

  // 3. Format XML / HTML / POM files
  const isXml = safeFilePath.endsWith('.xml') || safeFilePath.endsWith('.html') || (
    formatted.trim().startsWith('<') && formatted.trim().endsWith('>') && !formatted.includes('import ')
  );

  if (isXml) {
    try {
      let formattedXml = '';
      let indent = 0;
      const pad = '  ';
      // Normalize single line xml tags
      const xmlStr = formatted.replace(/>\s*</g, '><');
      const tokens = xmlStr.split(/(<\/?[^>]+>)/g).filter(t => t.trim().length > 0);
      for (const token of tokens) {
        if (token.startsWith('</')) {
          indent = Math.max(0, indent - 1);
          formattedXml += pad.repeat(indent) + token + '\n';
        } else if (token.startsWith('<') && !token.endsWith('/>') && !token.startsWith('<?') && !token.startsWith('<!')) {
          formattedXml += pad.repeat(indent) + token + '\n';
          indent++;
        } else {
          formattedXml += pad.repeat(indent) + token.trim() + '\n';
        }
      }
      if (formattedXml.trim()) return formattedXml.trim();
    } catch {
      // Fall through
    }
  }

  // 4. Normalize line endings
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Check if code is already properly formatted across many vertical lines
  const existingLines = formatted.split('\n');
  const isSingleOrFewLines = existingLines.length <= 4 && formatted.length > 80;
  const hasMultipleImportsOnSingleLine = existingLines.some(l => (l.match(/import\s+/g) || []).length > 1);
  const hasDenseConsecutiveStatements = existingLines.some(l => (l.match(/;\s*(?:const|let|var|await|import|export|return|this|expect|test|describe|it|class|if|for)\b/g) || []).length >= 1);
  const hasBraceAndStatementOnSingleLine = existingLines.some(l => (l.match(/\{\s*(?:test|const|let|await|this|return|constructor|async|super)\b/g) || []).length >= 1);

  // If code is already nicely laid out with lots of lines and no horizontal grouping, return cleaned version
  if (!isSingleOrFewLines && !hasMultipleImportsOnSingleLine && !hasDenseConsecutiveStatements && !hasBraceAndStatementOnSingleLine) {
    return formatted
      .split('\n')
      .map(line => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // 5. Token & Boundary restructuring for vertical display
  // Break separate import / export statements onto distinct lines
  formatted = formatted.replace(/;\s*(import\s+)/g, ';\n$1');
  formatted = formatted.replace(/;\s*(export\s+)/g, ';\n\n$1');

  // Break test suites, describes, hooks, and tests onto new lines
  formatted = formatted.replace(/;\s*(test\.describe|describe|test|it|beforeEach|afterEach|beforeAll|afterAll)\s*\(/g, ';\n\n$1(');
  formatted = formatted.replace(/\{\s*(test\.describe|describe|test|it|beforeEach|afterEach|beforeAll|afterAll)\s*\(/g, '{\n  $1(');

  // Break class and constructor definitions onto new lines
  formatted = formatted.replace(/;\s*(export\s+class\s+|class\s+)/g, ';\n\n$1');
  formatted = formatted.replace(/\{\s*(constructor\s*\(|async\s+|public\s+|private\s+|protected\s+)/g, '{\n  $1');

  // Break methods following closing braces
  formatted = formatted.replace(/\}\s*(async\s+|constructor\s*\(|public\s+|private\s+|protected\s+|[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{)/g, '}\n\n$1');

  // Break statements after arrow functions or open braces: () => { ... or { const ...
  formatted = formatted.replace(/(=>|\))\s*\{\s*(const|let|var|await|return|this|expect|test|describe|it|if|for|super)\b/g, '$1 {\n$2');
  formatted = formatted.replace(/\{\s*(const|let|var|await|return|this|expect|super)\b/g, '{\n$1');

  // Break statements before variable definitions, await calls, returns, page actions
  formatted = formatted.replace(/;\s*(const\s+|let\s+|var\s+|await\s+|return\s+|yield\s+)/g, ';\n$1');
  formatted = formatted.replace(/;\s*(this\.)/g, ';\n$1');
  formatted = formatted.replace(/;\s*(expect\s*\()/g, ';\n$1(');
  formatted = formatted.replace(/;\s*(super\s*\()/g, ';\n$1(');

  // Break after closing braces
  formatted = formatted.replace(/\}\s*;\s*(test\.describe|describe|test|it|class|export|const|let|var|await)\b/g, '};\n\n$1');
  formatted = formatted.replace(/\}\s*(test\.describe|describe|test|it|class|export)\b/g, '}\n\n$1');
  formatted = formatted.replace(/\}\s*\)\s*;\s*(test\b|describe\b|it\b)/g, '});\n\n$1');
  formatted = formatted.replace(/;\s*\}\s*$/g, ';\n}');
  formatted = formatted.replace(/;\s*\}/g, ';\n}');

  // Break multiple consecutive closing braces on the same line onto separate lines
  formatted = formatted.replace(/\}[ \t]*(?=\})/g, '}\n');

  // 6. Intelligent indentation re-alignment
  const rawLines = formatted.split('\n');
  const indentedLines: string[] = [];
  let indent = 0;
  const indentStep = '  ';

  for (let rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) {
      indentedLines.push('');
      continue;
    }

    // Adjust indent for closing braces at start of line
    const startsWithClose = line.startsWith('}') || line.startsWith('});') || line.startsWith(']') || line.startsWith(');');
    const currentIndent = Math.max(0, indent - (startsWithClose ? 1 : 0));
    indentedLines.push(indentStep.repeat(currentIndent) + line);

    // Calculate open and close brace delta for subsequent lines
    let openCount = 0;
    let closeCount = 0;
    let inStr: string | null = null;

    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      const prev = j > 0 ? line[j - 1] : '';

      if (inStr) {
        if (c === inStr && prev !== '\\') {
          inStr = null;
        }
      } else {
        if (c === '\'' || c === '"' || c === '`') {
          inStr = c;
        } else if (c === '/' && line[j + 1] === '/') {
          break; // Rest of line is comment
        } else if (c === '{') {
          openCount++;
        } else if (c === '}') {
          closeCount++;
        }
      }
    }

    indent = Math.max(0, indent + openCount - closeCount);
  }

  return indentedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Formats all files inside a GeneratedProject or script files array
 */
export function formatProjectFiles<T extends { path: string; content?: string }>(files: T[]): T[] {
  if (!Array.isArray(files)) return [];
  return files.map(file => ({
    ...file,
    content: formatVerticalCode(file.content || '', file.path)
  }));
}
