/**
 * Client transport: session handshake, proof of work, and the SSE read loop.
 *
 * Not EventSource. It is GET-only and cannot carry a request body, so a chat turn would have to go in
 * a query string or through a POST-then-GET pair. `fetch` with a ReadableStream keeps the SSE wire
 * format while allowing a POST body, custom headers and a real AbortController.
 *
 * The session token is held in a module variable and never written to a cookie or to localStorage.
 * ePrivacy Article 5(3) governs storing anything on the reader's device, so storing nothing means the
 * rule never engages and the site needs no consent banner for this feature. The cost is that a reload
 * starts a new session, which is acceptable.
 */

const API = '/api/chat';

let session = null; // { token, expiresAt, limits, models, liveData }
let minting = null; // in-flight promise, so concurrent sends share one handshake

/**
 * The reader's model choice, held for the page's lifetime.
 *
 * A module variable for the same reason the session token is one: nothing is written to the reader's
 * device, so ePrivacy Article 5(3) never engages and the site needs no consent banner. A reload
 * therefore returns to the default, which is a fair price for not having a cookie dialogue.
 */
let chosenModel = null;

/* ------------------------------------------------------------------ proof of work */

/**
 * Solves the server's challenge by brute force over a nonce.
 *
 * Uses SubtleCrypto rather than shipping a SHA-256 implementation. Difficulty is set low on the server
 * precisely because this is a script filter and not a cost control: any client that runs JavaScript
 * clears it in well under a second, and no achievable difficulty deters an attacker whose CPU-second
 * costs a fraction of the question it unlocks.
 */
async function solve(challenge, bits, { timeBudgetMs = 8000 } = {}) {
  const encoder = new TextEncoder();
  const started = Date.now();
  const needBytes = Math.ceil(bits / 8);

  for (let nonce = 0; ; nonce += 1) {
    // Check the clock rarely: Date.now() in the hot loop costs more than the hashing.
    if ((nonce & 0x3ff) === 0 && Date.now() - started > timeBudgetMs) {
      throw new Error('proof of work timed out');
    }
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}:${nonce}`)),
    );
    if (leadingZeroBits(digest, needBytes) >= bits) {
      return { nonce: String(nonce), ms: Date.now() - started, attempts: nonce + 1 };
    }
  }
}

function leadingZeroBits(bytes, limit) {
  let count = 0;
  for (let i = 0; i < Math.min(bytes.length, limit + 1); i += 1) {
    const b = bytes[i];
    if (b === 0) { count += 8; continue; }
    count += Math.clz32(b) - 24;
    break;
  }
  return count;
}

/* ------------------------------------------------------------------ session */

/**
 * Reads a JSON response, or explains precisely why it is not JSON.
 *
 * The failure this exists for: during development the Docusaurus dev server answers an unproxied
 * `/api/chat/challenge` with `historyApiFallback`, which returns the site's own HTML shell with status
 * 200. `res.ok` is true, so a naive check passes, and the failure surfaces as a JSON parse error whose
 * message says nothing about the actual problem. Detecting the shell explicitly turns a confusing
 * "unexpected token <" into an instruction.
 */
async function readJson(res, what) {
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();

  if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
    throw new AssistantError(
      'no-proxy',
      'The assistant API is not routed on this origin: the request returned the documentation page ' +
        'instead of data. In development, start the assistant and restart the dev server so /api/chat ' +
        'is proxied, or use the single-origin preview.',
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.parse(text).error ?? '';
    } catch {
      detail = text.slice(0, 200);
    }
    throw new AssistantError(
      res.status === 429 ? 'rate' : 'unavailable',
      detail || `The assistant returned ${res.status} for ${what}.`,
      {retryable: res.status === 429 || res.status >= 500},
    );
  }
  if (!type.includes('json')) {
    throw new AssistantError('unavailable', `Expected JSON from ${what}, received ${type || 'no content type'}.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AssistantError('unavailable', `Could not read the response from ${what}.`);
  }
}

async function mint() {
  const challengeRes = await fetch(`${API}/challenge`, {headers: {accept: 'application/json'}});
  const {challenge, bits} = await readJson(challengeRes, 'the session challenge');

  const solved = await solve(challenge, bits);

  const res = await fetch(`${API}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challenge, nonce: solved.nonce }),
  });
  return readJson(res, 'the session token');
}

async function ensureSession() {
  // A minute of headroom, so a token does not expire between the check and the request.
  if (session && session.expiresAt - Date.now() > 60_000) return session;
  if (!minting) {
    minting = mint()
      .then((s) => { session = s; return s; })
      .finally(() => { minting = null; });
  }
  return minting;
}

/**
 * Runs the handshake before the reader asks anything.
 *
 * Two reasons to do this on panel open rather than on first question. The session response carries the
 * model list, and a picker that appears only after the first answer is a picker nobody uses for their
 * first question. And it moves the proof-of-work solve, a few hundred milliseconds on a slow phone,
 * off the path between pressing Enter and seeing text.
 *
 * Failure is deliberately swallowed. Opening the panel is not the moment to show a handshake error;
 * asking is, and `ask` runs the same handshake and reports properly.
 */
export function prepare() {
  return ensureSession().catch(() => null);
}

export function sessionLimits() {
  return session?.limits ?? null;
}

/**
 * The models the server will accept, or null before the handshake has happened.
 *
 * Read from the session response rather than listed here. The server owns the allowlist that decides
 * which model a request may name, so a hard-coded list in the panel would offer a choice the server
 * rejects the first time the two disagree.
 */
export function modelChoices() {
  return session?.models ?? null;
}

/** Whether this deployment can read live chain and GitHub data, for what the panel says it does. */
export function liveDataAvailable() {
  return Boolean(session?.liveData);
}

export function selectedModel() {
  return chosenModel ?? session?.models?.default ?? null;
}

export function selectModel(id) {
  chosenModel = id;
}

/* ------------------------------------------------------------------ ask */

export class AssistantError extends Error {
  constructor(kind, message, { retryable = false } = {}) {
    super(message);
    this.kind = kind;
    this.retryable = retryable;
  }
}

/**
 * Streams one answer.
 *
 * @param {object} o
 * @param {string} o.question
 * @param {{role: 'user'|'assistant', text: string}[]} o.history
 * @param {AbortSignal} o.signal
 * @param {(event: {type: string, data: any}) => void} o.onEvent
 */
export async function ask({ question, history, signal, onEvent }) {
  let s;
  try {
    s = await ensureSession();
  } catch (err) {
    onEvent({ type: 'error', data: { kind: err.kind ?? 'unavailable', message: err.message } });
    return;
  }

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      authorization: `Bearer ${s.token}`,
    },
    // The model travels in the body rather than a header, because the server treats a header override
    // as the admin path and rejects it without a token. Omitted when nothing has been chosen, so the
    // server applies its own default rather than the panel guessing at one.
    body: JSON.stringify({ question, history, ...(selectedModel() ? { model: selectedModel() } : {}) }),
    signal,
  });

  if (res.status === 401) {
    // The server restarted or the session expired mid-conversation. One silent re-mint and retry,
    // because asking the reader to reload for something we can fix is poor manners.
    session = null;
    const fresh = await ensureSession().catch(() => null);
    if (!fresh) {
      onEvent({ type: 'error', data: { kind: 'unavailable', message: 'Session expired. Reload the page.' } });
      return;
    }
    return ask({ question, history, signal, onEvent });
  }

  if (!res.ok) {
    // Same shell detection as the handshake: an unproxied dev server answers a POST to an unknown
    // path with the site's HTML rather than an error.
    const text = await res.text();
    if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
      onEvent({
        type: 'error',
        data: {
          kind: 'no-proxy',
          message:
            'The assistant API is not routed on this origin. Restart the dev server so /api/chat is ' +
            'proxied, or use the single-origin preview.',
        },
      });
      return;
    }
    let error = '';
    try {
      error = JSON.parse(text).error ?? '';
    } catch {
      error = '';
    }
    onEvent({
      type: 'error',
      data: {
        kind: res.status === 429 ? 'rate' : 'server',
        message: error || `The assistant returned ${res.status}.`,
        retryable: res.status === 429 || res.status >= 500,
      },
    });
    return;
  }
  if (!res.body) {
    onEvent({ type: 'error', data: { kind: 'server', message: 'No response stream.' } });
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE frames are separated by a blank line. Keep the trailing partial frame for the next chunk.
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      if (!frame.trim() || frame.startsWith(':')) continue; // heartbeat comment
      let event = 'message';
      const dataLines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
      }
      if (!dataLines.length) continue;
      let data;
      try {
        data = JSON.parse(dataLines.join('\n'));
      } catch {
        continue;
      }
      onEvent({ type: event, data });
    }
  }
}
