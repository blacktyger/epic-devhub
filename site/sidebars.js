// @ts-check

/**
 * Ordered by what a developer needs first, not by how the code is organised.
 * This is the main structural break from the site it replaces, which led with the node
 * and buried the transaction model.
 *
 * @type {import('@docusaurus/plugin-content-docs').SidebarsConfig}
 */
const sidebars = {
  docs: [
    'start',
    {
      type: 'category',
      label: 'Concepts',
      collapsed: false,
      link: {type: 'doc', id: 'concepts/mimblewimble'},
      items: [
        'concepts/mimblewimble',
        'concepts/interactive-transactions',
        'concepts/outputs-and-locking',
        'concepts/addresses',
        'concepts/accounts',
        'concepts/transports',
        'concepts/payment-proofs',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        // A chain, in order. Each page assumes the one before it and does not repeat it.
        'guides/build',
        'guides/local-network',
        'guides/first-transfer',
        'guides/local-epicbox',
        {
          type: 'category',
          label: 'Connecting to mainnet',
          collapsed: false,
          items: [
            'guides/mainnet-setup',
            'guides/wallet-operations',
            'guides/backup-and-restore',
            'guides/stuck-transactions',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Code examples',
      collapsed: false,
      link: {type: 'doc', id: 'examples/index'},
      items: ['examples/node-api', 'examples/wallet-connect', 'examples/send-receive'],
    },
    {
      type: 'category',
      label: 'API reference',
      collapsed: false,
      link: {type: 'doc', id: 'api/index'},
      items: [
        {
          type: 'category',
          label: 'Node API',
          collapsed: false,
          link: {type: 'doc', id: 'api/node'},
          items: [
            'api/node/chain-reads',
            'api/node/administration',
            'api/node/mempool',
            'api/node/block-templates',
          ],
        },
        {
          type: 'category',
          label: 'Wallet Owner API v3',
          collapsed: false,
          link: {type: 'doc', id: 'api/wallet-owner'},
          items: [
            'api/wallet/session',
            'api/wallet/reading',
            'api/wallet/transfers',
            'api/wallet/proofs',
            'api/wallet/secrets',
            'api/wallet/config',
          ],
        },
        'api/wallet-foreign',
        'api/epicbox',
        'api/authentication',
      ],
    },
    {
      type: 'category',
      // Was "Reference", which sat directly below "API reference" in the same sidebar.
      // Two sibling groups both called reference forces a reader looking for
      // epic-server.toml to guess. This label says what is actually inside.
      label: 'Configuration and CLI',
      items: [
        'reference/cli',
        'reference/node-config',
        'reference/wallet-config',
      ],
    },
    {
      type: 'category',
      label: 'Mining and consensus',
      items: ['mining/proof-of-work', 'mining/emission', 'mining/stratum'],
    },
    'whats-new-in-v4',
    'downloads',
  ],
};

export default sidebars;
