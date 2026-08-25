import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import './../../css/index-page.css';

/**
 * The not-found page, shadowing @theme/NotFound.
 *
 * It lives here rather than only in src/pages/404.js because those two are different routes and
 * only one of them was ours. The pages plugin renders src/pages/404.js at /404.html, which is the
 * file a static server returns for an unknown path, while the client-side router sends any
 * unmatched location to @theme/NotFound. With the custom page in src/pages only, a reader landing
 * on a bad URL was served our page and then had it replaced during hydration by the stock
 * Docusaurus one, which says "Please contact the owner of the site that linked you to the original
 * URL". That swap is also what React error #418 in the harness console was reporting: the server
 * HTML and the client tree were two different components.
 *
 * So the component lives in the theme, and src/pages/404.js re-exports it. Both routes now render
 * the same tree, hydration matches, and every route into this page shows the same thing:
 *
 *   /404.html          static file, served by nginx error_page and by `npm run serve`
 *   any unknown path   client-side catch-all
 *
 * The stock copy is useless to a reader who mistyped a path or followed an old link from Telegram,
 * so this offers the three entry intents and the pages most likely to be the intended target.
 *
 * The URL is not echoed back into the page, deliberately: reflecting arbitrary path text into the
 * DOM is an unnecessary injection surface for zero reader benefit.
 */

const ROUTES = [
  {
    heading: 'Run something',
    links: [
      ['Build the binaries', '/guides/build'],
      ['Run a local network', '/guides/local-network'],
      ['Node and wallet setup', '/guides/mainnet-setup'],
      ['Download a binary', '/downloads'],
      ['epic-server.toml', '/reference/node-config'],
      ['epic-wallet.toml', '/reference/wallet-config'],
      ['CLI reference', '/reference/cli'],
    ],
  },
  {
    heading: 'Move funds',
    links: [
      ['Your first transfer', '/guides/first-transfer'],
      ['Wallet operations', '/guides/wallet-operations'],
      ['Interactive transactions', '/concepts/interactive-transactions'],
      ['Outputs and locking', '/concepts/outputs-and-locking'],
      ['Diagnose a stuck transaction', '/guides/stuck-transactions'],
      ['Back up and restore', '/guides/backup-and-restore'],
      ['Payment proofs', '/concepts/payment-proofs'],
    ],
  },
  {
    heading: 'Integrate programmatically',
    links: [
      ['API reference', '/api/'],
      ['Wallet Owner API', '/api/wallet-owner'],
      ['Node API', '/api/node'],
      ['Epicbox relay protocol', '/api/epicbox'],
      ['Code examples', '/examples/'],
    ],
  },
];

export default function NotFound() {
  return (
    <Layout
      title="Page not found"
      description="That page does not exist on the Epic Cash developer documentation site.">
      <header className="ixMast">
        <div className="container">
          <p className="ixEyebrow">Error 404</p>
          <h1 className="ixTitle">That page does not exist</h1>
          <p className="ixLede">
            The site was rebuilt from scratch and most paths changed, so an older link may not
            survive. Search in the navbar covers every page, or start from one of these.
          </p>
        </div>
      </header>
      <main className="container ixMain">
        <section className="ixSection ixSectionLast">
          <h2 className="ixKicker">Where you might be headed</h2>
          <div className="ixIndex">
            {ROUTES.map((group) => (
              <nav className="ixGroup" key={group.heading} aria-label={group.heading}>
                <h3 className="ixGroupLabel">{group.heading}</h3>
                <ul>
                  {group.links.map(([label, to]) => (
                    <li key={to}>
                      <Link to={to}>{label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <p className="ixFoot">
            Still nothing? <Link to="/">The documentation index</Link> lists every page, and{' '}
            <a href="https://github.com/EpicCash/documentation/issues">
              an issue on the docs repository
            </a>{' '}
            is the place to report a link that should work.
          </p>
        </section>
      </main>
    </Layout>
  );
}
