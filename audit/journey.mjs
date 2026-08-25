/**
 * The newcomer walk: one developer, day one, no prior Epic knowledge, trying to get to the
 * point of moving coins from code.
 *
 * Every other check here answers "is this page correct". None of them answers "can a stranger
 * get through it", which is the question the site exists to pass and the only one that was
 * never measured. axe cannot see a guide that never says what you need before starting, and a
 * gzip ceiling cannot see a stage that ends without saying where to go next.
 *
 * The route is not invented here. It is imported from `site/src/data/developerJourney.js`, the
 * same eight stages the landing page and every stage footer promise, so this check cannot drift
 * from what the site tells a reader to do. Each stage also declares an `outcome`, which is a
 * testable promise: the page either equips the reader for it or it does not.
 *
 * The shape rules come from the design skill's route classes, not from taste. A narrative page
 * opens with the outcome, states prerequisites, advances in numbered stages, shows the output
 * that proves each command worked, and closes with the next page by name. A lookup page opens
 * with the working context and repeats one strict shape per object. Deviations are reported
 * against those contracts.
 *
 * Output is two files. `results/journey.json` is the evidence, and
 * `results/journey-notes.md` is the walk written in order as field notes, so a human or an
 * agent can read the experience rather than reassemble it from a metrics dump. The judgement
 * about what to fix first belongs to whoever reads the notes; this script's job is to make the
 * friction impossible to miss.
 *
 * Gates on blockers only. A blocker is a dead link, a missing route, a mid-journey dead end or
 * a spending method with no risk marker: things that are wrong regardless of anyone's opinion.
 * Friction and polish are reported and never fail the run, because pretending a judgement call
 * is a pass/fail invites someone to weaken the threshold to get green.
 */
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serveBuild} from './lib/server.mjs';
import {BUILD, PORTS, RESULTS, SITE, sitemapRoutes} from './lib/paths.mjs';

const {developerJourney} = await import(
  pathToFileURL(path.join(SITE, 'src', 'data', 'developerJourney.js')).href
);

/**
 * Epic-specific vocabulary a newcomer cannot infer from general blockchain knowledge.
 *
 * No term is mapped to the page that is supposed to define it, deliberately. Asserting that
 * would bake this file's opinion of the information architecture into a test, and the map would
 * rot the first time a concept moved. Instead the walk records where each term is first met and
 * whether anything at that point leads to an explanation, which is what the reader actually
 * experiences.
 */
const VOCABULARY = [
  'slate',
  'kernel',
  'commitment',
  'range proof',
  'blinding factor',
  'epicbox',
  'usernet',
  'coinbase maturity',
  'randomx',
  'progpow',
  'cuckoo',
  'stratum',
  'dandelion',
  'foreign api',
  'owner api',
];

/** Languages whose blocks are a command a reader runs, rather than output or config. */
const COMMAND_LANGS = new Set(['bash', 'sh', 'shell', 'console', 'powershell', 'ps1']);

/** Prose that stands in for showing the output of a command. */
const PROOF_PROSE = /\b(prints|reports|outputs?|logs|you (?:will )?see|confirms|responds with|lands at|shows)\b/i;

/** Language labels used for a captured result rather than something to run. */
const OUTPUT_LANGS = new Set(['text', 'output', 'txt', 'json', 'log', 'plaintext']);

const server = await serveBuild(BUILD, PORTS.journey);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: {width: 1440, height: 900},
  colorScheme: 'dark',
  // The masthead quick start is copied rather than read, so the clipboard is evidence.
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();

/** Console errors are part of the newcomer's experience even when the page looks fine. */
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push({route: page.url(), message: String(error)}));
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push({route: page.url(), message: message.text().slice(0, 200)});
  }
});

/**
 * Everything measurable about one page, gathered in the browser because that is the only place
 * the rendered result exists. Runs against the hydrated DOM, so component-generated structure
 * such as the RPC entries is visible.
 */
async function probe(vocabulary) {
  return page.evaluate((terms) => {
    const root =
      document.querySelector('.theme-doc-markdown') ??
      document.querySelector('article') ??
      document.querySelector('main') ??
      document.body;

    const words = (text) => (text ?? '').trim().split(/\s+/).filter(Boolean).length;
    const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim();

    // The opening: everything above the first h2, minus the title and minus the journey
    // footer, which MDX places inside the same container. This is what a reader has to work
    // with before the page starts issuing instructions.
    let lede = '';
    for (const child of root.children) {
      if (child.tagName === 'H2') break;
      if (child.tagName === 'H1') continue;
      if (child.classList?.contains('journeyNav')) continue;
      lede += ` ${child.textContent ?? ''}`;
    }

    // The first section's body, gathered separately: pages here routinely state prerequisites
    // as their opening section rather than in the lede, and a reader meets both before doing
    // anything, so both count as stated in time.
    let firstSection = '';
    let seenH2 = 0;
    const openingLinks = [];
    for (const child of root.children) {
      if (child.tagName === 'H2') {
        seenH2 += 1;
        if (seenH2 > 1) break;
        firstSection += ` ${child.textContent ?? ''}`;
        continue;
      }
      if (seenH2 <= 1) {
        for (const a of child.querySelectorAll?.('a[href^="/"]') ?? []) {
          openingLinks.push(a.getAttribute('href'));
        }
      }
      if (seenH2 === 1) firstSection += ` ${child.textContent ?? ''}`;
    }

    const headings = [...root.querySelectorAll('h2, h3')].map((h) => ({
      level: Number(h.tagName[1]),
      text: clean(h.textContent).replace(/\u200b/g, ''),
    }));

    const blocks = [...root.querySelectorAll('div[class*=codeBlockContainer]')].map((el) => {
      const pre = el.querySelector('pre');
      const source = `${el.className} ${pre?.className ?? ''}`;
      const lang = source.match(/language-([a-z0-9]+)/i)?.[1]?.toLowerCase() ?? null;
      const code = el.querySelector('code')?.textContent ?? '';
      const lines = code.split('\n').filter((l) => l.trim().length > 0);
      return {
        lang,
        title: clean(el.querySelector('[class*=codeBlockTitle]')?.textContent) || null,
        lineCount: lines.length,
        firstLine: clean(lines[0]).slice(0, 120),
        // A leading prompt glyph means the copy button hands over something that will not run.
        promptLines: lines.filter((l) => /^\s*(?:[$>]\s+|PS[^>]*>\s*)/.test(l)).length,
        placeholders: [
          ...new Set(
            [
              ...(code.match(/<[a-z][a-z0-9_.-]*>/gi) ?? []),
              ...(code.match(/YOUR_[A-Z_]+/g) ?? []),
              ...(code.match(/path\/to\/[a-z0-9_./-]*/gi) ?? []),
            ].map((m) => m.trim()),
          ),
        ],
        hasCopyButton: !!el.querySelector('button[class*=copyButton], button[aria-label*=Copy]'),
      };
    });

    const bodyText = root.innerText ?? '';

    // Any preformatted region, including ones the landing page composes itself rather than
    // through the MDX code block. Counted separately so "no copyable command" is never
    // claimed on the strength of a missing Docusaurus wrapper alone.
    const preCount = root.querySelectorAll('pre').length;

    // Where the reader first meets each term, and whether anything at that point explains it.
    // The reading unit is the list item, table cell or paragraph being read, because that is
    // what the eye takes in at the moment of confusion. A list item is preferred over the
    // paragraph inside it: the eight journey rows on /start each wrap an outcome paragraph
    // beside a link to the page that explains it, and treating the paragraph as the unit
    // reported "usernet" as unexplained on a row that links straight to the usernet guide.
    const firstUse = {};
    for (const term of terms) {
      const pattern = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'i');

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let host = null;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        // A term inside a code sample or a config comment is not prose making a claim to the
        // reader, so it does not owe an explanation. Matching there reported "foreign api" as
        // unexplained on the strength of a `# Foreign API` comment inside a TOML block, and put
        // the first use of "randomx" on a sentence about the `randomx` crate rather than the
        // prose about the algorithm three sections later.
        if (node.parentElement?.closest('pre, code, kbd, samp')) continue;
        // A parameter help string on a reference entry is plain text by component contract:
        // RpcMethod renders it as {p.help}, so it cannot carry a link however much a reader
        // meeting "Dandelion" there would want one. The concept belongs on the page that owns
        // it, and flagging the parameter would only push an explanation onto a lookup surface
        // whose whole job is one strict shape per method.
        if (node.parentElement?.closest('.epicRpcParamHelp, .epicRpcNotes')) continue;
        if (pattern.test(node.textContent ?? '')) {
          host = node.parentElement;
          break;
        }
      }
      if (!host) continue;

      const block =
        host.closest('li, td, th, dd, figcaption, blockquote') ??
        host.closest('p, h1, h2, h3') ??
        host;
      const blockText = (block?.textContent ?? '').replace(/\s+/g, ' ').trim();

      // A gloss in place is an explanation. "Coinbase maturity is 3 blocks on usernet" defines
      // the term on the spot, and demanding a link as well would be asking for a worse page.
      const glossed = new RegExp(
        `\\b${term.replace(/ /g, '\\s+')}\\b\\s+(?:is|are|means|refers to|describes)\\b`,
        'i',
      ).test(blockText);

      firstUse[term] = {
        context: blockText.slice(0, 160),
        explainedInPlace:
          glossed ||
          !!block?.querySelector('a[href^="/concepts/"], a[href^="/reference/"], a[href^="/api/"], a[href^="/mining/"], a[href^="/guides/"], dfn, abbr') ||
          // A diagram's caption defines the diagram's vocabulary, and a step inside an
          // interactive figure cannot hold the link itself: SlateExchange renders each step as
          // the label of a <button>, and an anchor inside a button is invalid HTML. So a link in
          // the enclosing figure's caption counts as explaining the term at the point of use.
          !!host
            .closest('figure')
            ?.querySelector('figcaption a[href^="/concepts/"], figcaption a[href^="/mining/"], figcaption a[href^="/api/"]'),
      };
    }

    const anchors = [...root.querySelectorAll('a[href]')].map((a) => ({
      text: clean(a.textContent).slice(0, 80),
      href: a.getAttribute('href'),
    }));

    // The forward exit: the journey footer's next link, a closing card set, or the primary
    // call to action on the landing and start pages, which use their own button classes.
    const journeyNext = clean(
      root.querySelector('.journeyNav .journeyNavNext')?.textContent,
    ) || null;
    const primaryCta = clean(
      (document.querySelector('.jtGo') ?? document.querySelector('.journeyGo'))?.textContent,
    ) || null;
    const closingCards = [...root.querySelectorAll('.epicCard')].map((c) => ({
      title: clean(c.querySelector('.epicCardTitle')?.textContent),
      href: c.getAttribute('href'),
    }));

    // Lookup-page shape, rendered by RpcGroup rather than authored in MDX.
    const rpcGroup = root.querySelector('.epicRpcGroup');
    const rpc = rpcGroup
      ? {
          hasContext: !!rpcGroup.querySelector('.epicRpcContext'),
          contextKeys: [...rpcGroup.querySelectorAll('.epicRpcContext dt')].map((d) =>
            clean(d.textContent),
          ),
          hasJumpIndex: !!rpcGroup.querySelector('.epicRpcIndex'),
          methods: [...rpcGroup.querySelectorAll('.epicRpcMethod')].map((m) => ({
            name: clean(m.querySelector('.epicRpcName')?.textContent),
            risk: clean(m.querySelector('.epicRiskBadge')?.textContent) || null,
            hasSummary: !!m.querySelector('.epicRpcSummary'),
            hasRiskNote: !!m.querySelector('.epicRpcRiskNote'),
            metaKeys: [...m.querySelectorAll('.epicRpcMeta dt')].map((d) => clean(d.textContent)),
            hasSourceCitation: !!m.querySelector('.epicRpcSrc'),
            hasConsole: !!m.querySelector('.epicRpcConsole'),
          })),
        }
      : null;

    return {
      title: document.title,
      h1: clean(root.querySelector('h1')?.textContent) || clean(document.querySelector('h1')?.textContent),
      description: document.querySelector('meta[name=description]')?.content ?? null,
      headings,
      h2Count: headings.filter((h) => h.level === 2).length,
      ledeWords: words(lede),
      lede: clean(lede).slice(0, 400),
      // The opening plus the first section: the window a reader passes through before the page
      // starts issuing instructions. A prerequisite stated anywhere in here was found in time.
      opening: clean(`${lede} ${headings.slice(0, 2).map((h) => h.text).join(' ')} ${firstSection}`).slice(0, 3000),
      openingLinks: [...new Set(openingLinks)],
      preCount,
      // Document-wide, because the landing page's masthead is a <header> outside <main>, so the
      // content root cannot see it. Measuring only the root reported the hero quick start as
      // absent while it was on the page.
      documentPreCount: document.querySelectorAll('pre').length,
      heroCopyButtons: document.querySelectorAll('.ixSnippetCopy').length,
      bodyWords: words(bodyText),
      blocks,
      anchors,
      journeyNext,
      primaryCta,
      closingCards,
      rpc,
      firstUse,
      bodyText: bodyText.slice(0, 200000),
      hasJourneyFooter: !!root.querySelector('.journeyNav'),
    };
  }, vocabulary);
}

/** One visit: navigate, wait for hydration, probe, and derive the per-page reading. */
async function visit(route) {
  const response = await page.goto(`${server.origin}${route}`, {waitUntil: 'networkidle'});
  const status = response?.status() ?? 0;
  const data = await probe(VOCABULARY);

  const commandBlocks = data.blocks.filter((b) => COMMAND_LANGS.has(b.lang ?? ''));
  const outputBlocks = data.blocks.filter((b) => OUTPUT_LANGS.has(b.lang ?? ''));
  const proofProse = (data.bodyText.match(PROOF_PROSE) ?? []).length
    ? data.bodyText.split(/(?<=[.!?])\s/).filter((s) => PROOF_PROSE.test(s)).length
    : 0;

  // Prerequisites, in either of the two forms the site uses: saying what you need, or linking
  // back to the page that gets you there. The lexical test alone reported
  // /guides/wallet-operations as stating nothing while its opening reads "Set up first:" with a
  // link to mainnet setup and "A positive wallet balance is required", so the structural signal
  // carries equal weight.
  const prerequisiteWords =
    /\b(prerequisite|you need|needs?|required?|requires|assumes|already|set up first|before you (?:start|begin)|install)\b/i.test(
      data.opening,
    );
  const prerequisiteLink = (data.openingLinks ?? []).some((href) =>
    /^\/(guides|concepts|downloads|start)/.test(href ?? ''),
  );
  const prerequisiteSignal = prerequisiteWords || prerequisiteLink;

  const {bodyText, ...rest} = data;

  return {
    route,
    status,
    ...rest,
    commandBlockCount: commandBlocks.length,
    outputBlockCount: outputBlocks.length,
    proofProseCount: proofProse,
    blocksWithoutLanguage: data.blocks.filter((b) => !b.lang).length,
    blocksWithPrompt: data.blocks.filter((b) => b.promptLines > 0).length,
    blocksWithoutCopy: data.blocks.filter((b) => !b.hasCopyButton).length,
    placeholders: [...new Set(data.blocks.flatMap((b) => b.placeholders))],
    prerequisiteSignal,
    readingMinutes: Math.round((data.bodyWords / 220) * 10) / 10,
  };
}

const findings = [];
const add = (severity, route, note, evidence) =>
  findings.push({severity, route, note, evidence: evidence ?? null});

const walk = [];
const routeExists = new Set(await sitemapRoutes(fs));
// ---------------------------------------------------------------------------
// Leg 1. Orientation. The reader has heard of Epic, knows nothing, and has to work out
// what this is and where to start without being sold to.
// ---------------------------------------------------------------------------
{
  const landing = await visit('/');
  landing.leg = 'orientation';
  landing.intent = 'Work out what Epic is and where to start.';
  walk.push(landing);

  if (landing.status !== 200) add('blocker', '/', `landing page returned ${landing.status}`);

  const entryLinks = landing.anchors.filter((a) =>
    /^\/(start|concepts|guides)/.test(a.href ?? ''),
  );
  if (entryLinks.length === 0) {
    add('blocker', '/', 'landing page offers no link into the docs');
  }

  // The design brief requires the masthead's second column to do real work, usually a
  // copyable quick start. A newcomer who can run one command in the first minute is a
  // newcomer who stays.
  if (landing.blocks.length === 0 && landing.documentPreCount === 0) {
    add(
      'friction',
      '/',
      'nothing copyable on the landing page, so a reader cannot run anything in the first minute',
    );
  }

  // The quick start is copied rather than read, so the clipboard is the evidence it works. A
  // block that shows a prompt glyph and then hands the glyph over is worse than no copy button,
  // which is why the payload is checked rather than the button's presence.
  if (landing.heroCopyButtons > 0) {
    await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
    const copyResult = await (async () => {
      await page.locator('.ixSnippetCopy').first().click();
      await page.waitForTimeout(200);
      return page.evaluate(() => navigator.clipboard.readText());
    })();
    landing.heroClipboard = copyResult;
    if (!copyResult || copyResult.trim().length === 0) {
      add('blocker', '/', 'the quick-start copy button writes nothing to the clipboard');
    } else if (/^\s*[$>]\s/m.test(copyResult)) {
      add(
        'blocker',
        '/',
        'the quick-start copy button includes the prompt glyph, so the copied commands will not run',
        copyResult.split('\n')[0],
      );
    }
    // Every product and platform combination must produce commands, or a reader picks a tab and
    // gets an empty block. Products are iterated outermost and the platform buttons are queried
    // fresh inside each, because the platform set changes with the product: a flat pass over
    // both button groups left the node's macOS tab unexercised.
    const tabPayloads = await page.evaluate(async () => {
      const settle = () => new Promise((ok) => setTimeout(ok, 60));
      const out = [];
      const productButtons = [
        ...document.querySelectorAll('.ixSnippetHead .ixSnippetTabs button'),
      ].map((b) => b.textContent.trim());

      for (const productLabel of productButtons) {
        const product = [...document.querySelectorAll('.ixSnippetHead .ixSnippetTabs button')].find(
          (b) => b.textContent.trim() === productLabel,
        );
        product.click();
        await settle();
        const platformLabels = [
          ...document.querySelectorAll('.ixSnippetPlatforms button'),
        ].map((b) => b.textContent.trim());

        for (const platformLabel of platformLabels) {
          const platform = [...document.querySelectorAll('.ixSnippetPlatforms button')].find(
            (b) => b.textContent.trim() === platformLabel,
          );
          platform.click();
          await settle();
          const body = document.querySelector('.ixSnippetBody')?.innerText ?? '';
          out.push({
            tab: `${productLabel}/${platformLabel}`,
            lines: body.trim() ? body.trim().split('\n').length : 0,
            empty: body.trim().length === 0,
          });
        }
      }
      return out;
    });
    landing.heroTabs = tabPayloads;
    for (const tab of tabPayloads) {
      if (tab.empty) add('blocker', '/', `quick-start tab "${tab.tab}" shows no commands`);
    }
  }

  const start = await visit('/start');
  start.leg = 'orientation';
  start.intent = 'Find the route through the documentation.';
  walk.push(start);
  if (start.status !== 200) add('blocker', '/start', `returned ${start.status}`);
}

// ---------------------------------------------------------------------------
// Leg 2. The eight declared stages, in the order the site promises them, each judged
// against the outcome it declares and the narrative shape contract.
// ---------------------------------------------------------------------------
const vocabularyLedger = new Map();

for (const [index, stage] of developerJourney.entries()) {
  const route = stage.to.replace(/\/$/, '') || '/';
  const reading = await visit(route);
  reading.leg = 'journey';
  reading.stage = {number: stage.number, id: stage.id, title: stage.title, outcome: stage.outcome};
  reading.intent = stage.outcome;
  walk.push(reading);

  const where = `${stage.number} ${route}`;

  if (reading.status !== 200) {
    add('blocker', route, `stage ${where} returned ${reading.status}, the journey stops here`);
    continue;
  }

  // The opening has to say what the reader walks away with. A page that starts with an h2 has
  // dropped the reader straight into instructions with no frame.
  if (reading.ledeWords < 25) {
    add(
      'friction',
      route,
      `stage ${stage.number} opens with ${reading.ledeWords} words before the first section, so the outcome is never stated`,
      reading.lede,
    );
  }

  // Prerequisites are owed by a page that tells the reader to run things. A concepts page is
  // read rather than executed, so it is exempt: flagging it reported a defect that would make
  // the page worse to fix.
  const procedural = reading.commandBlockCount >= 2;
  if (procedural && !reading.prerequisiteSignal) {
    add(
      'friction',
      route,
      `stage ${stage.number} issues ${reading.commandBlockCount} commands without stating what it assumes, so a reader arriving from search starts by failing`,
    );
  }

  // A stage that issues commands owes the reader the output that proves they worked.
  if (reading.commandBlockCount >= 2 && reading.outputBlockCount === 0 && reading.proofProseCount === 0) {
    add(
      'friction',
      route,
      `stage ${stage.number} has ${reading.commandBlockCount} commands and shows no output for any of them, so nothing tells the reader it worked`,
    );
  }

  // The forward exit. Mid-journey this is the difference between a route and a pile of pages.
  const hasForward = !!reading.journeyNext || !!reading.primaryCta || reading.closingCards.length > 0;
  if (!hasForward) {
    add('blocker', route, `stage ${stage.number} has no forward link, the journey dead-ends here`);
  } else if (!reading.journeyNext && index < developerJourney.length - 1) {
    add(
      'polish',
      route,
      `stage ${stage.number} has no journey footer, so the next stage is only reachable through a closing card`,
    );
  }

  for (const block of reading.blocks) {
    if (block.promptLines > 0) {
      add(
        'friction',
        route,
        `a copyable block carries ${block.promptLines} prompt-prefixed line(s), so the copy button hands over something that will not run`,
        block.firstLine,
      );
    }
  }
  if (reading.blocksWithoutLanguage > 0) {
    add(
      'polish',
      route,
      `${reading.blocksWithoutLanguage} code block(s) carry no language, so they get no highlighting and no language label`,
    );
  }
}

/**
 * The lookup-page contract, applied wherever a reference entry actually renders.
 *
 * A separate function because the search detour does not reliably land on one: searching
 * `init_send_tx` ranks /examples/send-receive first, so running these assertions only on the
 * search destination left every one of them unexercised, which looks like coverage and is not.
 * The canonical reference route is therefore visited as well.
 */
function auditLookup(reading, target) {
  if (!reading.rpc) return;

  if (!reading.rpc.hasContext) {
    add('blocker', target, 'lookup page has no working context strip, so the endpoint and credential are unstated');
  }
  if (!reading.rpc.hasJumpIndex && reading.rpc.methods.length > 3) {
    add('friction', target, `${reading.rpc.methods.length} methods with no jump index`);
  }

  // One strict shape, repeated. Variation between entries is the defect a lookup page cannot
  // afford, because the reader is scanning for a fixed position.
  const shapes = new Set();
  for (const method of reading.rpc.methods) {
    shapes.add(method.metaKeys.join('|'));
    if (!method.hasSourceCitation) {
      add('blocker', target, `${method.name} carries no source citation, so its claim cannot be checked`);
    }
    if (!method.risk) {
      add('blocker', target, `${method.name} carries no risk badge, so a reader cannot tell if it spends`);
    }
    // Matched against the labels the badge actually renders, from RISK_LABEL in Rpc.js:
    // "Can move funds", "Changes state", "Exposes secret", "Destructive". An earlier version
    // tested for /spend|destructive/, which no rendered badge except "Destructive" contains, so
    // a spending method with no note would have passed unnoticed.
    if (method.risk && /move funds|changes state|exposes secret|destructive/i.test(method.risk) && !method.hasRiskNote) {
      add(
        'blocker',
        target,
        `${method.name} is marked "${method.risk}" with no note saying what releases the effect`,
      );
    }
  }
  if (shapes.size > 1) {
    add(
      'polish',
      target,
      `method entries use ${shapes.size} different metadata shapes, so the reader's eye has to re-find each field`,
      [...shapes].join(' / '),
    );
  }
}

// ---------------------------------------------------------------------------
// Leg 3. The lookup detour. The reader now knows the concept and wants the call. This is
// the site's own search, not a route typed in, because search is how a reference page is
// actually reached.
// ---------------------------------------------------------------------------
{
  const wanted = 'init_send_tx';
  await page.goto(`${server.origin}/`, {waitUntil: 'networkidle'});
  await page.locator('button.epicAsk-control').first().click();
  await page.waitForTimeout(400);
  const input = page.locator('.epicAsk-input').first();
  await input.fill(wanted);
  await page.waitForTimeout(1500);

  // Reading an href out of the results produced the wrong destination and made this leg report
  // that the canonical reference ranks below an example page, which verify-runtime.mjs disproves:
  // the first hit for init_send_tx is the transfers reference entry. So the hit is clicked, which
  // is what a reader does, and the landing URL is the evidence.
  //
  // `.epicAsk-result` rather than `[role=option]`: the first option in the list is the row that
  // escalates to the assistant, and clicking that would open the panel instead of navigating.
  const suggestion = await page.evaluate(() => {
    const modal = document.querySelector('.epicAsk-modal');
    if (!modal) return null;
    const options = [...modal.querySelectorAll('.epicAsk-result')];
    if (options.length === 0) return null;
    return {
      count: options.length,
      text: options[0].textContent?.replace(/\s+/g, ' ').trim().slice(0, 90) ?? null,
    };
  });

  let hit = null;
  if (!suggestion) {
    add('blocker', '/search', `searching for ${wanted} returns no suggestions`);
  } else {
    await page.locator('.epicAsk-modal .epicAsk-result').first().click();
    await page.waitForLoadState('networkidle');
    hit = {
      href: new URL(page.url()).pathname,
      text: suggestion.text,
      optionCount: suggestion.count,
    };
  }

  if (hit?.href) {
    const target = hit.href.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
    const lookup = await visit(target);
    lookup.leg = 'lookup';
    lookup.intent = `Find the ${wanted} call and everything needed to make it.`;
    lookup.searchHit = hit;
    walk.push(lookup);

    if (!lookup.rpc) {
      add(
        'friction',
        target,
        `the top search result for ${wanted} is this page rather than the reference entry, so the canonical definition ranks below prose about it`,
        hit.text,
      );
    }
    auditLookup(lookup, target);
  }

  // The canonical reference entry, reached directly, so the shape contract is exercised
  // whatever search decides to rank first.
  if (!walk.some((r) => r.rpc)) {
    const reference = await visit('/api/wallet/transfers');
    reference.leg = 'lookup';
    reference.intent = `Read the ${wanted} reference entry itself.`;
    walk.push(reference);
    if (!reference.rpc) {
      add('blocker', '/api/wallet/transfers', 'the transfers reference page renders no method entries');
    }
    auditLookup(reference, '/api/wallet/transfers');
  }
}

// ---------------------------------------------------------------------------
// Vocabulary, in the order the reader actually met it. Run after every leg so the walk array
// is complete and in visit order: a term first met on the landing page must be recorded there,
// not on whichever stage page happened to be probed first.
//
// A term met on a `/concepts/` page is being introduced, which is that section's whole purpose,
// so it is not friction. The first version of this check had no such exemption and reported
// "kernel", "commitment", "range proof" and "blinding factor" as unexplained on
// /concepts/mimblewimble, the page that defines all four. Heading matching was tried as the
// explanation signal and fails for the same reason: the section that defines commitments and
// kernels is called "What the chain stores".
//
// What remains is the real complaint: a procedural or landing page spending Epic vocabulary it
// does not teach and does not link. The voice rule is one statement per topic, so a guide is
// supposed to link to the concept rather than re-explain it, which makes a missing link a
// defect rather than a style preference.
// ---------------------------------------------------------------------------
for (const reading of walk) {
  for (const [term, use] of Object.entries(reading.firstUse ?? {})) {
    if (vocabularyLedger.has(term)) continue;
    vocabularyLedger.set(term, {
      term,
      route: reading.route,
      stage: reading.stage?.number ?? '--',
      introducedOnConceptsPage: reading.route.startsWith('/concepts/'),
      ...use,
    });
  }
}

/** Where each term is actually treated, indexed across the whole built site. */
const termIndex = new Map(VOCABULARY.map((term) => [term, {headings: [], concepts: [], counts: {}}]));
{
  const strip = (html) =>
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;|&#\d+;/gi, ' ')
      .replace(/\s+/g, ' ');

  // Every route, not just the ones the walk visits. The first version of this check built
  // coverage only from the concepts pages the journey happens to pass through, which is two of
  // six, and therefore reported that no page covers "stratum" while /mining/stratum exists.
  // A check that invents a defect is worse than no check.
  for (const route of routeExists) {
    const response = await fetch(`${server.origin}${route}`);
    if (!response.ok) continue;
    const html = await response.text();
    const headingText = [...html.matchAll(/<h[123][^>]*>([\s\S]*?)<\/h[123]>/gi)]
      .map((m) => strip(m[1]))
      .join(' | ');
    const bodyText = strip(html);
    for (const term of VOCABULARY) {
      const pattern = new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`, 'gi');
      const entry = termIndex.get(term);
      if (new RegExp(pattern.source, 'i').test(headingText)) entry.headings.push(route);
      if (route.startsWith('/concepts/') && new RegExp(pattern.source, 'i').test(bodyText)) {
        entry.concepts.push(route);
      }
      // Occurrence count, because a heading is not the only way a page owns a topic. The three
      // proof-of-work algorithms are named a dozen times each on /mining/proof-of-work, under a
      // heading reading "The three algorithms", so heading matching alone reported them as
      // explained nowhere.
      const hits = (bodyText.match(pattern) ?? []).length;
      if (hits > 0) entry.counts[route] = hits;
    }
  }
}

/** Journey position of a route, used to order candidate homes for a term. */
const journeyPosition = new Map(
  developerJourney.map((stage, index) => [stage.to.replace(/\/$/, '') || '/', index]),
);
const bestHome = (routes) =>
  [...routes].sort(
    (a, b) => (journeyPosition.get(a) ?? 99) - (journeyPosition.get(b) ?? 99) || a.localeCompare(b),
  )[0] ?? null;

for (const entry of vocabularyLedger.values()) {
  const index = termIndex.get(entry.term);
  // Treated means the term has a section of its own, or it lives on a concepts page whose job
  // is to explain it, or one page carries the clear majority of its mentions.
  const densest = Object.entries(index.counts)
    .filter(([route]) => route !== entry.route)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  entry.treatedAt = bestHome(index.headings) ?? bestHome(index.concepts) ?? densest;
  entry.mentions = index.counts;

  if (entry.introducedOnConceptsPage || entry.explainedInPlace) continue;
  if (entry.treatedAt === entry.route) continue;

  add(
    'friction',
    entry.route,
    entry.treatedAt
      ? `"${entry.term}" is first met here with no link to ${entry.treatedAt}, where it is explained`
      : `"${entry.term}" is first met here and no page explains it, so a reader has nowhere to look it up`,
    entry.context,
  );
}

// ---------------------------------------------------------------------------
// Cross-cutting. Link health across everything the walk touched, and pages that exist in
// the build but not in the sitemap, which no other check in this harness ever visits.
// ---------------------------------------------------------------------------
const linkTargets = new Map();
for (const reading of walk) {
  for (const anchor of reading.anchors ?? []) {
    const href = anchor.href ?? '';
    if (!href.startsWith('/')) continue;
    // Strip the fragment and the query. Docusaurus search links carry `?_highlight=`, and
    // keeping it made one route appear twice and report as absent from the sitemap.
    const target = href.split('#')[0].split('?')[0].replace(/\/$/, '') || '/';
    if (!linkTargets.has(target)) linkTargets.set(target, {target, from: reading.route, text: anchor.text});
  }
}

const brokenLinks = [];
for (const entry of linkTargets.values()) {
  const response = await fetch(`${server.origin}${entry.target}`);
  if (!response.ok) {
    brokenLinks.push({...entry, status: response.status});
    add('blocker', entry.route ?? entry.from, `link to ${entry.target} returns ${response.status}`, entry.text);
  }
}

// A page in the build but absent from the sitemap is reachable by URL and by nothing else.
// Every other check here iterates the sitemap, so these routes are invisible to the harness.
const unlistedRoutes = [...linkTargets.keys()].filter(
  (target) => !routeExists.has(target) && target !== '/search',
);

const summary = {
  capturedAt: new Date().toISOString(),
  stagesWalked: walk.filter((r) => r.leg === 'journey').length,
  pagesVisited: walk.length,
  journeyWords: walk.filter((r) => r.leg === 'journey').reduce((sum, r) => sum + r.bodyWords, 0),
  journeyReadingMinutes:
    Math.round(walk.filter((r) => r.leg === 'journey').reduce((sum, r) => sum + r.readingMinutes, 0) * 10) / 10,
  copyableCommands: walk.reduce((sum, r) => sum + (r.commandBlockCount ?? 0), 0),
  stagesWithoutProof: walk.filter(
    (r) => r.leg === 'journey' && r.commandBlockCount >= 2 && r.outputBlockCount === 0 && r.proofProseCount === 0,
  ).length,
  stagesWithoutPrerequisites: walk.filter(
    (r) => r.leg === 'journey' && r.commandBlockCount >= 2 && !r.prerequisiteSignal,
  ).length,
  unexplainedTerms: [...vocabularyLedger.values()].filter((v) => !v.explainedInPlace).length,
  brokenLinks: brokenLinks.length,
  unlistedRoutesLinked: unlistedRoutes,
  consoleErrors: consoleErrors.length,
  counts: {
    blocker: findings.filter((f) => f.severity === 'blocker').length,
    friction: findings.filter((f) => f.severity === 'friction').length,
    polish: findings.filter((f) => f.severity === 'polish').length,
  },
};

await browser.close();
await server.close();

await fs.mkdir(RESULTS, {recursive: true});
await fs.writeFile(
  path.join(RESULTS, 'journey.json'),
  JSON.stringify(
    {summary, findings, vocabulary: [...vocabularyLedger.values()], walk, consoleErrors},
    null,
    2,
  ),
);

// The notes. Written in walk order so the experience reads as a sequence rather than a table,
// because the sequence is the finding: friction in stage 03 is worse than the same friction in
// stage 08, and no per-page metric can show that.
const notes = [];
notes.push('# Newcomer walk through the docs site');
notes.push('');
notes.push(
  `Generated by \`npm run journey\` in \`audit/\` on ${summary.capturedAt}. One reader, no prior Epic knowledge, following the route the site itself declares in \`site/src/data/developerJourney.js\`.`,
);
notes.push('');
notes.push(
  `${summary.stagesWalked} stages, ${summary.pagesVisited} pages, ${summary.journeyWords} words, about ${summary.journeyReadingMinutes} minutes of reading, ${summary.copyableCommands} copyable commands. ${summary.counts.blocker} blockers, ${summary.counts.friction} friction points, ${summary.counts.polish} polish items.`,
);
notes.push('');

for (const reading of walk) {
  const label = reading.stage ? `Stage ${reading.stage.number}: ${reading.stage.title}` : reading.route;
  notes.push(`## ${label}`);
  notes.push('');
  notes.push(`Route \`${reading.route}\`, ${reading.status}. Title "${reading.h1 ?? '(none)'}".`);
  notes.push('');
  notes.push(`What I wanted here: ${reading.intent}`);
  notes.push('');
  notes.push(
    `What I got: ${reading.bodyWords} words in ${reading.h2Count} sections, ${reading.readingMinutes} min. ${reading.commandBlockCount} commands, ${reading.outputBlockCount} output blocks. Opening is ${reading.ledeWords} words. Prerequisites in the opening: ${reading.prerequisiteSignal ? 'yes' : 'no'}. Forward link: ${reading.journeyNext ?? reading.primaryCta ?? (reading.closingCards.length ? `${reading.closingCards.length} closing card(s)` : 'none')}.`,
  );
  if (reading.placeholders.length) {
    notes.push('');
    notes.push(`Placeholders I have to fill in myself: ${reading.placeholders.map((p) => `\`${p}\``).join(', ')}.`);
  }
  const mine = findings.filter((f) => f.route === reading.route);
  if (mine.length) {
    notes.push('');
    notes.push('What slowed me down:');
    for (const f of mine) {
      notes.push(`- **${f.severity}** ${f.note}${f.evidence ? ` _(${String(f.evidence).slice(0, 140)})_` : ''}`);
    }
  }
  notes.push('');
}

notes.push('## Vocabulary, in the order I met it');
notes.push('');
notes.push('| Term | First met | Stage | Explained at first use | Treated at |');
notes.push('| --- | --- | --- | --- | --- |');
for (const entry of vocabularyLedger.values()) {
  const explained = entry.introducedOnConceptsPage
    ? 'introduced here'
    : entry.explainedInPlace
      ? 'linked'
      : 'no';
  notes.push(
    `| ${entry.term} | \`${entry.route}\` | ${entry.stage} | ${explained} | ${entry.treatedAt ? `\`${entry.treatedAt}\`` : 'nowhere'} |`,
  );
}
notes.push('');

if (unlistedRoutes.length) {
  notes.push('## Linked but not in the sitemap');
  notes.push('');
  notes.push(
    'Reachable by URL and by the links pointing at it, absent from the sitemap, therefore never visited by any other check in this harness.',
  );
  notes.push('');
  for (const route of unlistedRoutes) notes.push(`- \`${route}\``);
  notes.push('');
}

await fs.writeFile(path.join(RESULTS, 'journey-notes.md'), `${notes.join('\n')}\n`);

console.log(JSON.stringify(summary, null, 2));
console.log(`\nnotes written to results/journey-notes.md`);
for (const severity of ['blocker', 'friction', 'polish']) {
  const group = findings.filter((f) => f.severity === severity);
  if (!group.length) continue;
  console.log(`\n${severity} (${group.length}):`);
  for (const f of group) console.log(`  - ${f.route}: ${f.note}`);
}

if (summary.counts.blocker > 0) {
  console.log(`\n${summary.counts.blocker} blocker(s) on the newcomer route`);
  process.exit(1);
}
console.log('\nno blockers on the newcomer route');
