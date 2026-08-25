import React, {useState, useCallback, useMemo} from 'react';
import {Streamdown} from 'streamdown';
import 'streamdown/styles.css';

/**
 * Streaming markdown for an assistant answer.
 *
 * The `components` overrides below are mandatory, not cosmetic. A spike against streamdown 2.6.0
 * found two defaults that are wrong for this use:
 *
 *   - a markdown link renders as `<button type="button">` with no href at all, so a citation would
 *     not be navigable, middle-clickable, copyable or announced as a link
 *   - `**bold**` renders as `<span>`, losing emphasis semantics
 *
 * Both are recoverable because the href is passed through to an override; streamdown simply chooses
 * not to render an anchor. If either override is removed, every citation silently stops being a link.
 * That is the single most important thing to preserve in this file.
 *
 * `security` is also required. The default link and image policy is allow-all, so a model-emitted
 * image URL would make the reader's browser fetch a third-party asset. This site self-hosts its fonts
 * and rejected hosted search specifically to avoid sending reader data to third parties, so an
 * unrestricted image tag would break that stance by construction. The server strips disallowed hosts
 * as well; this is the second layer.
 */

const ALLOWED_LINK_PREFIXES = [
  'https://devdocs.epiccash.com',
  'https://github.com/EpicCash',
  'https://epiccash.com',
  'https://www.epiccash.com',
  'https://t.me/',
  'https://www.reddit.com/r/epiccash',
  'https://explorer.epicmine.io',
  '/',
  '#',
];

const SECURITY = {
  allowedLinkPrefixes: ALLOWED_LINK_PREFIXES,
  // Empty: an assistant answer never needs an image, and every image would be a remote fetch.
  allowedImagePrefixes: [],
  allowedProtocols: ['https', 'mailto'],
  allowDataImages: false,
  defaultOrigin: 'https://devdocs.epiccash.com',
};

/** Internal doc links stay in the SPA; anything external opens in a new tab and says so. */
function AssistantLink({href = '', children, ...rest}) {
  const isInternal =
    href.startsWith('/') ||
    href.startsWith('#') ||
    href.startsWith('https://devdocs.epiccash.com');

  if (isInternal) {
    const path = href.replace('https://devdocs.epiccash.com', '') || '/';
    return (
      <a className="epicChat-link" href={path} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a
      className="epicChat-link epicChat-link--external"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...rest}>
      {children}
      <span className="epicChat-srOnly"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * Code block with a copy action.
 *
 * Copies the source text only. The component contract for this site is explicit that a copy action
 * must never include line numbers or chrome, because the most common way to get this wrong makes every
 * copied command unusable.
 *
 * Copy is disabled while the answer is still streaming, because a half-arrived fence would copy a
 * truncated command, and a truncated command is worse than no command.
 */
function CodeBlock({children, className = '', streaming, ...rest}) {
  const [copied, setCopied] = useState(false);
  const language = /language-([\w-]+)/.exec(className)?.[1] ?? '';

  const source = useMemo(() => extractText(children), [children]);

  const copy = useCallback(() => {
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(source).then(done).catch(() => {});
      return;
    }
    // Non-secure contexts have no clipboard API. Rare, but a silent no-op is worse than a fallback.
    const area = document.createElement('textarea');
    area.value = source;
    area.setAttribute('readonly', '');
    area.style.position = 'absolute';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      done();
    } finally {
      document.body.removeChild(area);
    }
  }, [source]);

  return (
    <div className="epicChat-code" data-language={language || undefined}>
      <div className="epicChat-codeHead">
        <span className="epicChat-codeLang">{language || 'text'}</span>
        <button
          type="button"
          className="epicChat-codeCopy"
          onClick={copy}
          disabled={streaming}
          aria-label={
            streaming
              ? 'Copy is available once the answer finishes'
              : `Copy ${language || 'code'} to clipboard`
          }>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={className} {...rest}>
        {children}
      </pre>
    </div>
  );
}

function extractText(node) {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props?.children !== undefined) return extractText(node.props.children);
  return '';
}

export default function Markdown({children, streaming = false, reducedMotion = false}) {
  const components = useMemo(
    () => ({
      a: AssistantLink,
      // Recovers real emphasis semantics; streamdown emits a span by default.
      strong: (props) => <strong {...props} />,
      em: (props) => <em {...props} />,
      pre: (props) => <CodeBlock {...props} streaming={streaming} />,
    }),
    [streaming],
  );

  return (
    <div className="epicChat-markdown">
      <Streamdown
        mode={streaming ? 'streaming' : 'static'}
        isAnimating={streaming && !reducedMotion}
        // Per-word fade, in CSS rather than a JS typewriter, so only newly mounted words animate and
        // nothing is on a timer. Dropped entirely under reduced motion, which also removes the
        // per-word spans and shrinks the DOM.
        animated={
          streaming && !reducedMotion
            ? {animation: 'blurIn', duration: 220, easing: 'ease-out'}
            : false
        }
        // Repairs unterminated markdown before parsing. Without it an open code fence swallows the
        // rest of the answer until it closes, which is the visible flicker in naive implementations.
        parseIncompleteMarkdown
        // Streamdown's own copy and download buttons are Tailwind-styled, and this site has no
        // Tailwind. Ours are above.
        controls={false}
        security={SECURITY}
        components={components}>
        {children}
      </Streamdown>
    </div>
  );
}
