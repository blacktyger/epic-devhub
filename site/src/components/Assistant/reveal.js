/**
 * Paces a bursty stream into a steady reveal.
 *
 * The model does not produce text evenly and the network does not deliver it evenly. Server-sent
 * events arrive in clumps: several hundred characters land in one frame, then nothing for a few
 * hundred milliseconds. Appending each clump straight to state made the answer appear in lurches, and
 * because streamdown fades in newly mounted words, a clump animated forty words at once and then the
 * page sat still. That reads as jank even though nothing is dropped.
 *
 * So arrival and display are separated. Whatever arrives goes into a buffer, and a frame loop drains
 * the buffer at a rate chosen from how much is waiting. Display is smooth regardless of how the bytes
 * showed up, and the per-word fade has a steady trickle of words to work on, which is the case it was
 * designed for.
 *
 * Rate, rather than a fixed characters-per-second, because a fixed rate is wrong in both directions:
 * too slow and a long answer finishes well after the stream did, which feels broken; too fast and the
 * buffer empties and the display stalls anyway. The loop is a proportional controller on how much is
 * waiting: it keeps a reserve in hand and speeds up as the backlog grows past it. That balances itself
 * against whatever rate the model is producing, without measuring it.
 *
 * The cost is a small fixed delay behind the stream, around two thirds of a second at a typical rate.
 * That is invisible next to the seconds of latency before the first token, and it is what buys a
 * reveal with no stalls.
 *
 * Cuts land on word boundaries where one is available. Revealing half a word would make streamdown
 * mount a partial word and then replace it, re-running the fade on text the reader has already seen.
 *
 * No timers: one `requestAnimationFrame` loop, which stops itself when the buffer is empty and the
 * stream is closed. A backgrounded tab throttles rAF, so `dt` is capped to stop a tab returning to the
 * foreground from dumping a whole answer in a single frame.
 */

/**
 * Characters to keep in hand while the stream is open.
 *
 * This is the whole reason the reveal is smooth rather than merely averaged. Draining to empty means
 * the display stalls until the next clump arrives, which is what the first version of this did: a 50ms
 * median gap but eight stalls over 150ms and a worst case of 538ms, because the loop kept emptying the
 * buffer before the network refilled it. Holding a cushion costs a small, fixed delay behind the
 * stream and buys a display that does not stop.
 *
 * Sized to cover the arrival gaps actually measured against Bedrock, which reach about half a second.
 */
const RESERVE_CHARS = 110;

/** Floor while the stream is open, so a thin buffer slows the reveal rather than freezing it. */
const MIN_CPS = 70;

/** Floor once the stream has closed: nothing more is coming, so finish promptly. */
const CLOSING_MIN_CPS = 350;

/** Ceiling, so a large backlog still looks like typing rather than a paste. */
const MAX_CPS = 1500;

/**
 * How hard the rate responds to the buffer sitting above the reserve, in characters per second per
 * character of excess.
 *
 * This makes the loop self-balancing with no need to measure the arrival rate: drain too slowly and
 * the buffer grows, which raises the rate until the two match. Steady state for a 150 c/s answer
 * settles around 100 characters buffered, roughly two thirds of a second behind the stream.
 */
const GAIN = 3.5;

/** Longest frame delta the rate is allowed to act on. */
const MAX_FRAME_MS = 100;

/**
 * @param {object} options
 * @param {(chunk: string) => void} options.onText called with each revealed chunk
 * @param {() => void} [options.onDrained] called once the buffer is empty and the stream is closed
 * @param {boolean} [options.instant] bypass pacing entirely, for `prefers-reduced-motion`
 * @param {typeof requestAnimationFrame} [options.schedule] injectable for tests
 * @param {typeof cancelAnimationFrame} [options.unschedule] injectable for tests
 */
export function createPacer({
  onText,
  onDrained,
  instant = false,
  schedule = (fn) => requestAnimationFrame(fn),
  unschedule = (id) => cancelAnimationFrame(id),
}) {
  let buffer = '';
  let closed = false;
  let stopped = false;
  let frame = null;
  let previous = 0;
  /** Fractional characters carried between frames, so a slow rate is not rounded away to nothing. */
  let carry = 0;

  function settle() {
    frame = null;
    if (closed) onDrained?.();
  }

  function tick(now) {
    if (stopped) return;
    if (!previous) previous = now;
    const dt = Math.min(now - previous, MAX_FRAME_MS);
    previous = now;

    // Proportional control against a target buffer occupancy. While the stream is open the loop aims
    // to keep RESERVE_CHARS in hand; once it closes there is nothing left to protect against, so the
    // target drops to zero and the floor rises to finish without dragging.
    //
    // The reserve is a target, not a wall. An earlier version refused to spend into it, which turned
    // every arrival gap longer than the cushion into a hard freeze: measured as seven stalls and a
    // 680ms worst case. The floor below is what protects a thin buffer now, so a long gap slows the
    // reveal instead of stopping it.
    const reserve = closed ? 0 : RESERVE_CHARS;
    const floor = closed ? CLOSING_MIN_CPS : MIN_CPS;
    const cps = Math.min(MAX_CPS, Math.max(floor, floor + (buffer.length - reserve) * GAIN));
    carry += (cps * dt) / 1000;

    const budget = Math.min(Math.floor(carry), buffer.length);

    if (budget >= 1) {
      let take = budget;
      if (take >= buffer.length) {
        take = buffer.length;
      } else {
        // Back up to the last space or newline inside the budget. -1 from lastIndexOf means there is
        // no boundary to find, so the cut stays mid-word rather than stalling on a long token.
        const cut = Math.max(buffer.lastIndexOf(' ', take), buffer.lastIndexOf('\n', take));
        if (cut > 0) take = cut + 1;
      }
      // Decremented by what was actually taken, not by the budget, so a short cut is not thrown away.
      carry -= take;
      const chunk = buffer.slice(0, take);
      buffer = buffer.slice(take);
      onText(chunk);
    } else {
      // Buffer is empty. Do not let carry accumulate while there is nothing to spend it on, or the
      // next clump to land would be released in one jump.
      carry = Math.min(carry, GAIN);
    }

    if (!buffer && closed) {
      settle();
      return;
    }
    frame = schedule(tick);
  }

  function pump() {
    if (stopped || frame !== null) return;
    previous = 0;
    frame = schedule(tick);
  }

  return {
    /** Text has arrived from the network. */
    push(text) {
      if (stopped || !text) return;
      if (instant) {
        onText(text);
        return;
      }
      buffer += text;
      pump();
    },

    /** The stream ended. Whatever is buffered still reveals at pace, then `onDrained` fires. */
    close() {
      if (stopped || closed) return;
      closed = true;
      if (instant || (!buffer && frame === null)) {
        onDrained?.();
        return;
      }
      pump();
    },

    /**
     * Show everything immediately. For the paths where continuing to type would be wrong: the reader
     * pressed Stop, the connection dropped, or the server replaced the answer with a notice.
     */
    flush() {
      if (stopped) return;
      if (frame !== null) {
        unschedule(frame);
        frame = null;
      }
      if (buffer) {
        const chunk = buffer;
        buffer = '';
        onText(chunk);
      }
      closed = true;
      onDrained?.();
    },

    /** Give up without revealing anything further. For unmount. */
    stop() {
      stopped = true;
      buffer = '';
      if (frame !== null) {
        unschedule(frame);
        frame = null;
      }
    },

    get pending() {
      return buffer.length;
    },
  };
}
