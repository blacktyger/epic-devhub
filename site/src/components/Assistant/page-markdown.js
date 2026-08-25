/**
 * Turns a rendered documentation page back into Markdown, for "Copy page".
 *
 * Reads the DOM rather than the source `.mdx` on purpose. These pages use `remark-code-import`, so
 * the source contains `file=` references rather than the code itself, plus MDX components whose output
 * exists only after rendering. Copying the source would hand somebody a file that does not match the
 * page they are looking at. The rendered tree has the code resolved and the components expanded.
 *
 * Loaded through a dynamic import from PageActions, so none of this is in the payload every page
 * declares. Nothing here touches the network or the clipboard; it is a pure function of a DOM node.
 *
 * Fidelity is deliberately partial. It covers what this corpus actually contains: headings,
 * paragraphs, lists, fenced code with its language, tables, blockquotes, admonitions and inline
 * emphasis. It is not a general HTML to Markdown converter and should not grow into one.
 */

/** Chrome that is part of the page furniture rather than the prose. */
const SKIP_TAGS = new Set(['BUTTON', 'SCRIPT', 'STYLE', 'NAV', 'SVG', 'NOSCRIPT']);

const HEADINGS = {H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6};

/** Wrappers whose own tag means nothing and whose children are the content. */
const TRANSPARENT = new Set([
  'DIV',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'MAIN',
  'FIGURE',
  'DETAILS',
  'SUMMARY',
  'SPAN',
]);

export default function articleToMarkdown(root, meta = {}) {
  const body = childBlocks(root).trim();
  const head = meta.url ? `Source: ${meta.url}` : '';
  return [head, body].filter(Boolean).join('\n\n').concat('\n');
}

/* ------------------------------------------------------------------ blocks */

function skip(el) {
  if (SKIP_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute('data-epic-page-actions')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  // Tab strips are navigation for the panels below them, not content.
  if (el.getAttribute('role') === 'tablist') return true;
  if (el.classList.contains('hash-link')) return true;
  return false;
}

function childBlocks(node) {
  const out = [];
  for (const child of node.children) {
    const md = block(child);
    if (md) out.push(md);
  }
  return out.join('\n\n');
}

function block(el) {
  if (skip(el)) return '';

  const level = HEADINGS[el.tagName];
  if (level) {
    const text = inline(el);
    return text ? `${'#'.repeat(level)} ${text}` : '';
  }

  switch (el.tagName) {
    case 'P':
      return inline(el);
    case 'PRE':
      return fence(el);
    case 'UL':
      return list(el, false, 0);
    case 'OL':
      return list(el, true, 0);
    case 'TABLE':
      return table(el);
    case 'HR':
      return '---';
    case 'BLOCKQUOTE':
      return prefixLines(childBlocks(el), '> ');
    case 'DL':
      return childBlocks(el);
    case 'DT':
      return `**${inline(el)}**`;
    case 'DD':
      return inline(el);
    default:
      if (TRANSPARENT.has(el.tagName)) return childBlocks(el);
      // Anything else: recurse if it wraps elements, otherwise treat it as a line of prose.
      return el.children.length ? childBlocks(el) : inline(el);
  }
}

function prefixLines(text, prefix) {
  return text
    .split('\n')
    .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
    .join('\n');
}

function indentLines(text, depth) {
  const pad = '  '.repeat(depth);
  return text
    .split('\n')
    .map((line) => (line ? `${pad}${line}` : line))
    .join('\n');
}

/* ------------------------------------------------------------------ code */

function fence(pre) {
  const code = pre.querySelector('code');
  const language = languageOf(pre) || languageOf(code) || '';
  return `\`\`\`${language}\n${codeText(pre)}\n\`\`\``;
}

function languageOf(el) {
  if (!el) return '';
  for (const name of el.classList) {
    if (name.startsWith('language-')) return name.slice('language-'.length);
  }
  return '';
}

/**
 * prism-react-renderer emits one span per line and relies on CSS to break them, so `textContent`
 * would run the whole block onto a single line. Rebuild from the line elements when they are there.
 */
function codeText(pre) {
  const lines = pre.querySelectorAll('.token-line');
  if (lines.length) return Array.from(lines, (line) => line.textContent ?? '').join('\n');
  return (pre.textContent ?? '').replace(/\n+$/, '');
}

/* ------------------------------------------------------------------ lists */

function list(el, ordered, depth) {
  const items = Array.from(el.children).filter((child) => child.tagName === 'LI');
  return items
    .map((li, index) => listItem(li, ordered ? `${index + 1}. ` : '- ', depth))
    .filter(Boolean)
    .join('\n');
}

function listItem(li, marker, depth) {
  const lead = [];
  const trailing = [];

  for (const child of li.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      lead.push(child.nodeValue ?? '');
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    if (skip(child)) continue;

    if (child.tagName === 'UL' || child.tagName === 'OL') {
      trailing.push(list(child, child.tagName === 'OL', depth + 1));
    } else if (child.tagName === 'PRE' || child.tagName === 'TABLE' || child.tagName === 'BLOCKQUOTE') {
      trailing.push(indentLines(block(child), depth + 1));
    } else if (child.tagName === 'P') {
      lead.push(inline(child));
    } else {
      lead.push(inlineElement(child));
    }
  }

  const text = collapse(lead.join(' '));
  const pad = '  '.repeat(depth);
  const head = text ? `${pad}${marker}${text}` : '';
  return [head, ...trailing].filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ tables */

function table(el) {
  const rows = Array.from(el.querySelectorAll('tr'));
  if (!rows.length) return '';

  const cells = (row) =>
    Array.from(row.children).map((cell) => inline(cell).replace(/\|/g, '\\|') || ' ');

  const header = cells(rows[0]);
  const body = rows.slice(1).map(cells);

  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

/* ------------------------------------------------------------------ inline */

/** Collapses runs of whitespace but keeps deliberate line breaks from `<br>`. */
function collapse(text) {
  return text.replace(/[^\S\n]+/g, ' ').trim();
}

function inline(node) {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.nodeValue ?? '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      out += inlineElement(child);
    }
  }
  return collapse(out);
}

function inlineElement(el) {
  if (skip(el)) return '';

  switch (el.tagName) {
    case 'CODE':
      return `\`${el.textContent ?? ''}\``;
    case 'A': {
      const label = inline(el);
      const href = el.getAttribute('href');
      return href && label ? `[${label}](${absolute(href)})` : label;
    }
    case 'STRONG':
    case 'B':
      return `**${inline(el)}**`;
    case 'EM':
    case 'I':
      return `_${inline(el)}_`;
    case 'DEL':
    case 'S':
      return `~~${inline(el)}~~`;
    case 'BR':
      return '\n';
    case 'IMG':
      return `![${el.getAttribute('alt') ?? ''}](${absolute(el.getAttribute('src') ?? '')})`;
    case 'KBD':
      return `\`${el.textContent ?? ''}\``;
    default:
      return inline(el);
  }
}

/** Site-relative links are useless once pasted somewhere else. */
function absolute(url) {
  if (!url) return '';
  if (url.startsWith('/') && typeof window !== 'undefined') return `${window.location.origin}${url}`;
  return url;
}
