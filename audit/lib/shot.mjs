import fs from 'node:fs';
import path from 'node:path';

/**
 * Screenshot helpers whose only job is to make sure no PNG this harness produces can poison an
 * agent session.
 *
 * The failure that motivates this file: a throwaway script took `page.screenshot({fullPage:
 * true})` of a long guide page, an agent then read that PNG, and the model API rejected the
 * request with "At least one of the image dimensions exceed max allowed size: 8000 pixels". The
 * image stays in conversation history, so every later request in that session failed the same
 * way. The session was unrecoverable and the work in it had to be reconstructed from the
 * message log. A 1280px-wide docs page passes 8000px tall after roughly six screenfuls, which
 * is an ordinary length for a guide, so this was not an edge case.
 *
 * The rule that follows: a full-page capture is written as tiles, never as one tall image.
 * Tiles are also easier to look at, since a 12000px image is unreadable when scaled to fit.
 */

/** The hard API limit. Nothing produced here may reach it on either axis. */
export const MAX_IMAGE_EDGE = 8000;

/**
 * Tile height. Well under the limit so a device scale factor above 1, which multiplies pixel
 * dimensions, still cannot cross it.
 */
export const TILE_HEIGHT = 3000;

/**
 * Reads pixel dimensions from a file header without decoding it.
 *
 * Header parsing rather than a library because the harness has two dependencies and a size
 * check does not justify a third, and because the hook that guards agent reads must work even
 * when node_modules is absent.
 *
 * Returns null when the format is unknown, which callers must treat as "unknown", not "safe".
 */
export function imageSize(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(64);
    const read = fs.readSync(fd, head, 0, 64, 0);
    if (read < 16) return null;

    // PNG: 8-byte signature, then an IHDR chunk whose width and height are big-endian uint32.
    if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return {format: 'png', width: head.readUInt32BE(16), height: head.readUInt32BE(20)};
    }

    // GIF: little-endian uint16 pair after the "GIF87a" or "GIF89a" signature.
    if (head.subarray(0, 3).toString('latin1') === 'GIF') {
      return {format: 'gif', width: head.readUInt16LE(6), height: head.readUInt16LE(8)};
    }

    // WebP: VP8X carries a 24-bit canvas size minus one; VP8 and VP8L are left unknown rather
    // than guessed, because a wrong number here is worse than no number.
    if (
      head.subarray(0, 4).toString('latin1') === 'RIFF' &&
      head.subarray(8, 12).toString('latin1') === 'WEBP'
    ) {
      if (head.subarray(12, 16).toString('latin1') === 'VP8X') {
        const w = 1 + (head[24] | (head[25] << 8) | (head[26] << 16));
        const h = 1 + (head[27] | (head[28] << 8) | (head[29] << 16));
        return {format: 'webp', width: w, height: h};
      }
      return null;
    }

    // JPEG: walk the segment chain to the frame header that states the size.
    if (head[0] === 0xff && head[1] === 0xd8) {
      const {size} = fs.fstatSync(fd);
      let offset = 2;
      const seg = Buffer.alloc(9);
      while (offset + 9 <= size) {
        fs.readSync(fd, seg, 0, 9, offset);
        if (seg[0] !== 0xff) return null;
        const marker = seg[1];
        const length = seg.readUInt16BE(2);
        // SOF0..SOF15, excluding the DHT, JPGA and DAC markers in that numeric range.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return {format: 'jpeg', width: seg.readUInt16BE(7), height: seg.readUInt16BE(5)};
        }
        offset += 2 + length;
      }
      return null;
    }

    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** True when the file is safe for an agent to read into context. Unknown formats fail closed. */
export function withinImageLimit(file) {
  const size = imageSize(file);
  if (!size) return false;
  return size.width < MAX_IMAGE_EDGE && size.height < MAX_IMAGE_EDGE;
}

/**
 * Captures a whole page as a numbered strip of tiles and returns their paths.
 *
 * Playwright's `clip` is relative to the top of the document when combined with `fullPage`, so
 * each tile is one contiguous slice with no scrolling to coordinate and no overlap to reason
 * about. Sticky elements are not re-rendered per tile the way a scroll-and-shoot loop would
 * re-render them, which is the other reason to prefer clipping.
 */
export async function fullPageTiles(page, outDir, baseName, {tileHeight = TILE_HEIGHT} = {}) {
  fs.mkdirSync(outDir, {recursive: true});

  const total = await page.evaluate(() => {
    const d = document.documentElement;
    const b = document.body;
    return {
      width: Math.max(d.scrollWidth, b ? b.scrollWidth : 0),
      height: Math.max(d.scrollHeight, b ? b.scrollHeight : 0),
      dpr: window.devicePixelRatio || 1,
    };
  });

  // Clip coordinates are CSS pixels but the file is written in device pixels, so a context with
  // deviceScaleFactor 2, which this harness uses for its theme shots, doubles every number.
  const budget = Math.floor((MAX_IMAGE_EDGE - 1) / total.dpr);
  if (total.width > budget) {
    throw new Error(
      `page is ${total.width}px wide at dpr ${total.dpr}, which exceeds the ${MAX_IMAGE_EDGE}px file limit; narrow the viewport`,
    );
  }
  const slice = Math.min(tileHeight, budget);

  const count = Math.max(1, Math.ceil(total.height / slice));
  const written = [];
  for (let i = 0; i < count; i++) {
    const y = i * slice;
    const height = Math.min(slice, total.height - y);
    if (height <= 0) break;
    const file = path.join(outDir, count === 1 ? `${baseName}.png` : `${baseName}-${i + 1}of${count}.png`);
    await page.screenshot({
      path: file,
      fullPage: true,
      clip: {x: 0, y, width: total.width, height},
    });
    written.push(file);
  }

  // Cheap insurance: if a future Playwright change alters how clip and fullPage interact, this
  // fails here rather than in an agent's context window.
  for (const file of written) {
    if (!withinImageLimit(file)) {
      const size = imageSize(file);
      throw new Error(
        `tile ${path.basename(file)} came out ${size ? `${size.width}x${size.height}` : 'unreadable'}, which breaks the ${MAX_IMAGE_EDGE}px contract`,
      );
    }
  }

  return {tiles: written, page: total};
}
