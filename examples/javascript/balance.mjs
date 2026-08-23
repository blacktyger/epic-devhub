/** Read an Epic wallet balance through the Owner API v3. */

import {EpicWallet} from './epicWallet.mjs';

const wallet = new EpicWallet();
await wallet.openWallet(process.env.EPIC_WALLET_PASSWORD);

// retrieve_summary_info returns [validatedAgainstNode, WalletInfo]
const [validated, summary] = await wallet.call('retrieve_summary_info', {
  token: wallet.token,
  refresh_from_node: true,
  minimum_confirmations: 3,
});

const epic = (freemen) => (Number(freemen) / 1e8).toFixed(8);
console.log(`validated against node: ${validated}`);
console.log(`height:                 ${summary.last_confirmed_height}`);
console.log(`total:                  ${epic(summary.total)} EPIC`);
console.log(`spendable:              ${epic(summary.amount_currently_spendable)} EPIC`);
console.log(`locked:                 ${epic(summary.amount_locked)} EPIC`);
