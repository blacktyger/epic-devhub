export const journeyStorageKey = 'epic-developer-journey-v1';

/**
 * The guided route is pointers only. Every stage links to the canonical page and none of the
 * operational detail is repeated here, so there is no second copy to drift.
 *
 * The order is a dependency chain: each stage assumes the outcome of the one before it. It runs
 * on a private local chain until stage 06, so nothing before that risks real value.
 */
export const developerJourney = [
  {
    id: 'fundamentals',
    number: '01',
    title: 'Understand the ledger',
    to: '/concepts/mimblewimble',
    outcome: 'You know why Epic has no on-chain receiving addresses and no public transaction history.',
  },
  {
    id: 'exchange',
    number: '02',
    title: 'Understand the exchange',
    to: '/concepts/interactive-transactions',
    outcome: 'You can describe a slate, its two rounds, and why delivery can fail without losing funds.',
  },
  {
    id: 'build',
    number: '03',
    title: 'Build the binaries',
    to: '/guides/build',
    outcome: 'You have working epic, epic-wallet and epic-miner binaries for your platform.',
  },
  {
    id: 'local-network',
    number: '04',
    title: 'Run a private chain',
    to: '/guides/local-network',
    outcome: 'A node is producing blocks on usernet and one of your two wallets holds spendable coins.',
  },
  {
    id: 'transfer',
    number: '05',
    title: 'Complete a transfer',
    to: '/guides/first-transfer',
    outcome: 'You have moved coins between your own wallets and seen what each transport changes.',
  },
  {
    id: 'mainnet',
    number: '06',
    title: 'Connect to mainnet',
    to: '/guides/mainnet-setup',
    outcome: 'A synced mainnet node and a wallet you have backed up, with real value at stake.',
  },
  {
    id: 'operate',
    number: '07',
    title: 'Operate a wallet',
    to: '/guides/wallet-operations',
    outcome: 'You can receive, send, read what the wallet reports, recover it, and clear a stuck transfer.',
  },
  {
    id: 'integrate',
    number: '08',
    title: 'Build an integration',
    to: '/examples/',
    outcome: 'You can drive the node and wallet APIs and handle Epic’s Ok/Err response envelope.',
  },
];

export function journeyStage(id) {
  return developerJourney.find((stage) => stage.id === id);
}
