import { useEffect, useRef, useCallback } from 'react';
import { PlayerSummary, Avatar } from '@workspace/api-client-react';
import { drawHairLayer } from '@/lib/hair-renderer';
import { tintLightBodyPixels } from '@/lib/solid-body-tint';

// ─── Constants ───────────────────────────────────────────────────────────────
// 2:1 pixel line ratio → 26.565° isometric angle (arctan(0.5))
// Each iso-axis step = TILE_W/2 right + TILE_H/2 down on screen (run:rise = 2:1)
const TILE_W = 64;
const TILE_H = 32; // TILE_H = TILE_W / 2 enforces the 2:1 ratio
const WALL_H = 110;     // wall height in pixels
const WALL_BASE_COLOR = '#A07848';
const MAP_SIZE = 12;
const WALK_SPEED = 5;   // tiles / second
const CAM_LERP  = 6;    // camera smoothing factor
const REMOTE_LERP_SPEED = 14; // visual follow speed; does not affect local movement

// ─── Sprite system ───────────────────────────────────────────────────────────
const SPRITE_FW    = 460;   // raw frame width (px)
const SPRITE_FH    = 460;   // raw frame height (px)
const CHAR_SCALE   = 0.20;  // final display scale
// foot anchor within the raw 460px frame (px from top)
const SPRITE_FOOT_Y = 430;

/** Avatar color zones applied via multiply tinting on an off-screen canvas */
type AvatarColors = {
  hair: string;
  skin: string;
  shirt: string;
  pants: string;
  hasClothing?: boolean;
};

// Module-level reusable tint canvas — allocated once, never per-frame
let _tintCanvas: HTMLCanvasElement | null = null;
let _tintCtx:    CanvasRenderingContext2D | null = null;
function getTintCtx(minW: number, minH: number): CanvasRenderingContext2D {
  if (!_tintCanvas) {
    _tintCanvas = document.createElement('canvas');
    _tintCtx    = _tintCanvas.getContext('2d')!;
    _tintCtx.imageSmoothingEnabled = false;
  }
  if (_tintCanvas.width  < minW) _tintCanvas.width  = minW;
  if (_tintCanvas.height < minH) _tintCanvas.height = minH;
  return _tintCtx!;
}

/** Sprite row → isometric direction */
// Row 0=South (front), 1=SW, 2=West (side), 3=NW, 4=North (back)
// Rows 1-3 are mirrored for SE, East, NE.

/** Grid velocity (dx, dy) → sprite row + whether to flip horizontally
 *
 * Actual sprite rows (confirmed from sheet):
 *   0 = S  (front, faces viewer)          — direct
 *   1 = SW (lower-left diagonal)          — direct; flip for SE
 *   2 = W  (left side profile)            — direct; flip for E
 *   3 = NW (upper-left diagonal)          — direct; flip for NE
 *   4 = N  (back, faces away)             — direct
 *
 * Isometric mapping: +dx → SE on screen, +dy → SW on screen
 */
function getDirFromVel(dx: number, dy: number): { row: number; flip: boolean } {
  // Use sign-based comparison to handle float velocities
  const sx = dx > 0.001 ? 1 : dx < -0.001 ? -1 : 0;
  const sy = dy > 0.001 ? 1 : dy < -0.001 ? -1 : 0;
  if (sx > 0  && sy === 0) return { row: 1, flip: true  };   // SE = flip SW
  if (sx < 0  && sy === 0) return { row: 3, flip: false };   // NW = direct
  if (sx === 0 && sy > 0 ) return { row: 1, flip: false };   // SW = direct
  if (sx === 0 && sy < 0 ) return { row: 3, flip: true  };   // NE = flip NW
  if (sx > 0  && sy < 0 ) return { row: 2, flip: true  };   // E  = flip W
  if (sx < 0  && sy > 0 ) return { row: 2, flip: false };   // W  = direct
  if (sx > 0  && sy > 0 ) return { row: 0, flip: false };   // S  = front direct
  if (sx < 0  && sy < 0 ) return { row: 4, flip: false };   // N  = back direct
  return { row: 0, flip: false };
}

/** Animation definitions */
const ANIM_DEFS: Record<string, {
  sheet: string;
  frames: number;
  fps: number;
  loop: boolean;
  nextAnim?: string;
  frameOffset?: number;   // start frame within the sheet row
}> = {
  idle:     { sheet: 'idle',    frames: 8, fps: 6,  loop: true  },
  walk:     { sheet: 'walk',    frames: 6, fps: 10, loop: true  },
  run:      { sheet: 'run',     frames: 4, fps: 12, loop: true  },
  sit:      { sheet: 'sit',     frames: 4, fps: 6,  loop: false, nextAnim: 'sit_loop' },
  sit_loop: { sheet: 'sit',     frames: 1, fps: 1,  loop: true,  frameOffset: 3 }, // hold last sit frame
  getup:    { sheet: 'getup',   frames: 4, fps: 6,  loop: false, nextAnim: 'idle' },
  dig:      { sheet: 'dig',     frames: 6, fps: 8,  loop: true  },
  fish:     { sheet: 'fish',    frames: 6, fps: 6,  loop: true  },
  swing:    { sheet: 'swing',   frames: 6, fps: 8,  loop: true  },
  interact: { sheet: 'interact',frames: 3, fps: 6,  loop: false, nextAnim: 'idle' },
};

const SHEET_URLS: Record<string, string> = {
  idle:    `${import.meta.env.BASE_URL}sprites/Character0_Idle.png`,
  walk:    `${import.meta.env.BASE_URL}sprites/Character0_Walk.png`,
  run:     `${import.meta.env.BASE_URL}sprites/Character0_Run.png`,
  sit:     `${import.meta.env.BASE_URL}sprites/Character0_Sit.png`,
  getup:   `${import.meta.env.BASE_URL}sprites/Character0_GetUp.png`,
  dig:     `${import.meta.env.BASE_URL}sprites/Character0_Dig.png`,
  fish:    `${import.meta.env.BASE_URL}sprites/Character0_Fish.png`,
  swing:   `${import.meta.env.BASE_URL}sprites/Character0_Swing.png`,
  interact:`${import.meta.env.BASE_URL}sprites/Character0_Interact.png`,
};

/** Module-level sprite cache (persists across re-mounts) */
const spriteCache = new Map<string, HTMLImageElement>();
function loadSprites(): void {
  for (const [key, url] of Object.entries(SHEET_URLS)) {
    if (spriteCache.has(key)) continue;
    const img = new Image();
    img.src = url;
    spriteCache.set(key, img);
  }
}

/** Per-character animation state (stored in a ref-map keyed by player id) */
interface CharAnimState {
  animKey: string;
  frame: number;
  lastFrameMs: number;
  row: number;       // sprite sheet row (0-4)
  flip: boolean;     // mirror horizontally
}

function makeIdleState(): CharAnimState {
  return { animKey: 'idle', frame: 0, lastFrameMs: 0, row: 0, flip: false };
}

function advanceAnim(state: CharAnimState, now: number): CharAnimState {
  const def = ANIM_DEFS[state.animKey];
  if (!def) return state;
  const msPerFrame = 1000 / def.fps;
  if (now - state.lastFrameMs < msPerFrame) return state;

  const nextFrame = state.frame + 1;
  if (nextFrame >= def.frames) {
    if (def.loop) {
      return { ...state, frame: 0, lastFrameMs: now };
    } else if (def.nextAnim) {
      return { ...state, animKey: def.nextAnim, frame: 0, lastFrameMs: now };
    } else {
      return { ...state, frame: def.frames - 1 }; // hold last frame
    }
  }
  return { ...state, frame: nextFrame, lastFrameMs: now };
}

/** Determine the correct animation key for the local player each frame */
function determineLocalAnim(
  isMoving: boolean,
  now: number,
  actionType: string | null,
  actionUntil: number,
  prevAnimKey: string,
): string {
  const actionActive = actionType !== null && now < actionUntil;

  if (actionActive) {
    switch (actionType) {
      case 'sit':
        // Keep sit/sit_loop as-is; only transition in if we weren't already in one
        if (prevAnimKey === 'sit' || prevAnimKey === 'sit_loop') return prevAnimKey;
        return 'sit';
      case 'dance': return 'swing';
      case 'dig':   return 'dig';
      case 'fish':  return 'fish';
      case 'axe':   return 'swing';
      case 'interact': return 'interact';
      default:      return 'swing';
    }
  }

  // Action expired / none
  if (prevAnimKey === 'sit_loop' || prevAnimKey === 'sit') return 'getup';
  if (prevAnimKey === 'getup') return 'getup'; // let advanceAnim transition → idle
  if (isMoving) return 'walk';
  return 'idle';
}

/** Draw a character using the sprite sheet system */
function drawSpriteCharacter(
  ctx: CanvasRenderingContext2D,
  sx: number,          // feet center X (in camera space)
  sy: number,          // feet Y (in camera space)
  state: CharAnimState,
  name: string,
  colors?: AvatarColors,
): void {
  const def = ANIM_DEFS[state.animKey];
  if (!def) return;
  const img = spriteCache.get(def.sheet);
  if (!img || !img.complete || img.naturalWidth === 0) return; // still loading

  const frameOffset = def.frameOffset ?? 0;
  const srcX = (state.frame + frameOffset) * SPRITE_FW;
  const srcY = state.row * SPRITE_FH;
  const dw   = SPRITE_FW * CHAR_SCALE;
  const dh   = SPRITE_FH * CHAR_SCALE;
  const dx   = sx - dw / 2;
  const dy   = sy - SPRITE_FOOT_Y * CHAR_SCALE;

  ctx.save();
  if (state.flip) {
    ctx.translate(sx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-sx, 0);
  }

  if (colors) {
    // ── Color tinting via off-screen canvas ────────────────────────────────
    // 1. Draw sprite on white background so multiply works correctly
    // 2. Apply zone tints with 'multiply' blend
    // 3. Mask out the white background with 'destination-in' + original sprite
    const tw = Math.ceil(dw);
    const th = Math.ceil(dh);
    const tc = getTintCtx(tw, th);

    tc.clearRect(0, 0, tw, th);
    tc.fillStyle = '#ffffff';
    tc.fillRect(0, 0, tw, th);
    tc.drawImage(img, srcX, srcY, SPRITE_FW, SPRITE_FH, 0, 0, tw, th);

    const { hair, skin, shirt, pants } = colors;
    const w = tw, h = th;

    if (!colors.hasClothing) {
      // Replace the source sprite's light body pixels so the result is
      // exactly the selected armory skin swatch.
      tc.globalCompositeOperation = 'source-over';
      tintLightBodyPixels(tc, skin);
    } else {
      tc.globalCompositeOperation = 'multiply';
      // Skin — face + hands
      tc.fillStyle = skin;
      tc.fillRect(w * 0.26, h * 0.22, w * 0.48, h * 0.30);
      tc.fillRect(w * 0.07, h * 0.62, w * 0.14, h * 0.08);
      tc.fillRect(w * 0.79, h * 0.62, w * 0.14, h * 0.08);

      // Shirt — torso + sleeves
      tc.fillStyle = shirt;
      tc.fillRect(w * 0.22, h * 0.51, w * 0.56, h * 0.22);
      tc.fillRect(w * 0.05, h * 0.51, w * 0.19, h * 0.14);
      tc.fillRect(w * 0.76, h * 0.51, w * 0.19, h * 0.14);

      // Pants — legs
      tc.fillStyle = pants;
      tc.fillRect(w * 0.25, h * 0.72, w * 0.50, h * 0.21);
    }

    // Hair — crown + sideburns. Apply this after the exact body replacement
    // so a light hair swatch cannot be mistaken for skin.
    tc.globalCompositeOperation = 'multiply';
    tc.fillStyle = hair;
    tc.fillRect(w * 0.23, h * 0.15, w * 0.54, h * 0.15);
    tc.fillRect(w * 0.17, h * 0.17, w * 0.13, h * 0.11);
    tc.fillRect(w * 0.70, h * 0.17, w * 0.13, h * 0.11);

    // Restore transparency: keep only pixels where the sprite has alpha
    tc.globalCompositeOperation = 'destination-in';
    tc.drawImage(img, srcX, srcY, SPRITE_FW, SPRITE_FH, 0, 0, tw, th);
    tc.globalCompositeOperation = 'source-over';

    ctx.drawImage(_tintCanvas!, 0, 0, tw, th, dx, dy, dw, dh);
  } else {
    ctx.drawImage(img, srcX, srcY, SPRITE_FW, SPRITE_FH, dx, dy, dw, dh);
  }

  ctx.restore();

  // Name tag above head (head top ≈ y=50 in raw frame)
  const headTopY = dy + 50 * CHAR_SCALE;
  ctx.save();
  ctx.font = 'bold 12px "VT323", monospace';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'bottom';
  const tw = ctx.measureText(name).width;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(sx - tw / 2 - 4, headTopY - 16, tw + 8, 16);
  ctx.fillStyle = '#fff';
  ctx.fillText(name, sx, headTopY);
  ctx.restore();
}

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function isoToScreen(x: number, y: number) {
  return {
    sx: (x - y) * (TILE_W / 2),
    sy: (x + y) * (TILE_H / 2),
  };
}

function screenToIso(sx: number, sy: number) {
  return {
    x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
    y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
  };
}

// ─── Map layout ──────────────────────────────────────────────────────────────
// Obstacle positions (trees + fountain) — expand here to add walls / furniture
const OBSTACLE_COORDS: [number, number][] = [];

const OBSTACLES = new Set(OBSTACLE_COORDS.map(([x, y]) => `${x},${y}`));

const TREE_SET: [number, number][] = OBSTACLE_COORDS.filter(
  ([x, y]) => !(x >= 9 && x <= 11 && y >= 9 && y <= 11)
);

function getTileColor(x: number, y: number): string {
  return (x + y) % 2 === 0 ? '#A8A8A8' : '#989898';
}

// ─── A* pathfinding ───────────────────────────────────────────────────────────
function aStar(
  start: { x: number; y: number },
  goal:  { x: number; y: number },
  blocked: Set<string>,
  size: number,
): { x: number; y: number }[] {
  const key = (x: number, y: number) => `${x},${y}`;
  const h   = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

  type Node = { x: number; y: number; g: number; f: number };
  const open    = new Map<string, Node>();
  const came    = new Map<string, string | null>();
  const gScore  = new Map<string, number>();
  const closed  = new Set<string>();

  const sk = key(start.x, start.y);
  const gk = key(goal.x, goal.y);
  open.set(sk, { x: start.x, y: start.y, g: 0, f: h(start.x, start.y) });
  came.set(sk, null);
  gScore.set(sk, 0);

  while (open.size > 0) {
    // Pick lowest-f node
    let bk = ''; let bf = Infinity;
    for (const [k, n] of open) if (n.f < bf) { bf = n.f; bk = k; }

    if (bk === gk) {
      // Reconstruct
      const path: { x: number; y: number }[] = [];
      let k: string | null = gk;
      while (k && came.has(k)) {
        const [px, py] = k.split(',').map(Number);
        path.unshift({ x: px, y: py });
        k = came.get(k) ?? null;
      }
      return path.slice(1); // exclude start tile
    }

    const cur = open.get(bk)!;
    open.delete(bk);
    closed.add(bk);

    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const nk = key(nx, ny);
      if (closed.has(nk) || blocked.has(nk)) continue;
      const g = (gScore.get(bk) ?? Infinity) + 1;
      if (g < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, g);
        open.set(nk, { x: nx, y: ny, g, f: g + h(nx, ny) });
        came.set(nk, bk);
      }
    }
  }
  return [];
}

// ─── Canvas draw helpers ──────────────────────────────────────────────────────
function drawDiamond(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
  ctx.beginPath();
  ctx.moveTo(sx,              sy);
  ctx.lineTo(sx + TILE_W / 2, sy + TILE_H / 2);
  ctx.lineTo(sx,              sy + TILE_H);
  ctx.lineTo(sx - TILE_W / 2, sy + TILE_H / 2);
  ctx.closePath();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  sx: number, sy: number,
  x: number, y: number,
  target: { x: number; y: number } | null,
  highlightAge: number,
) {
  drawDiamond(ctx, sx, sy);

  const isTarget = target?.x === x && target?.y === y;
  if (isTarget && highlightAge < 2.5) {
    const pulse = 0.55 + 0.45 * Math.sin(highlightAge * 10);
    ctx.fillStyle = `rgba(255, 215, 40, ${pulse})`;
  } else {
    ctx.fillStyle = getTileColor(x, y);
  }
  ctx.fill();

  // 1 px crisp pixel-art grid line
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ─── Isometric wall panels ────────────────────────────────────────────────────
// Left wall: panels along the LEFT edge of the room (col=0, row r = 0..N-1).
// Each panel is the left face of a raised wall block — a parallelogram going
// straight up from the tile's top & left vertices.
function drawLeftWallPanel(ctx: CanvasRenderingContext2D, r: number) {
  const sx = -r * (TILE_W / 2);
  const sy =  r * (TILE_H / 2);

  const brX = sx,              brY = sy;
  const blX = sx - TILE_W / 2, blY = sy + TILE_H / 2;
  const tlX = blX,             tlY = blY - WALL_H;
  const trX = brX,             trY = brY - WALL_H;

  // Lit (left) face — lighter brown
  ctx.beginPath();
  ctx.moveTo(tlX, tlY);
  ctx.lineTo(trX, trY);
  ctx.lineTo(brX, brY);
  ctx.lineTo(blX, blY);
  ctx.closePath();
  ctx.fillStyle = WALL_BASE_COLOR;
  ctx.fill();

  // Bright top edge only (no full outline — avoids horizontal seam lines between panels)
  ctx.strokeStyle = '#C89858';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tlX, tlY);
  ctx.lineTo(trX, trY);
  ctx.stroke();
}

// Right wall: panels along the RIGHT edge of the room (row=0, col c = 0..N-1).
function drawRightWallPanel(ctx: CanvasRenderingContext2D, c: number) {
  const sx = c * (TILE_W / 2);
  const sy = c * (TILE_H / 2);

  const blX = sx,              blY = sy;
  const brX = sx + TILE_W / 2, brY = sy + TILE_H / 2;
  const tlX = blX,             tlY = blY - WALL_H;
  const trX = brX,             trY = brY - WALL_H;

  // Same wood base as the opposite wall face; only the existing edge line
  // distinguishes the panel divisions.
  ctx.beginPath();
  ctx.moveTo(tlX, tlY);
  ctx.lineTo(trX, trY);
  ctx.lineTo(brX, brY);
  ctx.lineTo(blX, blY);
  ctx.closePath();
  ctx.fillStyle = WALL_BASE_COLOR;
  ctx.fill();

  // Bright top edge only (no full outline — avoids horizontal seam lines between panels)
  ctx.strokeStyle = '#9A7040';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tlX, tlY);
  ctx.lineTo(trX, trY);
  ctx.stroke();
}

function drawRoomWallPanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: 'north' | 'east' | 'south' | 'west',
  capStart = false,
  capEnd = false,
) {
  const { sx, sy } = isoToScreen(x, y);
  const edges = {
    north: [[sx, sy], [sx + TILE_W / 2, sy + TILE_H / 2]],
    east: [[sx + TILE_W / 2, sy + TILE_H / 2], [sx, sy + TILE_H]],
    south: [[sx, sy + TILE_H], [sx - TILE_W / 2, sy + TILE_H / 2]],
    west: [[sx - TILE_W / 2, sy + TILE_H / 2], [sx, sy]],
  } as const;
  const [a, b] = edges[side];
  const lowerA: [number, number] = [a[0], a[1] - WALL_H];
  const lowerB: [number, number] = [b[0], b[1] - WALL_H];
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.lineTo(lowerB[0], lowerB[1]);
  ctx.lineTo(lowerA[0], lowerA[1]);
  ctx.closePath();
  ctx.fillStyle = WALL_BASE_COLOR;
  ctx.fill();
  ctx.strokeStyle = '#C89858';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lowerA[0], lowerA[1]);
  ctx.lineTo(lowerB[0], lowerB[1]);
  ctx.stroke();
  // Close only the ends of a continuous wall run. Without these caps the
  // last panel looks sliced off instead of ending as a clean corner.
  ctx.strokeStyle = '#6D4C2B';
  ctx.lineWidth = 1;
  for (const [point, shouldCap] of [[a, capStart], [b, capEnd]] as const) {
    if (!shouldCap) continue;
    ctx.beginPath();
    ctx.moveTo(point[0], point[1]);
    ctx.lineTo(point[0], point[1] - WALL_H);
    ctx.stroke();
  }
}

export type RoomWallSide = 'north' | 'east' | 'south' | 'west';

export interface RoomWall {
  x: number;
  y: number;
  side: RoomWallSide;
}

function drawTree(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
  // Trunk
  ctx.fillStyle = '#7A4F1E';
  ctx.fillRect(sx - 4, sy - 22, 8, 18);
  // Foliage (layered pixel art)
  ctx.fillStyle = '#1E5C0A';
  ctx.fillRect(sx - 16, sy - 50, 32, 16);
  ctx.fillStyle = '#277010';
  ctx.fillRect(sx - 13, sy - 62, 26, 14);
  ctx.fillStyle = '#35921A';
  ctx.fillRect(sx - 9,  sy - 72, 18, 12);
  // Top highlight
  ctx.fillStyle = '#50C030';
  ctx.fillRect(sx - 4, sy - 70, 5, 5);
}

function drawFountain(ctx: CanvasRenderingContext2D, sx: number, sy: number, now: number) {
  // Base ring
  ctx.fillStyle = '#8E8E9A';
  ctx.beginPath(); ctx.ellipse(sx, sy + 8, 30, 13, 0, 0, Math.PI * 2); ctx.fill();
  // Water pool
  const wave = Math.sin(now / 800) * 0.15 + 0.85;
  ctx.fillStyle = `rgba(70, 150, 220, ${wave})`;
  ctx.beginPath(); ctx.ellipse(sx, sy + 2, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Pillar
  ctx.fillStyle = '#ABABBA';
  ctx.fillRect(sx - 5, sy - 32, 10, 32);
  // Top bowl
  ctx.fillStyle = '#8E8E9A';
  ctx.beginPath(); ctx.ellipse(sx, sy - 32, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
  // Animated water top
  const shimmer = Math.sin(now / 600 + 1) * 0.3 + 0.7;
  ctx.fillStyle = `rgba(120, 200, 255, ${shimmer})`;
  ctx.beginPath(); ctx.ellipse(sx, sy - 32, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
}

function drawBench(ctx: CanvasRenderingContext2D, sx: number, sy: number) {
  ctx.fillStyle = '#7A4F1E';
  ctx.fillRect(sx - 18, sy - 8, 36, 6);
  ctx.fillStyle = '#5C3810';
  ctx.fillRect(sx - 14, sy - 2, 5, 8);
  ctx.fillRect(sx + 9,  sy - 2, 5, 8);
}


// ─── Bubble helpers ───────────────────────────────────────────────────────────

/** Deterministic accent colour per username */
const BUBBLE_PALETTE = ['#2980B9','#27AE60','#8E44AD','#E67E22','#C0392B','#16A085','#1A6BA0','#6C3483'];
function getBubbleColor(username: string): string {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (Math.imul(31, h) + username.charCodeAt(i)) | 0;
  return BUBBLE_PALETTE[Math.abs(h) % BUBBLE_PALETTE.length];
}

/** Word-wrap text to fit maxW (in canvas units). Emoji-safe: canvas handles them natively. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** Rounded-rect path (quadraticCurveTo, works in all browsers) */
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Modern speech bubble drawn in raw SCREEN coordinates (call after ctx.restore()).
 *
 * @param sx      screen X of avatar centre
 * @param syFeet  screen Y of avatar feet
 * @param text    message text  (emojis supported natively)
 * @param username  display name shown in bold at top
 * @param alpha   0–1 fade
 * @param scale   0.9–1.0 pop-in
 * @param accent  accent colour for name label & inner border
 * @param cw / ch canvas pixel size for edge-clamping
 */
function drawBubble(
  ctx: CanvasRenderingContext2D,
  sx: number, syFeet: number,
  text: string, username: string,
  alpha: number, scale: number,
  accent: string,
  cw: number, ch: number,
): void {
  // ── Layout ─────────────────────────────────────────────────────────────────
  const PAD_X  = 12;
  const PAD_Y  = 9;
  const R      = 10;          // corner radius
  const TAIL   = 9;           // tail triangle half-base & height
  const MAX_W  = Math.min(260, cw - 24);
  const NAME_S = 14;
  const MSG_S  = 13;
  const LINE_H = 17;
  const GAP    = 4;           // gap between name line and separator

  ctx.save();

  // ── Measure ────────────────────────────────────────────────────────────────
  ctx.font = `bold ${NAME_S}px "VT323", monospace`;
  const nameW = ctx.measureText(username).width;

  ctx.font = `${MSG_S}px "VT323", monospace`;
  const maxCont = Math.max(nameW, Math.min(MAX_W, 200));
  const lines   = wrapText(ctx, text, maxCont);
  const maxLineW = Math.max(nameW, ...lines.map(l => ctx.measureText(l).width));

  const bw = Math.min(maxLineW + PAD_X * 2, MAX_W + PAD_X * 2);
  const bh = PAD_Y + NAME_S + GAP + lines.length * LINE_H + PAD_Y;

  // ── Position (above name-tag; character body ≈ 48 px, nametag ≈ 22 px) ────
  const tipTargetY = syFeet - 74;          // where tail tip points
  let bx = sx - bw / 2;
  let by = tipTargetY - bh - TAIL;

  // Screen-edge clamp
  bx = Math.max(6, Math.min(cw - bw - 6, bx));
  by = Math.max(6, by);

  // ── Pop-in transform (centred on bubble) ───────────────────────────────────
  const bcx = bx + bw / 2;
  const bcy = by + bh / 2;
  ctx.translate(bcx, bcy);
  ctx.scale(scale, scale);
  ctx.translate(-bcx, -bcy);

  ctx.globalAlpha = alpha;

  // ── Drop shadow ────────────────────────────────────────────────────────────
  ctx.shadowColor   = 'rgba(0,0,0,0.26)';
  ctx.shadowBlur    = 9;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;

  // ── Body ───────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#FFFFFF';
  rrect(ctx, bx, by, bw, bh, R);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur  = 0;
  ctx.shadowOffsetY = 0;

  // Outer grey border
  ctx.strokeStyle = '#BDBDBD';
  ctx.lineWidth   = 2;
  rrect(ctx, bx, by, bw, bh, R);
  ctx.stroke();

  // Inner accent border (3-D pixel feel)
  ctx.strokeStyle = accent;
  ctx.lineWidth   = 1;
  rrect(ctx, bx + 2.5, by + 2.5, bw - 5, bh - 5, Math.max(R - 3, 3));
  ctx.stroke();

  // ── Tail ───────────────────────────────────────────────────────────────────
  const tipX = Math.max(bx + R + 4, Math.min(bx + bw - R - 4, sx));

  // White fill (covers bottom border line)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(tipX - TAIL, by + bh);
  ctx.lineTo(tipX + TAIL, by + bh);
  ctx.lineTo(tipX,        by + bh + TAIL);
  ctx.closePath();
  ctx.fill();

  // Tail outline (only the two exposed sides)
  ctx.strokeStyle = '#BDBDBD';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(tipX - TAIL, by + bh - 1);
  ctx.lineTo(tipX,        by + bh + TAIL);
  ctx.lineTo(tipX + TAIL, by + bh - 1);
  ctx.stroke();

  // ── Name (bold, accent colour) ─────────────────────────────────────────────
  ctx.font         = `bold ${NAME_S}px "VT323", monospace`;
  ctx.fillStyle    = accent;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(username, bx + PAD_X, by + PAD_Y);

  // Separator line
  ctx.strokeStyle = '#EBEBEB';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(bx + PAD_X,           by + PAD_Y + NAME_S + GAP);
  ctx.lineTo(bx + bw - PAD_X,      by + PAD_Y + NAME_S + GAP);
  ctx.stroke();

  // ── Message lines ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#222222';
  ctx.font      = `${MSG_S}px "VT323", monospace`;
  lines.forEach((line, i) => {
    ctx.fillText(line, bx + PAD_X, by + PAD_Y + NAME_S + GAP + 2 + i * LINE_H);
  });

  ctx.restore();
}

// ─── Bench tiles (non-blocking, clickable) ───────────────────────────────────
const BENCH_TILES = new Set<string>();

// ─── Component ────────────────────────────────────────────────────────────────
const BUBBLE_DURATION = 6000; // ms total
const BUBBLE_FADE_AT  = 4500; // ms before fade starts
const BUBBLE_POP_MS   = 150;  // pop-in animation duration

interface ChatMsg { username: string; message: string; avatarShirtColor?: string }

/** Action state driven by the avatar panel — read each frame via ref (no re-renders) */
export interface LocalAction {
  emote: { emoji: string; until: number } | null;
  anim:  { type: 'dance' | 'sit' | 'dig' | 'fish' | 'axe' | 'interact'; until: number } | null;
}

interface IsometricCanvasProps {
  localPlayerId:   number;
  localAvatar:     Avatar | undefined;
  localUsername?:  string;
  players:         Record<number, PlayerSummary>;
  /** Network-owned player data; movement packets do not need React renders. */
  playersRef?:     React.RefObject<Record<number, PlayerSummary>>;
  /** Transient animation state received from other clients. */
  remoteActionsRef?: React.RefObject<Map<number, LocalAction>>;
  messages?:       ChatMsg[];
  /** Mutable ref that drives dance / sit / emote without causing re-renders */
  localActionRef?: React.RefObject<LocalAction>;
  onAction?:       (action: string) => void;
  onMove:          (x: number, y: number) => void;
  onClickSelf?:    () => void;
  onClickPlayer?:  (player: PlayerSummary) => void;
  onClickObject?:  (type: 'fountain' | 'tree' | 'bench') => void;
  /** Called once with the raw <canvas> element so the parent can screenshot it */
  onCanvasMount?:  (el: HTMLCanvasElement) => void;
  roomTiles?: Array<{ x: number; y: number }>;
  roomWalls?: RoomWall[];
}

export function IsometricCanvas({
  localPlayerId, localAvatar, localUsername, players, messages,
  playersRef: externalPlayersRef,
  remoteActionsRef: externalRemoteActionsRef,
  localActionRef, onAction, onMove,
  onClickSelf, onClickPlayer, onClickObject, onCanvasMount,
  roomTiles, roomWalls,
}: IsometricCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Held keyboard keys (for diagonal + smooth movement)
  const heldKeysRef = useRef<Set<string>>(new Set());

  // All mutable animation state lives in refs → no React re-renders per frame
  const posRef           = useRef({ x: 5.0, y: 5.0 });   // sub-tile float position
  const pathRef          = useRef<{ x: number; y: number }[]>([]);
  const camRef           = useRef({ x: 0.0, y: 0.0 });
  const panOffsetRef     = useRef({ x: 0, y: 0 });          // accumulated touch-drag offset
  const touchPanRef      = useRef<{
    startX: number; startY: number;
    startPanX: number; startPanY: number;
    moved: boolean;
  } | null>(null);
  const targetTileRef    = useRef<{ x: number; y: number } | null>(null);
  const highlightTimeRef = useRef(0);

  // Sprite animation state: keyed by player id (-1 = local)
  const animStateMapRef     = useRef<Map<number, CharAnimState>>(new Map());
  // Previous position per player (for direction + walk detection)
  const prevPosMapRef       = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Remote positions are split into network targets and renderer-owned values.
  const remoteVisualMapRef  = useRef<Map<number, {
    currentX: number;
    currentY: number;
    targetX: number;
    targetY: number;
  }>>(new Map());
  const lastPositionSyncMsRef = useRef(0);

  // Preload all sprites once on mount
  useEffect(() => { loadSprites(); }, []);

  // Speech bubbles: username → { text, startTime }
  const bubblesRef = useRef<Map<string, { text: string; startTime: number; color: string }>>(new Map());

  // Mirror latest props into refs so the render loop always has fresh data
  const playersStateRef   = useRef(players);
  const playersRef        = externalPlayersRef ?? playersStateRef;
  const remoteActionsStateRef = useRef<Map<number, LocalAction>>(new Map());
  const remoteActionsRef  = externalRemoteActionsRef ?? remoteActionsStateRef;
  const localAvatarRef    = useRef(localAvatar);
  const localUsernameRef  = useRef(localUsername);
  const onMoveRef         = useRef(onMove);
  const onActionRef       = useRef(onAction);
  const onClickSelfRef    = useRef(onClickSelf);
  const onClickPlayerRef  = useRef(onClickPlayer);
  const onClickObjectRef  = useRef(onClickObject);
  const roomTilesRef      = useRef(roomTiles ?? []);
  const roomWallsRef      = useRef(roomWalls ?? []);
  useEffect(() => { playersStateRef.current = players;       }, [players]);
  useEffect(() => { localAvatarRef.current   = localAvatar;   }, [localAvatar]);
  useEffect(() => { localUsernameRef.current = localUsername; }, [localUsername]);
  useEffect(() => { onMoveRef.current        = onMove;        }, [onMove]);
  useEffect(() => { onActionRef.current      = onAction;      }, [onAction]);
  useEffect(() => { onClickSelfRef.current   = onClickSelf;   }, [onClickSelf]);
  useEffect(() => { onClickPlayerRef.current = onClickPlayer; }, [onClickPlayer]);
  useEffect(() => { onClickObjectRef.current = onClickObject; }, [onClickObject]);
  useEffect(() => { roomTilesRef.current = roomTiles ?? []; }, [roomTiles]);
  useEffect(() => { roomWallsRef.current = roomWalls ?? []; }, [roomWalls]);
  useEffect(() => {
    if (!roomTiles?.length) return;
    const tileSet = new Set(roomTiles.map((tile) => `${tile.x},${tile.y}`));
    const centerX = roomTiles.reduce((sum, tile) => sum + tile.x, 0) / roomTiles.length;
    const centerY = roomTiles.reduce((sum, tile) => sum + tile.y, 0) / roomTiles.length;
    const start = [...roomTiles]
      .filter((tile) => [
        `${tile.x - 1},${tile.y}`,
        `${tile.x + 1},${tile.y}`,
        `${tile.x},${tile.y - 1}`,
        `${tile.x},${tile.y + 1}`,
      ].every((neighbor) => tileSet.has(neighbor)))
      .sort((a, b) =>
        Math.hypot(a.x - centerX, a.y - centerY) - Math.hypot(b.x - centerX, b.y - centerY),
      )[0] ?? roomTiles[Math.floor(roomTiles.length / 2)];
    posRef.current = { x: start.x, y: start.y };
    pathRef.current = [];
  }, [roomTiles]);

  // Fire onCanvasMount once so the parent can grab the HTMLCanvasElement (e.g. for screenshot)
  useEffect(() => {
    if (canvasRef.current && onCanvasMount) onCanvasMount(canvasRef.current);
  }, [onCanvasMount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update bubbles whenever a new message arrives
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const last = messages[messages.length - 1];
    bubblesRef.current.set(last.username, {
      text: last.message,
      startTime: performance.now(),
      color: getBubbleColor(last.username),
    });
  }, [messages]);

  // ── Pointer → tile → A* ───────────────────────────────────────────────────
  const handlePointer = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect   = canvas.getBoundingClientRect();
    // Account for CSS scaling (canvas may be displayed smaller/larger than its pixel size)
    const cx = (clientX - rect.left) * (canvas.width  / rect.width);
    const cy = (clientY - rect.top)  * (canvas.height / rect.height);

    // Undo the camera transform applied in the render loop:
    //   ctx.translate(-cam.x, -cam.y + WALL_H + TILE_H)
    const worldX = cx + camRef.current.x;
    const worldY = cy + camRef.current.y - WALL_H - TILE_H;

    const { x: fx, y: fy } = screenToIso(worldX, worldY);
    const tx = Math.round(fx);
    const ty = Math.round(fy);

    if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) return;
    const roomSet = new Set(roomTilesRef.current.map((tile) => `${tile.x},${tile.y}`));
    if (roomSet.size > 0 && !roomSet.has(`${tx},${ty}`)) return;

    // Always highlight the tapped tile
    targetTileRef.current    = { x: tx, y: ty };
    highlightTimeRef.current = performance.now();

    const sx = Math.round(posRef.current.x);
    const sy = Math.round(posRef.current.y);

    // ── Entity hit detection (priority: self → other player → object → move) ──

    // 1. Own avatar
    if (tx === sx && ty === sy) {
      onClickSelfRef.current?.();
      return;
    }

    // 2. Another player standing on that tile
    for (const p of Object.values(playersRef.current)) {
      if (p.posX == null || p.posY == null) continue;
      if (Math.round(p.posX) === tx && Math.round(p.posY) === ty) {
        onClickPlayerRef.current?.(p);
        return;
      }
    }

    // 3. Bench (non-blocking but clickable)
    if (BENCH_TILES.has(`${tx},${ty}`)) {
      onClickObjectRef.current?.('bench');
      return;
    }

    // 5. Tree (remaining obstacle tiles)
    if (OBSTACLES.has(`${tx},${ty}`)) {
      onClickObjectRef.current?.('tree');
      return;
    }

    // 6. Walk to tile
    if (sx === tx && sy === ty) return;
    const blocked = roomSet.size > 0
      ? new Set(Array.from({ length: MAP_SIZE }, (_, x) =>
          Array.from({ length: MAP_SIZE }, (_, y) => `${x},${y}`),
        ).flat().filter((key) => !roomSet.has(key)))
      : OBSTACLES;
    const path = aStar({ x: sx, y: sy }, { x: tx, y: ty }, blocked, MAP_SIZE);
    if (path.length > 0) {
      // Cancel sit when clicking to move
      if (localActionRef?.current?.anim?.type === 'sit') {
        localActionRef.current.anim = null;
        onActionRef.current?.('standup');
      }
      pathRef.current = path;
    }
    // If no path found, character stays put (never gets stuck)
  }, []);

  // ── Attach click + touch events ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      handlePointer(e.clientX, e.clientY);
    };

    // ── Touch pan + tap ────────────────────────────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      touchPanRef.current = {
        startX: t.clientX, startY: t.clientY,
        startPanX: panOffsetRef.current.x,
        startPanY: panOffsetRef.current.y,
        moved: false,
      };
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const pan = touchPanRef.current;
      if (!pan) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - pan.startX;
      const dy = t.clientY - pan.startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) pan.moved = true;
      if (pan.moved) {
        // Scale by canvas/display ratio so drag tracks finger exactly
        const rect = canvas.getBoundingClientRect();
        const scale = canvas.width / rect.width;
        panOffsetRef.current = {
          x: pan.startPanX - dx * scale,
          y: pan.startPanY - dy * scale,
        };
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      const pan = touchPanRef.current;
      touchPanRef.current = null;
      if (!pan || pan.moved) return; // drag — not a tap
      const t = e.changedTouches[0];
      if (t) handlePointer(t.clientX, t.clientY);
    };

    canvas.addEventListener('click',      onClick);
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
    return () => {
      canvas.removeEventListener('click',      onClick);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove',  onTouchMove);
      canvas.removeEventListener('touchend',   onTouchEnd);
    };
  }, [handlePointer]);

  // ── Keyboard navigation — held-key tracking for smooth + diagonal movement ─
  useEffect(() => {
    const MOVEMENT_KEYS = new Set([
      'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d',
    ]);
    const onKeyDown = (e: KeyboardEvent) => {
      if (!MOVEMENT_KEYS.has(e.key)) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      heldKeysRef.current.add(e.key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.key);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup',   onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup',   onKeyUp);
    };
  }, []);

  // ── Main animation / render loop (runs once, reads refs) ──────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive canvas size via ResizeObserver
    const ro = new ResizeObserver(() => {
      const p = canvas.parentElement;
      if (p) { canvas.width = p.clientWidth; canvas.height = p.clientHeight; }
    });
    const parent = canvas.parentElement;
    if (parent) {
      ro.observe(parent);
      canvas.width  = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    ctx.imageSmoothingEnabled = false;
    let last = performance.now();
    let animId: number;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1); // cap at 100 ms
      last = now;

      // ── Walk along path ──────────────────────────────────────────────────
      if (pathRef.current.length > 0) {
        const next = pathRef.current[0];
        const dx   = next.x - posRef.current.x;
        const dy   = next.y - posRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const step = WALK_SPEED * dt;

        if (dist <= step) {
          // Arrived at this waypoint
          posRef.current = { x: next.x, y: next.y };
          pathRef.current = pathRef.current.slice(1);
          if (pathRef.current.length === 0) {
            // Final destination reached → notify server
            onMoveRef.current(next.x, next.y);
          }
        } else {
          posRef.current = {
            x: posRef.current.x + (dx / dist) * step,
            y: posRef.current.y + (dy / dist) * step,
          };
        }
      }

      // Publish the local sub-tile position at a steady cadence while the
      // existing movement loop is active. This does not change local motion;
      // it only gives remote clients enough targets to interpolate smoothly.
      if (
        pathRef.current.length > 0 &&
        now - lastPositionSyncMsRef.current >= 100
      ) {
        lastPositionSyncMsRef.current = now;
        onMoveRef.current(posRef.current.x, posRef.current.y);
      }

      // ── Held-key polling: queue next tile when path is clear ─────────────
      // Each key maps to an isometric screen-cardinal direction (diagonal in grid):
      //   Up/W   → North on screen = (-1,-1) grid → row 4 (back, facing away)
      //   Down/S → South on screen = (+1,+1) grid → row 0 (front, facing viewer)
      //   Left/A → West  on screen = (-1,+1) grid → row 2 flip (side-left)
      //   Right/D→ East  on screen = (+1,-1) grid → row 2 (side-right)
      // Combining two keys (e.g. W+D) cancels one axis and gives a diagonal row (1 or 3).
      if (heldKeysRef.current.size > 0 && pathRef.current.length === 0) {
        let kx = 0, ky = 0;
        if (heldKeysRef.current.has('ArrowUp')    || heldKeysRef.current.has('w')) { kx -= 1; ky -= 1; }
        if (heldKeysRef.current.has('ArrowDown')  || heldKeysRef.current.has('s')) { kx += 1; ky += 1; }
        if (heldKeysRef.current.has('ArrowLeft')  || heldKeysRef.current.has('a')) { kx -= 1; ky += 1; }
        if (heldKeysRef.current.has('ArrowRight') || heldKeysRef.current.has('d')) { kx += 1; ky -= 1; }
        // Normalize to [-1, 0, 1] per axis (handles opposite-key cancellation)
        if (kx !== 0) kx = kx > 0 ? 1 : -1;
        if (ky !== 0) ky = ky > 0 ? 1 : -1;

        if (kx !== 0 || ky !== 0) {
          const cx = Math.round(posRef.current.x);
          const cy = Math.round(posRef.current.y);
          const roomSet = new Set(roomTilesRef.current.map((tile) => `${tile.x},${tile.y}`));
          const blocked = roomSet.size > 0
            ? new Set(Array.from({ length: MAP_SIZE }, (_, x) =>
                Array.from({ length: MAP_SIZE }, (_, y) => `${x},${y}`),
              ).flat().filter((key) => !roomSet.has(key)))
            : OBSTACLES;
          let nx = Math.max(0, Math.min(MAP_SIZE - 1, cx + kx));
          let ny = Math.max(0, Math.min(MAP_SIZE - 1, cy + ky));

          // Diagonal obstacle fallback: try each cardinal axis independently
          if (blocked.has(`${nx},${ny}`) && kx !== 0 && ky !== 0) {
            const xBlocked = blocked.has(`${Math.max(0,Math.min(MAP_SIZE-1,cx+kx))},${cy}`);
            const yBlocked = blocked.has(`${cx},${Math.max(0,Math.min(MAP_SIZE-1,cy+ky))}`);
            if (!xBlocked) { ny = cy; }
            else if (!yBlocked) { nx = cx; }
          }

          if ((nx !== cx || ny !== cy) && !blocked.has(`${nx},${ny}`)) {
            // Cancel sit when keyboard movement starts
            if (localActionRef?.current?.anim?.type === 'sit') {
              localActionRef.current.anim = null;
              onActionRef.current?.('standup');
            }
            targetTileRef.current    = { x: nx, y: ny };
            highlightTimeRef.current = now;
            pathRef.current          = [{ x: nx, y: ny }];
          }
        }
      }

      // ── Camera lerp ──────────────────────────────────────────────────────
      const { sx: psx, sy: psy } = isoToScreen(posRef.current.x, posRef.current.y);
      const tcx  = psx - canvas.width  / 2 + panOffsetRef.current.x;
      const tcy  = psy - canvas.height / 2 + panOffsetRef.current.y;
      const lerp = 1 - Math.exp(-CAM_LERP * dt);
      camRef.current.x += (tcx - camRef.current.x) * lerp;
      camRef.current.y += (tcy - camRef.current.y) * lerp;

      // ── Clear ────────────────────────────────────────────────────────────
      // Dark void — areas outside the room boundary (like Habbo)
      ctx.fillStyle = '#1E2433';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      // Disable anti-aliasing for crisp pixel-art rendering
      ctx.imageSmoothingEnabled = false;
      // Extra vertical headroom so walls are visible above tile (0,0)
      ctx.translate(-camRef.current.x, -camRef.current.y + WALL_H + TILE_H);

      const savedRoom = roomTilesRef.current;
      const savedRoomSet = new Set(savedRoom.map((tile) => `${tile.x},${tile.y}`));
      // Walls remain part of the room data for compatibility with the editor
      // and multiplayer snapshots, but are intentionally not rendered here.
      // Keeping this layer empty preserves the existing movement, camera,
      // tile layout, objects, and character designs.

      const highlightAge = (now - highlightTimeRef.current) / 1000;
      const targetTile   = targetTileRef.current;

      // ── Draw tiles in isometric depth order (diagonals, back→front) ──────
      for (let sum = 0; sum < MAP_SIZE * 2 - 1; sum++) {
        for (let x = 0; x <= sum; x++) {
          const y = sum - x;
          if (x >= MAP_SIZE || y >= MAP_SIZE) continue;
          if (savedRoomSet.size > 0 && !savedRoomSet.has(`${x},${y}`)) continue;
          const { sx, sy } = isoToScreen(x, y);
          drawTile(ctx, sx, sy, x, y, targetTile, highlightAge);
        }
      }

      // ── Collect entities for depth-sorted rendering ────────────────────
      type Entity = { depth: number; draw: () => void };
      const entities: Entity[] = [];

      // ── Bubble state helper ──────────────────────────────────────────────────
      type BubbleState = { text: string; alpha: number; scale: number; color: string };
      const getBubble = (username: string): BubbleState | null => {
        const b = bubblesRef.current.get(username);
        if (!b) return null;
        const age = now - b.startTime;
        if (age >= BUBBLE_DURATION) { bubblesRef.current.delete(username); return null; }
        const alpha = age >= BUBBLE_FADE_AT
          ? 1 - (age - BUBBLE_FADE_AT) / (BUBBLE_DURATION - BUBBLE_FADE_AT)
          : 1;
        const scale = age < BUBBLE_POP_MS ? 0.9 + 0.1 * (age / BUBBLE_POP_MS) : 1;
        return { text: b.text, alpha, scale, color: b.color };
      };

      // Bubbles are collected here and drawn AFTER ctx.restore() (screen space)
      // so they always appear on top and can be screen-edge clamped.
      type BubbleDraw = BubbleState & { sx: number; sy: number; username: string };
      const pendingBubbles: BubbleDraw[] = [];

      // ── Local player ─────────────────────────────────────────────────────────
      const localUname  = localUsernameRef.current ?? '';
      const { sx: lsx, sy: lsy } = isoToScreen(posRef.current.x, posRef.current.y);

      // Compute velocity from previous position (for direction detection)
      const lPrev  = prevPosMapRef.current.get(-1) ?? posRef.current;
      const lVelX  = posRef.current.x - lPrev.x;
      const lVelY  = posRef.current.y - lPrev.y;
      const lMoving = Math.abs(lVelX) + Math.abs(lVelY) > 0.001;
      prevPosMapRef.current.set(-1, { x: posRef.current.x, y: posRef.current.y });

      // Read action state
      const localAction   = localActionRef?.current ?? null;
      const actionType    = localAction?.anim?.type ?? null;
      const actionUntil   = localAction?.anim?.until ?? 0;

      // Get or create animation state for local player
      let lState = animStateMapRef.current.get(-1) ?? makeIdleState();

      // Determine which animation should be playing
      const targetAnim = determineLocalAnim(lMoving, now, actionType, actionUntil, lState.animKey);
      if (targetAnim !== lState.animKey) {
        // Reset only the animation frame. The sprite row and flip are the
        // character's facing, so idle must inherit them from the last walk
        // frame instead of choosing another direction.
        lState = {
          ...makeIdleState(),
          animKey: targetAnim,
          row: lState.row,
          flip: lState.flip,
        };
      }

      // Update direction when moving
      if (lMoving) {
        const dir = getDirFromVel(lVelX, lVelY);
        lState = { ...lState, row: dir.row, flip: dir.flip };
      }

      // Advance frame
      lState = advanceAnim(lState, now);
      animStateMapRef.current.set(-1, lState);

      // Store local screen position for emote / bubble pass (screen-space, after restore)
      const localScreenSx = lsx - camRef.current.x;
      const localScreenSy = lsy + TILE_H / 2 - camRef.current.y + TILE_H * 2;

      const localBubble = getBubble(localUname);
      if (localBubble) {
        pendingBubbles.push({
          ...localBubble, username: localUname,
          sx: localScreenSx,
          sy: localScreenSy,
        });
      }
      // Capture state + colors for closure (avoid stale ref in entity draw)
      const lStateSnap = lState;
      const lAvatar    = localAvatarRef.current;
      const lColors: AvatarColors | undefined = lAvatar ? {
        hair:  lAvatar.hairColor,
        skin:  lAvatar.skinColor,
        shirt: lAvatar.skinColor,
        pants: lAvatar.skinColor,
      } : undefined;
      entities.push({
        depth: posRef.current.x + posRef.current.y,
        draw: () => {
          const lFeetY = lsy + TILE_H / 2;
drawSpriteCharacter(ctx, lsx, lFeetY, lStateSnap, 'Tú', lColors);
if (lAvatar?.hairStyle && lAvatar.hairStyle !== 'none') {
  const SIT_HAIR_Y_ADJUST = 12; // ajustar este número según pruebas
  const isSitting = lStateSnap.animKey === 'sit' || lStateSnap.animKey === 'sit_loop';
  const hairFeetY = lFeetY + (isSitting ? SIT_HAIR_Y_ADJUST : 0);

  drawHairLayer(
    ctx,
    lsx,
    hairFeetY,
    lStateSnap.row,
    lStateSnap.flip,
    lAvatar.hairStyle,
    lAvatar.hairColor,
    lStateSnap.animKey,
    lStateSnap.frame,
  );
          }
        },
      });

      // ── Remote players ───────────────────────────────────────────────────────
      const activeRemoteIds = new Set<number>();
      for (const p of Object.values(playersRef.current)) {
        if (p.id === localPlayerId || p.posX == null || p.posY == null) continue;
        activeRemoteIds.add(p.id);

        // Network position is the logical target. The renderer owns the
        // current visual position and eases it toward the newest target every
        // animation frame, independent of packet timing and React renders.
        let remoteVisual = remoteVisualMapRef.current.get(p.id);
        if (!remoteVisual) {
          remoteVisual = {
            currentX: p.posX,
            currentY: p.posY,
            targetX: p.posX,
            targetY: p.posY,
          };
          remoteVisualMapRef.current.set(p.id, remoteVisual);
        } else {
          remoteVisual.targetX = p.posX;
          remoteVisual.targetY = p.posY;
        }

        const remoteLerp = 1 - Math.exp(-REMOTE_LERP_SPEED * dt);
        remoteVisual.currentX += (remoteVisual.targetX - remoteVisual.currentX) * remoteLerp;
        remoteVisual.currentY += (remoteVisual.targetY - remoteVisual.currentY) * remoteLerp;
        if (Math.abs(remoteVisual.targetX - remoteVisual.currentX) < 0.001) {
          remoteVisual.currentX = remoteVisual.targetX;
        }
        if (Math.abs(remoteVisual.targetY - remoteVisual.currentY) < 0.001) {
          remoteVisual.currentY = remoteVisual.targetY;
        }

        const { sx: rx, sy: ry } = isoToScreen(remoteVisual.currentX, remoteVisual.currentY);
        const depth = remoteVisual.currentX + remoteVisual.currentY;

        // Direction and walk animation use the visual position, so the sprite
        // matches interpolated movement instead of packet arrival timing.
        const rPrev = prevPosMapRef.current.get(p.id) ?? {
          x: remoteVisual.currentX,
          y: remoteVisual.currentY,
        };
        const rVelX = remoteVisual.currentX - rPrev.x;
        const rVelY = remoteVisual.currentY - rPrev.y;
        const rMoving =
          Math.abs(remoteVisual.targetX - remoteVisual.currentX) > 0.01 ||
          Math.abs(rVelX) + Math.abs(rVelY) > 0.001;
        prevPosMapRef.current.set(p.id, {
          x: remoteVisual.currentX,
          y: remoteVisual.currentY,
        });

        let rState = animStateMapRef.current.get(p.id) ?? makeIdleState();
        const remoteAction = remoteActionsRef.current.get(p.id);
        const rTargetAnim = determineLocalAnim(
          rMoving,
          now,
          remoteAction?.anim?.type ?? null,
          remoteAction?.anim?.until ?? 0,
          rState.animKey,
        );
        if (rTargetAnim !== rState.animKey) {
          // Keep the last movement row and mirror when switching to idle.
          rState = {
            ...makeIdleState(),
            animKey: rTargetAnim,
            row: rState.row,
            flip: rState.flip,
          };
        }
        if (rMoving) {
          const dir = getDirFromVel(rVelX, rVelY);
          rState = { ...rState, row: dir.row, flip: dir.flip };
        }
        rState = advanceAnim(rState, now);
        animStateMapRef.current.set(p.id, rState);

        const pBubble = getBubble(p.username);
        if (pBubble) {
          pendingBubbles.push({
            ...pBubble, username: p.username,
            sx: rx - camRef.current.x,
            sy: ry + TILE_H / 2 - camRef.current.y + TILE_H * 2,
          });
        }
        const rStateSnap = rState;
        const rColors: AvatarColors | undefined = p.avatar ? {
          hair:  p.avatar.hairColor,
          skin:  p.avatar.skinColor,
          shirt: p.avatar.skinColor,
          pants: p.avatar.skinColor,
        } : undefined;
        entities.push({
          depth,
          draw: () => {
            const rFeetY = ry + TILE_H / 2;
            drawSpriteCharacter(ctx, rx, rFeetY, rStateSnap, p.username, rColors);
            if (p.avatar?.hairStyle && p.avatar.hairStyle !== 'none') {
              const SIT_HAIR_Y_ADJUST = 12;
              const isSitting = rStateSnap.animKey === 'sit' || rStateSnap.animKey === 'sit_loop';
              const hairFeetY = rFeetY + (isSitting ? SIT_HAIR_Y_ADJUST : 0);

              drawHairLayer(
                ctx,
                rx,
                hairFeetY,
                rStateSnap.row,
                rStateSnap.flip,
                p.avatar.hairStyle,
                p.avatar.hairColor,
                rStateSnap.animKey,
                rStateSnap.frame,
              );
            }
          },
        });
      }
      for (const playerId of remoteVisualMapRef.current.keys()) {
        if (!activeRemoteIds.has(playerId)) {
          remoteVisualMapRef.current.delete(playerId);
          prevPosMapRef.current.delete(playerId);
          animStateMapRef.current.delete(playerId);
        }
      }

      entities.sort((a, b) => a.depth - b.depth);
      for (const e of entities) e.draw();

      ctx.restore(); // ← end camera transform

      // ── Bubble pass (raw screen coords, always on top) ───────────────────────
      for (const bd of pendingBubbles) {
        drawBubble(
          ctx, bd.sx, bd.sy,
          bd.text, bd.username,
          bd.alpha, bd.scale, bd.color,
          canvas.width, canvas.height,
        );
      }

      // ── Emote pass — floating emoji above local player ────────────────────────
      const emote = localAction?.emote;
      if (emote && now < emote.until) {
        const EMOTE_DUR = 3000;
        const elapsed   = EMOTE_DUR - (emote.until - now);
        const progress  = elapsed / EMOTE_DUR;
        const alpha     = progress > 0.75 ? Math.max(0, 1 - (progress - 0.75) / 0.25) : 1;
        const floatUp   = 40 * progress;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '30px serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emote.emoji, localScreenSx, localScreenSy - 95 - floatUp);
        ctx.restore();
      } else if (emote && now >= emote.until && localActionRef?.current?.emote === emote) {
        // Clear expired emote
        if (localActionRef.current) localActionRef.current.emote = null;
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [localPlayerId]); // intentionally stable — reads props via refs

  return (
    <div
      className="w-full h-full relative"
      style={{ touchAction: 'none' }}  // prevents browser scroll-swipe on mobile
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-pointer"
        data-testid="isometric-canvas"
      />
    </div>
  );
}
