import React, {useMemo} from 'react';
import Content from '@theme-original/DocItem/Content';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import {DocPageContext} from '@site/src/components/Assistant/PageActions';

/**
 * Tells the MDX `h1` override which document it is rendering inside.
 *
 * The page action row belongs directly under the heading, and every page in `docs/` writes its own
 * `# Heading` in the MDX rather than relying on the front matter title. That means Docusaurus generates
 * no synthetic title and the heading is one of the MDX children here, so there is no sibling position
 * to insert after from this component. The override in `src/theme/MDXComponents.js` can reach it,
 * and this context is how it knows it is looking at a documentation page rather than an MDX page under
 * `src/pages` that happens to have a heading.
 *
 * If a page is ever added with only a front matter title and no `# Heading`, the row will not appear on
 * it. That is a visible omission rather than a broken page, and the fix would be to render the row here
 * as well when Docusaurus supplies the synthetic title.
 */
export default function ContentWrapper(props) {
  const {metadata} = useDoc();

  const page = useMemo(
    () => ({permalink: metadata.permalink, title: metadata.title}),
    [metadata.permalink, metadata.title],
  );

  return (
    <DocPageContext.Provider value={page}>
      <Content {...props} />
    </DocPageContext.Provider>
  );
}
