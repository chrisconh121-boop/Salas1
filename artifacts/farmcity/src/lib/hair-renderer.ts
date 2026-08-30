/**
 * FarmCity — Layered Hair System
 *
 * Draws directional hair shapes as an independent layer ON TOP of the body sprite.
 * The animation system is never touched — this module only adds visual geometry.
 *
 * Coordinate system
 * -----------------
 *   (sx, sy) = character FEET CENTER in screen space (camera transform already applied).
 *   Rects are [relX, relY, w, h] relative to (sx, sy) in DISPLAY pixels at CHAR_SCALE=0.20.
 *
 * Adding a new hairstyle
 * ----------------------
 *   1. Add the key to HAIR_STYLES.
 *   2. Add a label to HAIR_STYLE_LABELS.
 *   3. Add 5 row arrays (S, SW, W, NW, N) to HAIR_DEFS.
 *   Rows 1/2/3 are for the LEFT-facing direction set; ctx.scale(-1,1) handles the mirrored
 *   variants (SE, E, NE) automatically — no duplicates needed.
 *
 * Reference dimensions at CHAR_SCALE=0.20 (SPRITE_FH=460 → 92px character):
 *   Head center Y from feet : ~60 px
 *   Crown top Y from feet   : ~74 px
 *   Crown width             : ±25 px around center-X
 *   Shoulder (shirt top) Y  : ~39 px above feet
 */

import idleHairSheetUrl from '@assets/9_sin_título_Restaurado_20260809105822_1786495628198.png';
import walkHairSheetUrl from '@assets/8_sin_título_20260804144948_1786495628239.png';

// ── Public types ──────────────────────────────────────────────────────────────

/** First uploaded wardrobe hair style. The idle sheet is used for both idle
 * and walking so the hair silhouette stays stable while the body animates. */
export const HAIR_STYLES: readonly string[] = ['restaurado'];

export type HairStyle = string;

export const HAIR_STYLE_LABELS: Record<string, string> = {
  restaurado: 'Rizado restaurado',
};

/** Display-pixel offset from feet anchor (sy) to head centre. */
export const HEAD_Y_FROM_FEET = 60;

/**
 * 8-direction facing map for the wardrobe preview.
 * index 0-7 = S, SE, E, NE, N, NW, W, SW
 */
export const FACING_MAP: ReadonlyArray<{ row: 0|1|2|3|4; flip: boolean }> = [
  { row: 0, flip: false }, // 0: S  (front)
  { row: 1, flip: true  }, // 1: SE
  { row: 2, flip: true  }, // 2: E
  { row: 3, flip: true  }, // 3: NE
  { row: 4, flip: false }, // 4: N  (back)
  { row: 3, flip: false }, // 5: NW
  { row: 2, flip: false }, // 6: W
  { row: 1, flip: false }, // 7: SW
];

// ── Internal types ────────────────────────────────────────────────────────────

/** [relX, relY, w, h] in display pixels relative to feet centre */
type Rect = readonly [number, number, number, number];

/** 5 directional rows: index 0=S, 1=SW, 2=W, 3=NW, 4=N */
type HairRows = readonly [
  readonly Rect[],
  readonly Rect[],
  readonly Rect[],
  readonly Rect[],
  readonly Rect[],
];

interface HairDef { rows: HairRows }

// Vector hair definitions remain available for future catalog items. Uploaded
// raster sheets use the renderer below so their original silhouettes stay
// intact instead of being approximated with placeholder rectangles.
const HAIR_DEFS: Record<HairStyle, HairDef> = {};

const SHEET_CELL_WIDTH = 460;
const IDLE_CELL_HEIGHT = 453;
const WALK_CELL_HEIGHT = 460;
// Keep the uploaded layer on the exact same pixel scale as the game's
// Character0_* sprite sheets (460px frame × 0.20 = 92px on screen).
const SHEET_SCALE = 0.20;
// The hair should sit on the forehead, only a few display pixels above the
// eyes. This is shared by the plaza and the wardrobe preview.
const SHEET_TOP_FROM_FEET = 92;
const IDLE_BOUNDS: readonly [number, number, number, number][] = [
  [138, 94, 190, 99],
  [151, 98, 180, 147],
  [152, 99, 182, 139],
  [136, 106, 190, 179],
  [135, 107, 191, 135],
];
const WALK_BOUNDS: readonly [number, number, number, number][] = [
  [134, 102, 187, 95],
  [136, 103, 184, 95],
  [86, 98, 235, 112],
  [87, 97, 233, 108],
  [134, 99, 190, 105],
];

type HairAnimation = 'idle' | 'walk';
type HairSheetConfig = {
  url: string;
  columns: number;
  cellHeight: number;
  bounds: readonly [number, number, number, number][];
  /** Maps the game's animation frame to a frame in the uploaded hair sheet. */
  frameMap?: readonly number[];
};

const HAIR_SHEETS: Record<HairAnimation, HairSheetConfig> = {
  idle: {
    url: idleHairSheetUrl,
    columns: 2,
    cellHeight: IDLE_CELL_HEIGHT,
    bounds: IDLE_BOUNDS,
    frameMap: [0, 1, 0, 1, 0, 1, 0, 1],
  },
  walk: {
    url: walkHairSheetUrl,
    columns: 4,
    cellHeight: WALK_CELL_HEIGHT,
    bounds: WALK_BOUNDS,
    // The body walk animation has six frames; the uploaded hair has four.
    // Ping-ponging the last two keeps the silhouette continuous instead of
    // jumping from frame 3 back to frame 0.
    frameMap: [0, 1, 2, 3, 2, 1],
  },
};

const cachedHairSheets = new Map<HairAnimation, HTMLImageElement>();
const hairMaskCache = new Map<string, HTMLCanvasElement>();
const tintedHairCache = new Map<string, HTMLCanvasElement>();

function getHairSheet(animation: HairAnimation): HTMLImageElement {
  let image = cachedHairSheets.get(animation);
  if (!image) {
    image = new Image();
    image.src = HAIR_SHEETS[animation].url;
    cachedHairSheets.set(animation, image);
  }
  return image;
}

function resolveSheetFrame(animation: HairAnimation, frame: number): number {
  const config = HAIR_SHEETS[animation];
  const safeFrame = Math.max(0, Math.round(frame));
  const mappedFrame = config.frameMap?.[safeFrame % config.frameMap.length] ?? safeFrame;
  return mappedFrame % config.columns;
}

/**
 * Converts the uploaded white-background art into a reusable alpha mask.
 * This runs once per direction/column and preserves anti-aliased edges.
 */
function getHairMask(
  animation: HairAnimation,
  row: number,
  frame: number,
): HTMLCanvasElement | null {
  const config = HAIR_SHEETS[animation];
  const img = getHairSheet(animation);
  if (!img.complete || img.naturalWidth === 0) return null;

  const safeRow = Math.max(0, Math.min(4, Math.round(row)));
  const safeFrame = resolveSheetFrame(animation, frame);
  const key = `${animation}:${safeRow}:${safeFrame}`;
  const cached = hairMaskCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = SHEET_CELL_WIDTH;
  canvas.height = config.cellHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img,
    safeFrame * SHEET_CELL_WIDTH,
    safeRow * config.cellHeight,
    SHEET_CELL_WIDTH,
    config.cellHeight,
    0,
    0,
    SHEET_CELL_WIDTH,
    config.cellHeight,
  );

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance =
      pixels.data[index] * 0.299 +
      pixels.data[index + 1] * 0.587 +
      pixels.data[index + 2] * 0.114;
    pixels.data[index] = 255;
    pixels.data[index + 1] = 255;
    pixels.data[index + 2] = 255;
    pixels.data[index + 3] = Math.max(0, 255 - luminance);
  }
  ctx.putImageData(pixels, 0, 0);
  hairMaskCache.set(key, canvas);
  return canvas;
}

function getTintedHairMask(
  animation: HairAnimation,
  row: number,
  frame: number,
  hairColor: string,
): HTMLCanvasElement | null {
  const config = HAIR_SHEETS[animation];
  const safeFrame = resolveSheetFrame(animation, frame);
  const key = `${animation}:${row}:${safeFrame}:${hairColor}`;
  const cached = tintedHairCache.get(key);
  if (cached) return cached;

  const mask = getHairMask(animation, row, safeFrame);
  if (!mask) return null;

  const canvas = document.createElement('canvas');
  canvas.width = SHEET_CELL_WIDTH;
  canvas.height = config.cellHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hairColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
  tintedHairCache.set(key, canvas);
  return canvas;
}

function drawUploadedHairLayer(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  row: number,
  flip: boolean,
  hairColor: string,
  animation: HairAnimation,
  frame: number,
): void {
  const config = HAIR_SHEETS[animation];
  const image = getTintedHairMask(animation, row, frame, hairColor);
  if (!image) return;

  const [sourceX, sourceY, sourceWidth, sourceHeight] = config.bounds[
    Math.max(0, Math.min(config.bounds.length - 1, Math.round(row)))
  ];
  const fullWidth = SHEET_CELL_WIDTH * SHEET_SCALE;
  const fullHeight = config.cellHeight * SHEET_SCALE;
  const fullX = sx - fullWidth / 2;
  const fullY = sy - SHEET_TOP_FROM_FEET + 3;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(sx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-sx, 0);
  }
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    fullX + sourceX * SHEET_SCALE,
    fullY + sourceY * SHEET_SCALE,
    sourceWidth * SHEET_SCALE,
    sourceHeight * SHEET_SCALE,
  );
  ctx.restore();
}

function drawUploadedHairThumbnail(
  ctx: CanvasRenderingContext2D,
  size: number,
  hairColor: string,
): void {
  const row = 0;
  const animation: HairAnimation = 'idle';
  const image = getTintedHairMask(animation, row, 0, hairColor);
  if (!image) return;

  const [sourceX, sourceY, sourceWidth, sourceHeight] =
    HAIR_SHEETS[animation].bounds[row];
  const padding = Math.round(size * 0.12);
  const targetWidth = size - padding * 2;
  const targetHeight = targetWidth * (sourceHeight / sourceWidth);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    padding,
    (size - targetHeight) / 2,
    targetWidth,
    targetHeight,
  );
  ctx.restore();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the hair rects for the given style + directional row.
 * Falls back to row 0 for out-of-range values.  Returns [] for unknown styles.
 */
export function getHairRects(
  hairStyle: HairStyle | string,
  row: number,
): readonly Rect[] {
  const def = HAIR_DEFS[hairStyle as HairStyle];
  if (!def) return [];
  const r = Math.max(0, Math.min(4, Math.round(row))) as 0|1|2|3|4;
  return def.rows[r];
}

/**
 * Draw the hair layer for a character.
 *
 * Call AFTER `drawSpriteCharacter` so hair renders on top of the body.
 * Handles its own flip transform internally so the caller doesn't need to.
 *
 * @param ctx       2D canvas context (world-space / camera-transform already applied)
 * @param sx        Character feet centre X (screen space)
 * @param sy        Character feet anchor Y (screen space)
 * @param row       Sprite row 0–4 (S, SW, W, NW, N)
 * @param flip      True for mirrored facing directions (SE, E, NE)
 * @param hairStyle Style key ('long', 'bun', etc.)
 * @param hairColor CSS colour string
 * @param animation Current body animation; only idle and walk have uploaded
 *                  layered art for now.
 * @param frame Current animation frame in the uploaded sheet.
 */
export function drawHairLayer(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  row: number,
  flip: boolean,
  hairStyle: HairStyle | string,
  hairColor: string,
  animation: string = 'idle',
  frame = 0,
): void {
  if (hairStyle === 'restaurado') {
    // Keep the quiet silhouette while the body walks. The separate walk
    // sheet changes the hair outline from frame to frame, which visibly
    // deforms the hairstyle. Direction still follows the body row and flip.
    drawUploadedHairLayer(ctx, sx, sy, row, flip, hairColor, 'idle', 0);
    return;
  }

  const rects = getHairRects(hairStyle, row);
  if (rects.length === 0) return;

  ctx.save();

  // Mirror around the character's centre-X to match the sprite flip
  if (flip) {
    ctx.translate(sx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-sx, 0);
  }

  // ── Main fill ──────────────────────────────────────────────────────────────
  ctx.fillStyle = hairColor;
  for (const [rx, ry, w, h] of rects) {
    ctx.fillRect(sx + rx, sy + ry, w, h);
  }

  // ── 1px bottom/right shadow for pixel-art depth ────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  for (const [rx, ry, w, h] of rects) {
    ctx.fillRect(sx + rx,         sy + ry + h - 1, w,     1); // bottom edge
    ctx.fillRect(sx + rx + w - 1, sy + ry + 1,     1, h - 1); // right edge
  }

  // ── 1px top highlight ──────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (const [rx, ry, w] of rects) {
    ctx.fillRect(sx + rx + 1, sy + ry, w - 2, 1);
  }

  ctx.restore();
}

/**
 * Render a self-contained hair thumbnail onto any canvas context.
 * Automatically fits and centres the shapes to fill `size × size` pixels.
 *
 * Intended for the wardrobe item grid — no full character sprite needed.
 *
 * @param ctx       Target canvas context
 * @param size      Thumbnail canvas side length (px)
 * @param hairStyle Style key
 * @param hairColor CSS colour string
 */
export function drawHairThumbnail(
  ctx: CanvasRenderingContext2D,
  size: number,
  hairStyle: HairStyle | string,
  hairColor: string,
): void {
  if (hairStyle === 'restaurado') {
    drawUploadedHairThumbnail(ctx, size, hairColor);
    return;
  }

  const rects = getHairRects(hairStyle, 0); // always use front-facing row
  if (rects.length === 0) return;

  // Compute bounding box of all rects
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const [rx, ry, w, h] of rects) {
    minX = Math.min(minX, rx);     maxX = Math.max(maxX, rx + w);
    minY = Math.min(minY, ry);     maxY = Math.max(maxY, ry + h);
  }

  const bw = maxX - minX;
  const bh = maxY - minY;
  if (bw === 0 || bh === 0) return;

  // Scale to fill thumbnail with padding
  const pad = Math.round(size * 0.20);
  const scaleX = (size - pad * 2) / bw;
  const scaleY = (size - pad * 2) / bh;
  const scale  = Math.min(scaleX, scaleY, 4.0); // cap scale so small styles don't get huge

  // Centre offset so the shape is centred in the thumbnail
  const ox = size / 2 - ((minX + maxX) / 2) * scale;
  const oy = size / 2 - ((minY + maxY) / 2) * scale;

  // Main fill
  ctx.fillStyle = hairColor;
  for (const [rx, ry, w, h] of rects) {
    ctx.fillRect(ox + rx * scale, oy + ry * scale, w * scale, h * scale);
  }

  // Pixel-art shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (const [rx, ry, w, h] of rects) {
    ctx.fillRect(ox + rx * scale,               oy + (ry + h) * scale - 1, w * scale,         1);
    ctx.fillRect(ox + (rx + w) * scale - 1,     oy + ry * scale + 1,       1,             h * scale - 1);
  }

  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (const [rx, ry, w] of rects) {
    ctx.fillRect(ox + (rx + 0.5) * scale, oy + ry * scale, (w - 1) * scale, 1);
  }
}
