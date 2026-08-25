// @ts-check
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import codeImport from 'remark-code-import';
import {darkPrismTheme, lightPrismTheme} from './src/data/prism-themes.js';
import {versions} from './src/data/versions.js';
import assistantDevProxy from './plugins/assistant-dev-proxy.js';

// The example clients live outside site/, in the sibling examples/ directory, so they can be run,
// linted and compiled on their own rather than existing only inside a page. <rootDir> in a
// `file=` reference resolves against this.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Epic Cash Developer Docs',
  tagline: 'Build on a MimbleWimble chain where a wrong address cannot lose funds',
  favicon: 'img/favicon.png',

  future: {
    v4: true,
    faster: false,
  },

  // Self-hosted behind nginx on the maintainer's box. See deploy/README.md.
  url: 'https://devdocs.epiccash.com',
  baseUrl: '/',

  // The repository these pages are edited in, which is not an EpicCash repository. Upstream code
  // is cited by pinned link instead, from src/data/versions.js.
  organizationName: 'blacktyger',
  projectName: 'devdocs-public',

  // Broken links and anchors fail the build. The site this replaces shipped a NodeJS sample
  // with a URL-breaking typo and a stylesheet that never loaded, both caught by nobody.
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  // The search theme is the offline local one rather than Algolia DocSearch: Algolia would
  // need an account, an approved crawler config and a third-party request per keystroke. This
  // project has no company behind it to own that account, and shipping reader queries to a
  // third party is the wrong default for a privacy coin's documentation, which is the same
  // reason the fonts here are self-hosted. Cost is an index bundled with the site instead of
  // a hosted one.
  //
  // Its navbar UI is not used. `src/theme/SearchBar/index.js` shadows `@theme/SearchBar` with one
  // control that both searches and asks, because this package renders its dropdown from HTML strings
  // through autocomplete.js and offers no seam to add a row to. What is still used is the build-time
  // index and the `searchByWorker` query, so every option below that affects indexing still matters.
  // The two that no longer do anything are `searchBarShortcut` and `searchBarShortcutHint`: they were
  // read by the component that is now shadowed, and the shortcut is bound in that file instead.
  //
  // theme-mermaid was removed on 2026-08-23. Four diagrams cost a 720KB chunk that rendered
  // nothing until it executed, so they are hand-drawn SVG in src/components/Diagrams.js now.
  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      /** @type {import('@easyops-cn/docusaurus-search-local').PluginOptions} */
      ({
        hashed: true,
        indexBlog: false,
        // docs are mounted at the site root, so the indexer needs telling.
        docsRouteBasePath: '/',
        indexDocs: true,
        indexPages: true,
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        searchBarShortcutHint: false,
        // Method and config keys are the most likely queries and they are long, so index
        // them as whole terms rather than truncating.
        searchResultLimits: 10,
        searchResultContextMaxLength: 60,
      }),
    ],
  ],

  // Docusaurus emits og:title, og:description, og:image, og:url and twitter:card, but not
  // og:site_name or og:type, so a shared link renders without the site attribution that
  // most unfurlers show above the title.
  headTags: [
    {
      tagName: 'meta',
      attributes: {property: 'og:site_name', content: 'Epic Cash Developer Docs'},
    },
    {
      tagName: 'meta',
      attributes: {property: 'og:type', content: 'website'},
    },
  ],

  // Development only: proxies /api/chat to the assistant server so the panel can reach it from the
  // dev server's origin. Contributes nothing to a production build.
  plugins: [assistantDevProxy],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
          // Joined with the page's path relative to this directory, so the trailing `site/`
          // matters: without it every Edit link 404s.
          editUrl: 'https://github.com/blacktyger/devdocs-public/tree/main/site/',
          // Whole-file imports only. remark-code-import also supports #L3-L6 line ranges,
          // which silently drift the moment the source file is edited, so every include
          // below pulls a complete file that stands on its own.
          beforeDefaultRemarkPlugins: [
            [codeImport, {rootDir: repoRoot, allowImportingFromOutside: true}],
          ],
          // Page age is information a reader of the old site badly needed and never had: that
          // site was frozen in 2024 and said so nowhere. This needs a full clone to read the
          // git history, which is why the CI workflow sets fetch-depth: 0.
          showLastUpdateTime: true,
        },
        blog: false,
        // /404 is a real route now that src/pages/404.js exists, and the search theme adds
        // /search. Neither belongs in a sitemap: one is an error page and the other is a
        // client-side UI with no content of its own.
        sitemap: {
          ignorePatterns: ['/404', '/404.html', '/search', '/search/**'],
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Was img/epic-logo.png, a 4844x1934 / 344KB wordmark. As an og:image it exceeded
      // Twitter's 4096px width ceiling for summary_large_image and had a 2.5:1 aspect that
      // most unfurlers crop. social-card.png is 1200x630 (the standard 1.91:1) and 100KB.
      // Generated from the same logo on the brand gradient; replace it with a designed one
      // whenever you like, the reference is the only thing that has to stay.
      image: 'img/social-card.png',
      colorMode: {
        defaultMode: 'dark',
        respectPrefersColorScheme: true,
      },
      navbar: {
        logo: {
          alt: 'Epic Cash',
          // Was the 4844x1934 / 344KB source PNG, preloaded on every page and rendered at
          // 26px tall: the single largest asset in the build, and 9.4 megapixels to decode
          // for a navbar mark. This is the same image at 260x104 (4x the render box, so it
          // stays sharp on a hidpi screen) and 15KB.
          src: 'img/epic-logo-nav.png',
          width: 65,
          height: 26,
        },
        items: [
          // "Start here" is the guided path and had no navbar entry, so a first-time
          // visitor arriving on any doc page could not find it.
          {to: '/start', label: 'Start here', position: 'left'},
          {to: '/concepts/mimblewimble', label: 'Concepts', position: 'left'},
          {to: '/guides/build', label: 'Guides', position: 'left'},
          {to: '/examples/', label: 'Examples', position: 'left'},
          {to: '/api/', label: 'API', position: 'left'},
          // reference/* had no navbar entry at all, so from the landing page the config
          // and CLI pages were reachable only through the footer or the link index.
          {to: '/reference/cli', label: 'Config & CLI', position: 'left'},
          {to: '/mining/proof-of-work', label: 'Mining', position: 'left'},
          // Downloads sits with the rest of the navigation rather than alone on the right. The right
          // side is now chrome only: the theme switch, and the ask-or-search control that Docusaurus
          // renders after the last item.
          {to: '/downloads', label: 'Downloads', position: 'left'},
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {label: 'Start here', to: '/start'},
              {label: 'Concepts', to: '/concepts/mimblewimble'},
              {label: 'Config and CLI', to: '/reference/cli'},
              {label: 'API reference', to: '/api/'},
              {label: 'Code examples', to: '/examples/'},
            ],
          },
          {
            title: 'Code',
            items: [
              {label: 'Node', href: 'https://github.com/EpicCash/epic'},
              {label: 'Wallet', href: 'https://github.com/EpicCash/epic-wallet'},
              {
                label: 'Epicbox relay',
                href: 'https://github.com/EpicCash/epic-epicbox-docker',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {label: 'Telegram', href: 'https://t.me/EpicCash'},
              {label: 'Reddit', href: 'https://www.reddit.com/r/epiccash'},
              {label: 'epiccash.com', href: 'https://epiccash.com'},
              // Moved here when the masthead's project-links panel became a quick start. The
              // other three links in that panel were already in this footer; this one was not.
              {label: 'Block explorer', href: 'https://explorer.epicmine.io'},
            ],
          },
        ],
        // Was a hardcoded "node 4.0.3 and wallet 4.0.0", a second copy of values that
        // src/data/versions.js declares itself the only place to edit. The inline style it
        // used to carry measured 1.67:1 in light mode; styling now lives in custom.css.
        copyright: `<span class="epicFooterBy">created by btlabs</span>`,
      },
      prism: {
        // Not prismThemes.github / prismThemes.vsDark directly: both fail WCAG AA on several
        // token types, and because prism-react-renderer emits token colours as inline styles,
        // CSS cannot correct them. See src/data/prism-themes.js for the measured ratios.
        theme: lightPrismTheme,
        darkTheme: darkPrismTheme,
        additionalLanguages: [
          'rust',
          'toml',
          'bash',
          'powershell',
          'python',
          'json',
          'ini',
        ],
      },
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4,
      },
    }),
};

export default config;
