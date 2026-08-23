/**
 * Minimal Epic node JSON-RPC client. No dependencies beyond Node 20.
 * See https://devdocs.epiccash.com/examples/node-api
 *
 * Override the defaults for another network:
 *   NODE_URL=http://127.0.0.1:23413 EPIC_NETWORK=user node epicNode.mjs
 */

import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const NODE_URL = process.env.NODE_URL ?? 'http://127.0.0.1:3413';
const NETWORK = process.env.EPIC_NETWORK ?? 'main';

// Only the owner surface needs this. Chain reads on /v2/foreign send no credential, so a
// missing file is not fatal.
const secretFile = join(homedir(), '.epic', NETWORK, '.api_secret');
const auth = existsSync(secretFile)
  ? 'Basic ' + Buffer.from(`epic:${readFileSync(secretFile, 'utf8').trim()}`).toString('base64')
  : null;

/**
 * Call a node JSON-RPC method.
 * `surface` is 'owner' for status and peer management, 'foreign' for chain reads.
 */
export async function nodeRpc(method, params = [], surface = 'owner') {
  const headers = {'Content-Type': 'application/json'};
  if (auth) headers.Authorization = auth;

  const response = await fetch(`${NODE_URL}/v2/${surface}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const body = await response.json();
  if (body.error) throw new Error(`JSON-RPC error: ${JSON.stringify(body.error)}`);
  if ('Err' in body.result) throw new Error(`Node error: ${JSON.stringify(body.result.Err)}`);
  return body.result.Ok;
}

/** Fetch a block by height or by hash. Foreign surface, positional params. */
export async function getBlock({height = null, hash = null} = {}) {
  return nodeRpc('get_block', [height, hash, null], 'foreign');
}

// Run directly rather than imported. pathToFileURL matters on Windows, where argv[1] is a
// backslash path and import.meta.url is a file:// URL, so comparing them raw never matches.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const status = await nodeRpc('get_status');
  console.log(`height:     ${status.tip.height}`);
  console.log(`sync state: ${status.sync_status}`);
  console.log(`peers:      ${status.connections}`);

  const tip = await nodeRpc('get_tip', [], 'foreign');
  console.log(`tip hash:   ${tip.last_block_pushed}`);
}
