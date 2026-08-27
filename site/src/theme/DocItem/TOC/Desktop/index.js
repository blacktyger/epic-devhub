import React from 'react';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import TOC from '@theme/TOC';
import {translate} from '@docusaurus/Translate';

function countTocItems(items) {
  return items.reduce(
    (total, item) => total + 1 + countTocItems(item.children ?? []),
    0,
  );
}

export default function DocItemTOCDesktop() {
  const {toc, frontMatter} = useDoc();
  const sectionCount = countTocItems(toc);

  if (sectionCount === 0) {
    return null;
  }

  return (
    <nav
      className={ThemeClassNames.docs.docTocDesktop}
      aria-label={translate({
        id: 'toc.navAriaLabel',
        message: 'On this page',
        description: 'Accessible name of the table of contents landmark',
      })}>
      <div className="epicTocHeader">
        <span className="epicTocHeaderLabel">
          {translate({
            id: 'toc.heading',
            message: 'On this page',
            description: 'Visible heading above the table of contents',
          })}
        </span>
        <span className="epicTocCount">
          {String(sectionCount).padStart(2, '0')}{' '}
          {/*
            Two ids rather than an ICU plural, because the interface translation pass deliberately does
            not parse ICU: its placeholder mask handles the simple `{name}` form only, and a half-
            understood plural is worse than none. This is correct for languages with one or two plural
            categories and approximate for Russian, which has three. Worth revisiting as ICU support
            rather than papering over here.
          */}
          {sectionCount === 1
            ? translate({
                id: 'toc.sectionCount.one',
                message: 'section',
                description: 'Noun after the table-of-contents count, when there is exactly one',
              })
            : translate({
                id: 'toc.sectionCount.other',
                message: 'sections',
                description: 'Noun after the table-of-contents count, when there is more than one',
              })}
        </span>
      </div>
      <TOC
        toc={toc}
        minHeadingLevel={frontMatter.toc_min_heading_level}
        maxHeadingLevel={frontMatter.toc_max_heading_level}
        className="epicTocList"
      />
    </nav>
  );
}
