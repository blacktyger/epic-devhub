/**
 * Minimal Epic wallet Owner API v3 client. No dependencies beyond Node 20.
 *
 * Run `epic-wallet owner_api` first.
 * See https://devdocs.epiccash.com/examples/wallet-connect
 *
 * Override the defaults for a wallet outside the usual location:
 *   EPIC_OWNER_URL=http://127.0.0.1:3420/v3/owner
 *   EPIC_OWNER_SECRET=/path/to/.owner_api_secret
 */

import crypto from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const ALGO = 'aes-256-gcm';

export class EpicWallet {
  constructor({
    url = process.env.EPIC_OWNER_URL ?? 'http://127.0.0.1:3420/v3/owner',
    secretPath = process.env.EPIC_OWNER_SECRET ??
      join(homedir(), '.epic', 'main', '.owner_api_secret'),
  } = {}) {
    this.url = url;
    // The Basic header is not what authorises a v3 call, the token is, so a wallet whose
    // secret lives somewhere else still works.
    this.auth = existsSync(secretPath)
      ? 'Basic ' + Buffer.from(`epic:${readFileSync(secretPath, 'utf8').trim()}`).toString('base64')
      : null;
    this.sharedSecret = null;
    this.token = null;
  }

  // --- transport ---------------------------------------------------------

  async #post(payload) {
    const headers = {'Content-Type': 'application/json'};
    if (this.auth) headers.Authorization = this.auth;

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (response.status === 401) throw new Error('Unauthorized. Check .owner_api_secret');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return EpicWallet.#unwrap(await response.json());
  }

  /** Unwrap the JSON-RPC error field and Epic's inner Ok/Err envelope. */
  static #unwrap(body) {
    if (body.error) throw new Error(`JSON-RPC error: ${JSON.stringify(body.error)}`);
    const result = body.result ?? body;
    if (result && typeof result === 'object') {
      if ('Err' in result) throw new Error(`Wallet error: ${JSON.stringify(result.Err)}`);
      if ('Ok' in result) return result.Ok;
    }
    return result;
  }

  // --- handshake ---------------------------------------------------------

  async connect() {
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.generateKeys();

    const walletPubkey = await this.#post({
      jsonrpc: '2.0',
      id: 1,
      method: 'init_secure_api',
      params: {ecdh_pubkey: ecdh.getPublicKey('hex', 'compressed')},
    });

    // computeSecret returns the x coordinate only, which is exactly what we want.
    this.sharedSecret = ecdh.computeSecret(walletPubkey, 'hex', 'hex');
  }

  async openWallet(password, name = null) {
    if (!this.sharedSecret) await this.connect();
    this.token = await this.call('open_wallet', {name, password});
    return this.token;
  }

  // --- encryption --------------------------------------------------------

  async call(method, params) {
    if (!this.sharedSecret) throw new Error('call connect() first');
    const key = Buffer.from(this.sharedSecret, 'hex');

    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, key, nonce);
    const body = JSON.stringify({jsonrpc: '2.0', id: 1, method, params});
    const enc = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
    // The auth tag is appended to the ciphertext.
    const bodyEnc = Buffer.concat([enc, cipher.getAuthTag()]).toString('base64');

    const envelope = await this.#post({
      jsonrpc: '2.0',
      id: 1,
      method: 'encrypted_request_v3',
      params: {nonce: nonce.toString('hex'), body_enc: bodyEnc},
    });

    const blob = Buffer.from(envelope.body_enc, 'base64');
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(envelope.nonce, 'hex'));
    decipher.setAuthTag(blob.subarray(blob.length - 16));
    const plaintext =
      decipher.update(blob.subarray(0, blob.length - 16), undefined, 'utf8') +
      decipher.final('utf8');

    // The decrypted body is itself a JSON-RPC response, so unwrap again.
    return EpicWallet.#unwrap(JSON.parse(plaintext));
  }
}
