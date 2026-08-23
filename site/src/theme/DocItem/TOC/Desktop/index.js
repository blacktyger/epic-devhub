import React from 'react';
import {ThemeClassNames} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import TOC from '@theme/TOC';

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
      aria-label="On this page">
      <div className="epicTocHeader">
        <span className="epicTocHeaderLabel">On this page</span>
        <span className="epicTocCount">
          {String(sectionCount).padStart(2, '0')} {sectionCount === 1 ? 'section' : 'sections'}
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
