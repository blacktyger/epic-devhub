import {translate} from '@docusaurus/Translate';

export const journeyStorageKey = 'epic-developer-journey-v1';

/**
 * The guided route is pointers only. Every stage links to the canonical page and none of the
 * operational detail is repeated here, so there is no second copy to drift.
 *
 * The order is a dependency chain: each stage assumes the outcome of the one before it. It runs
 * on a private local chain until stage 06, so nothing before that risks real value.
 *
 * The static array carries IDs, numbers and paths. These never change per locale. Display strings
 * (title, outcome) are resolved by translatedJourney(), which must be called at render time.
 */
export const developerJourney = [
  {
    id: 'fundamentals',
    number: '01',
    to: '/concepts/mimblewimble',
  },
  {
    id: 'exchange',
    number: '02',
    to: '/concepts/interactive-transactions',
  },
  {
    id: 'build',
    number: '03',
    to: '/guides/build',
  },
  {
    id: 'local-network',
    number: '04',
    to: '/guides/local-network',
  },
  {
    id: 'transfer',
    number: '05',
    to: '/guides/first-transfer',
  },
  {
    id: 'mainnet',
    number: '06',
    to: '/guides/mainnet-setup',
  },
  {
    id: 'operate',
    number: '07',
    to: '/guides/wallet-operations',
  },
  {
    id: 'integrate',
    number: '08',
    to: '/examples/',
  },
];

/**
 * Returns the journey stages with translated display strings. Call at render time only, because
 * translate() reads the active locale from React context.
 */
export function translatedJourney() {
  return developerJourney.map((stage) => ({
    ...stage,
    title: TITLES[stage.id](),
    outcome: OUTCOMES[stage.id](),
  }));
}

const TITLES = {
  fundamentals: () => translate({id: 'journey.fundamentals.title', message: 'Understand the ledger'}),
  exchange: () => translate({id: 'journey.exchange.title', message: 'Understand the exchange'}),
  build: () => translate({id: 'journey.build.title', message: 'Build the binaries'}),
  'local-network': () => translate({id: 'journey.localNetwork.title', message: 'Run a private chain'}),
  transfer: () => translate({id: 'journey.transfer.title', message: 'Complete a transfer'}),
  mainnet: () => translate({id: 'journey.mainnet.title', message: 'Connect to mainnet'}),
  operate: () => translate({id: 'journey.operate.title', message: 'Operate a wallet'}),
  integrate: () => translate({id: 'journey.integrate.title', message: 'Build an integration'}),
};

const OUTCOMES = {
  fundamentals: () => translate({id: 'journey.fundamentals.outcome', message: 'You know why Epic has no on-chain receiving addresses and no public transaction history.'}),
  exchange: () => translate({id: 'journey.exchange.outcome', message: 'You can describe a slate, its two rounds, and why delivery can fail without losing funds.'}),
  build: () => translate({id: 'journey.build.outcome', message: 'You have working epic, epic-wallet and epic-miner binaries for your platform.'}),
  'local-network': () => translate({id: 'journey.localNetwork.outcome', message: 'A node is producing blocks on usernet and one of your two wallets holds spendable coins.'}),
  transfer: () => translate({id: 'journey.transfer.outcome', message: 'You have moved coins between your own wallets and seen what each transport changes.'}),
  mainnet: () => translate({id: 'journey.mainnet.outcome', message: 'A synced mainnet node and a wallet you have backed up, with real value at stake.'}),
  operate: () => translate({id: 'journey.operate.outcome', message: 'You can receive, send, read what the wallet reports, recover it, and clear a stuck transfer.'}),
  integrate: () => translate({id: 'journey.integrate.outcome', message: 'You can drive the node and wallet APIs and handle Epic\u2019s Ok/Err response envelope.'}),
};

export function journeyStage(id) {
  const base = developerJourney.find((stage) => stage.id === id);
  if (!base) return undefined;
  return {
    ...base,
    title: TITLES[id](),
    outcome: OUTCOMES[id](),
  };
}
