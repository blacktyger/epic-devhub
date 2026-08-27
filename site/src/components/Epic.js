import React from 'react';
import Link from '@docusaurus/Link';
import {translate} from '@docusaurus/Translate';

const RISK_LABELS = {
  read: 'Read only',
  spend: 'Can spend funds',
  destructive: 'Destructive',
};

const RISK_CLASSES = {
  read: 'epicRisk epicRiskRead',
  spend: 'epicRisk epicRiskSpend',
  destructive: 'epicRisk epicRiskDestructive',
};

/** Marks what an API call is able to do to a wallet. */
export function Risk({level = 'read', children}) {
  return (
    <span className={RISK_CLASSES[level] ?? RISK_CLASSES.read}>
      {children ?? RISK_LABELS[level] ?? RISK_LABELS.read}
    </span>
  );
}

/**
 * Marks a claim derived from reading source that nobody has confirmed against a running
 * node, wallet or relay, and says what would settle it.
 *
 * The distinction is the point of the convention: a signature, a constant or a default read
 * out of the source is reliable, an inference about runtime behaviour is not, and a reader
 * deciding whether to trust a page needs to see which one they are looking at. The site this
 * replaces stated both in the same voice, which is how it went stale without anyone noticing.
 *
 * An <aside> rather than a div, so a screen reader can skip it, with an explicit label
 * because the gold left border alone does not tell anyone what the box means.
 */
export function Unverified({children, settles}) {
  return (
    <aside
      className="epicUnverified"
      aria-label={translate({
        id: 'unverified.ariaLabel',
        message: 'Unverified claim',
        description: 'Accessible name of the box marking a claim that has not been confirmed',
      })}>
      <span className="epicUnverifiedLabel">
        {translate({
          id: 'unverified.label',
          message: 'Unverified',
          description: 'Badge on the unverified-claim box. One word.',
        })}
      </span>
      <div className="epicUnverifiedBody">{children}</div>
      {settles ? (
        <div className="epicUnverifiedSettles">
          <strong>
            {translate({
              id: 'unverified.toConfirm',
              message: 'To confirm:',
              description: 'Lead-in before what would settle an unverified claim',
            })}
          </strong>{' '}
          {settles}
        </div>
      ) : null}
    </aside>
  );
}

export function CardGrid({children}) {
  return <div className="epicCardGrid">{children}</div>;
}

/**
 * A card is a link, and its accessible name comes from its own text, so the title does
 * not need to be a heading. It used to be an <h3>, which produced an h1 -> h3 skip on
 * /api/ and /examples/ where a CardGrid sits directly under the page title, with no h2
 * between them. That is a WCAG 2.2 1.3.1 heading-order violation, and the four bogus
 * entries also polluted the document outline a screen reader announces.
 */
export function Card({title, to, href, children}) {
  const target = to ?? href;
  return (
    <Link className="epicCard" to={target}>
      <span className="epicCardTitle">{title}</span>
      {/* A div, not a p: MDX already wraps prose children in a paragraph, and nesting
          one p inside another produces invalid HTML. */}
      <div className="epicCardBody">{children}</div>
    </Link>
  );
}
