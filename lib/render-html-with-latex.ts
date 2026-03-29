import katex from 'katex';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeDelimiterEscapes(text: string): string {
  return text.replace(/\\\\(?=[()[\]])/g, '\\');
}

function normalizeMathSource(text: string): string {
  return text.replace(/\\\\/g, '\\').trim();
}

function looksLikeMathText(text: string): boolean {
  return /\\\(|\\\[|\$\$|\$[^$\n]+?\$|\\\\\(|\\\\\[/.test(text);
}

const MATH_PATTERN =
  /\\\[((?:[\s\S]+?))\\\]|\\\(((?:[\s\S]+?))\\\)|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

function renderMathFragment(raw: string, displayMode: boolean): string {
  const latex = normalizeMathSource(raw);
  if (!latex) return '';

  const rendered = katex.renderToString(latex, {
    throwOnError: false,
    displayMode,
    output: 'html',
    strict: 'ignore',
  });

  if (!displayMode) return rendered;
  return `<span style="display:block;text-align:center;margin:0.2em 0;">${rendered}</span>`;
}

function renderTextWithLatex(text: string): string | null {
  if (!looksLikeMathText(text)) return null;

  const normalized = normalizeDelimiterEscapes(text);
  let html = '';
  let lastIndex = 0;
  let changed = false;

  normalized.replace(
    MATH_PATTERN,
    (match, bracketDisplay, parenInline, dollarDisplay, dollarInline, offset) => {
      const index = typeof offset === 'number' ? offset : 0;
      if (index > lastIndex) {
        html += escapeHtml(normalized.slice(lastIndex, index));
      }

      const rawMath = bracketDisplay ?? parenInline ?? dollarDisplay ?? dollarInline ?? '';
      const displayMode = bracketDisplay !== undefined || dollarDisplay !== undefined;
      try {
        html += renderMathFragment(rawMath, displayMode);
        changed = true;
      } catch {
        html += escapeHtml(match);
      }

      lastIndex = index + match.length;
      return match;
    },
  );

  if (!changed) return null;
  if (lastIndex < normalized.length) {
    html += escapeHtml(normalized.slice(lastIndex));
  }

  return html;
}

export function renderHtmlWithLatex(html: string): string {
  if (!html || !looksLikeMathText(html) || typeof document === 'undefined') return html;

  const root = document.createElement('div');
  root.innerHTML = html;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue && looksLikeMathText(node.nodeValue)) {
      textNodes.push(node);
    }
  }

  for (const node of textNodes) {
    const rendered = renderTextWithLatex(node.nodeValue || '');
    if (!rendered) continue;

    const temp = document.createElement('span');
    temp.innerHTML = rendered;

    const fragment = document.createDocumentFragment();
    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }
    node.replaceWith(fragment);
  }

  return root.innerHTML;
}
