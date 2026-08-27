import React from 'react';
import MDXComponents from '@theme-original/MDXComponents';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import {Risk, Card, CardGrid, Unverified} from '@site/src/components/Epic';
import {JourneyNav, JourneyOverview, SlateLifecycle} from '@site/src/components/Journey';
import {SlateRounds, HandshakeTrace} from '@site/src/components/Diagrams';
import {SumToZero} from '@site/src/components/SumToZero';
import {OutputLifecycle} from '@site/src/components/OutputLifecycle';
import {RelayExchange} from '@site/src/components/RelayExchange';
import {RpcGroup, RpcMethod, RpcConsole} from '@site/src/components/Rpc';
import {Src, Fn, Repo, Ver} from '@site/src/components/Src';
import PageActions from '@site/src/components/Assistant/PageActions';

/**
 * Wraps every markdown table in its own horizontal scroll container.
 *
 * The widest reference tables here are six columns (concepts/transports) with cells up to
 * 115 characters (guides/run-a-node), and the cells are full of unbreakable code tokens
 * like `foreign_api_secret_path`. Infima handles this by making the table itself
 * `display: block; overflow: auto`, but custom.css overrides that with `display: table` so
 * that `width: 100%` works, which removed the scroll box and let wide tables widen the
 * whole document on a narrow screen.
 *
 * A wrapper keeps both: the table stays a real table at full width, and the overflow is
 * contained. tabIndex makes the scroll container reachable by keyboard, which a
 * mouse-only scroll box fails (WCAG 2.2 2.1.1); it is the same thing Docusaurus does to
 * <pre> inside a code block.
 */
function Table(props) {
  return (
    <div className="epicTableWrap" tabIndex={0}>
      <table {...props} />
    </div>
  );
}

/**
 * Puts the page action row immediately after a documentation page's heading.
 *
 * This is the only insertion point that works. Every page in docs/ writes its own `# Heading` inside
 * the MDX, so the heading is a child of the MDX tree rather than a sibling rendered by
 * `DocItem/Content`, and nothing above it in the theme can place an element after it.
 *
 * `PageActions` renders nothing unless the context provided by the swizzled `DocItem/Content` is
 * present, so headings on MDX pages under src/pages are unaffected.
 */
const OriginalH1 = MDXComponents.h1 ?? 'h1';

function H1(props) {
  return (
    <>
      <OriginalH1 {...props} />
      <PageActions />
    </>
  );
}

// Registered globally so pages can use them without an import line in every file.
export default {
  ...MDXComponents,
  table: Table,
  h1: H1,
  Tabs,
  TabItem,
  Risk,
  Card,
  CardGrid,
  Unverified,
  JourneyNav,
  JourneyOverview,
  SlateLifecycle,
  SlateRounds,
  HandshakeTrace,
  SumToZero,
  OutputLifecycle,
  RelayExchange,
  RpcGroup,
  RpcMethod,
  RpcConsole,
  Src,
  Fn,
  Repo,
  Ver,
};
