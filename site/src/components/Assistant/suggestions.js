import {translate} from '@docusaurus/Translate';

/**
 * Starter and follow-up prompt pool.
 *
 * Three shown at a time, drawn from a larger pool so the panel does not look scripted. Two design
 * decisions worth stating because they look like omissions:
 *
 * No timed rotation. Cycling suggestions while somebody is reading them is motion for its own sake,
 * it interacts badly with reduced-motion preferences, and usability work on site chatbots finds that
 * re-offering something a reader has already passed over reads as inattentive. Selection varies by
 * page and by page load instead.
 *
 * Selection happens after mount, never during render. This is a static build: a random choice made
 * while rendering produces different markup on the server and the client, which React reports as a
 * hydration mismatch and which can leave the panel inert.
 *
 * Questions are phrased the way a reader would type them, and each one has a real answer in the
 * corpus. At least one in every group demonstrates something a keyword search cannot do.
 */

/** `match` is tested against the current pathname, so a page contributes its own suggestion first. */
export const POOL = [
  // Concepts, and the questions that show what this can do that search cannot
  {q: () => translate({id: 'assistant.suggestion.wrongAddress', message: 'Why can a wrong address not lose my funds?'}), match: /^\/(concepts|$)/, tag: 'concept'},
  {q: () => translate({id: 'assistant.suggestion.bothOnline', message: 'Why does an Epic transfer need both parties online?'}), match: /^\/concepts/, tag: 'concept'},
  {q: () => translate({id: 'assistant.suggestion.slate', message: 'What is a slate, and what is in one?'}), match: /^\/concepts/, tag: 'concept'},
  {q: () => translate({id: 'assistant.suggestion.slateTransport', message: 'What can carry a slate between two wallets?'}), match: /^\/concepts\/transports/, tag: 'concept'},
  {q: () => translate({id: 'assistant.suggestion.hiddenAmounts', message: 'How does MimbleWimble hide amounts?'}), match: /^\/concepts\/mimblewimble/, tag: 'concept'},
  {q: () => translate({id: 'assistant.suggestion.lockedBalance', message: 'Why is my balance locked after a failed send?'}), match: /^\/concepts\/outputs/, tag: 'concept'},

  // Getting something running
  {q: () => translate({id: 'assistant.suggestion.privateChain', message: 'How do I run a private chain on one machine?'}), match: /^\/guides\/local-network/, tag: 'guide'},
  {q: () => translate({id: 'assistant.suggestion.usernetMining', message: 'What config makes a usernet chain actually mine?'}), match: /^\/(guides\/local-network|reference\/node-config)/, tag: 'guide'},
  {q: () => translate({id: 'assistant.suggestion.buildWindows', message: 'How do I build the node on Windows?'}), match: /^\/guides\/build/, tag: 'guide'},
  {q: () => translate({id: 'assistant.suggestion.mainnetSetup', message: 'How do I set up a node and wallet on mainnet?'}), match: /^\/guides\/mainnet-setup/, tag: 'guide'},
  {q: () => translate({id: 'assistant.suggestion.firstTransfer', message: 'How do I complete my first transfer?'}), match: /^\/guides\/first-transfer/, tag: 'guide'},
  {q: () => translate({id: 'assistant.suggestion.backup', message: 'How do I back up a wallet, and what does recovery not restore?'}), match: /^\/guides\/backup/, tag: 'guide'},
  {q: () => translate({id: 'assistant.suggestion.stuck', message: 'My transaction is stuck unconfirmed. What do I do?'}), match: /^\/guides\/stuck/, tag: 'guide'},
  {q: () => translate({id: 'assistant.suggestion.twoWallets', message: 'How do I run two wallets on the same machine?'}), match: /^\/(guides|reference\/wallet-config)/, tag: 'guide'},

  // APIs
  {q: () => translate({id: 'assistant.suggestion.ownerApiPython', message: 'How do I open a wallet over the Owner API from Python?'}), match: /^\/(api|examples)/, tag: 'api'},
  {q: () => translate({id: 'assistant.suggestion.spendingMethods', message: 'Which Owner API methods can spend funds?'}), match: /^\/api\/wallet-owner/, tag: 'api'},
  {q: () => translate({id: 'assistant.suggestion.sendSequence', message: 'What is the full call sequence to send a transaction?'}), match: /^\/api\/wallet/, tag: 'api'},
  {q: () => translate({id: 'assistant.suggestion.encryptedHandshake', message: 'How does the encrypted Owner API handshake work?'}), match: /^\/(api\/wallet-owner|examples\/wallet-connect)/, tag: 'api'},
  {q: () => translate({id: 'assistant.suggestion.credentials', message: 'Which credential does each API surface need?'}), match: /^\/api\/authentication/, tag: 'api'},
  {q: () => translate({id: 'assistant.suggestion.balance', message: 'How do I read a wallet balance and what do the figures mean?'}), match: /^\/api\/wallet\/reading/, tag: 'api'},
  {q: () => translate({id: 'assistant.suggestion.nodeSync', message: 'How do I check whether my node is synced?'}), match: /^\/api\/node/, tag: 'api'},

  // Mining
  {q: () => translate({id: 'assistant.suggestion.algorithms', message: 'Which proof-of-work algorithms does Epic use?'}), match: /^\/mining/, tag: 'mining'},
  {q: () => translate({id: 'assistant.suggestion.reward', message: 'What is the block reward and how does the levy work?'}), match: /^\/mining\/emission/, tag: 'mining'},
  {q: () => translate({id: 'assistant.suggestion.minerNode', message: 'How do I point a miner at my node?'}), match: /^\/mining\/stratum/, tag: 'mining'},

  // Integration
  {q: () => translate({id: 'assistant.suggestion.exchange', message: 'What do I need to integrate Epic into an exchange?'}), match: /^\/guides\/exchange/, tag: 'integration'},
  {q: () => translate({id: 'assistant.suggestion.paymentProof', message: 'How do I prove I paid someone?'}), match: /^\/concepts\/payment-proofs/, tag: 'integration'},

  // Reference lookups
  {q: () => translate({id: 'assistant.suggestion.ports', message: 'Which ports does each component open?'}), match: /^\/reference/, tag: 'reference'},
  {q: () => translate({id: 'assistant.suggestion.v4Changes', message: 'What changed between 3.x and 4.0?'}), match: /^\/whats-new/, tag: 'reference'},
  {q: () => translate({id: 'assistant.suggestion.download', message: 'Where do I download the wallet and how do I verify it?'}), match: /^\/downloads/, tag: 'reference'},
];

/**
 * Picks `count` suggestions, preferring ones relevant to the current page so the panel visibly knows
 * what the reader is looking at. Readers do not assume it does, which is why the panel also says so.
 *
 * @param {string} pathname
 * @param {number} count
 * @param {Set<string>} exclude  questions already asked or already offered and passed over
 */
export function pickSuggestions(pathname = '/', count = 3, exclude = new Set()) {
  const available = POOL.map((p) => ({...p, text: p.q()})).filter((p) => !exclude.has(p.text));
  const local = available.filter((p) => p.match?.test(pathname));
  const rest = available.filter((p) => !p.match?.test(pathname));

  const chosen = [];
  // One page-relevant suggestion first, when the page has one.
  if (local.length) chosen.push(pickOne(local));
  // Then fill from everything else, avoiding two from the same area so the three are not all APIs.
  const usedTags = new Set(chosen.map((c) => c.tag));
  const pool = shuffle(rest);
  for (const candidate of pool) {
    if (chosen.length >= count) break;
    if (usedTags.has(candidate.tag) && pool.length > count * 2) continue;
    chosen.push(candidate);
    usedTags.add(candidate.tag);
  }
  // If tag diversity left us short, top up without the constraint.
  for (const candidate of pool) {
    if (chosen.length >= count) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }
  return chosen.slice(0, count).map((c) => c.text);
}

function pickOne(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
