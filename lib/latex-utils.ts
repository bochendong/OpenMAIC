const DIRECT_UNICODE_MATH_SYMBOLS: Record<string, string> = {
  '\\approx': '≈',
  '\\cap': '∩',
  '\\cdot': '·',
  '\\cup': '∪',
  '\\div': '÷',
  '\\emptyset': '∅',
  '\\exists': '∃',
  '\\forall': '∀',
  '\\geq': '≥',
  '\\in': '∈',
  '\\infty': '∞',
  '\\leq': '≤',
  '\\Leftrightarrow': '⇔',
  '\\neq': '≠',
  '\\nexists': '∄',
  '\\pm': '±',
  '\\Rightarrow': '⇒',
  '\\subset': '⊂',
  '\\subseteq': '⊆',
  '\\supset': '⊃',
  '\\supseteq': '⊇',
  '\\times': '×',
  '\\to': '→',
  '\\varnothing': '∅',
};

/**
 * Normalize model-escaped LaTeX while preserving matrix / array row separators.
 *
 * We only collapse doubled backslashes when they are clearly introducing a command
 * like \\frac or \\begin. Deliberate line breaks such as "\\\\ " or "\\\\[2pt]"
 * stay untouched.
 */
export function normalizeLatexSource(text: string): string {
  let normalized = text.trim();
  let previous = '';

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(/\\\\(?=[^\s\\[])/g, '\\');
  }

  return normalized;
}

export function getDirectUnicodeMathSymbol(text: string): string | null {
  const normalized = normalizeLatexSource(text);
  return DIRECT_UNICODE_MATH_SYMBOLS[normalized] ?? null;
}
