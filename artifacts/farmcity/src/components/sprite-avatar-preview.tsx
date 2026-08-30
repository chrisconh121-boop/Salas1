import { useEffect, useRef } from 'react';
import { drawHairLayer, FACING_MAP } from '@/lib/hair-renderer';
import { tintLightBodyPixels } from '@/lib/solid-body-tint';

/**
 * Renders Character0_Idle (animated) with per-zone colour tinting.
 * Now supports directional `facing` (0-7) and a `hairStyle` overlay layer.
 *
 * Technique (unchanged from v1):
 *  1. Draw the sprite row onto a white-bg temp canvas.
 *  2. Multiply-tint body zones (skin, shirt, pants).
 *  3. Mask white BG with destination-in using the raw sprite alpha.
 *  4. Draw the uploaded idle hair sheet as an independent layer.
 */

const SPRITE_FW   = 460;
const SPRITE_FH   = 460;
const IDLE_FRAMES = 8;
const IDLE_FPS    = 6;

// Module-level image cache (same pattern as isometric-canvas)
let cachedIdle: HTMLImageElement | null = null;
function getIdleImg(): HTMLImageElement {
  if (!cachedIdle) {
    cachedIdle     = new Image();
    cachedIdle.src = `${import.meta.env.BASE_URL}sprites/Character0_Idle.png`;
  }
  return cachedIdle;
}

export interface SpriteAvatarPreviewProps {
  skinColor:   string;
  hairColor:   string;
  shirtColor:  string;
  pantsColor:  string;
  /** Clothing tinting is opt-in; an undressed avatar keeps one solid body tone. */
  hasClothing?: boolean;
  /** Hair style key for the layered hair system (e.g. 'long', 'bun'). */
  hairStyle?:  string;
  /**
   * Facing index 0-7 (S, SE, E, NE, N, NW, W, SW).
   * Default: 0 (front / S).
   */
  facing?:     number;
  /** Canvas / display size in px (square). Default 180. */
  size?:       number;
}

export function SpriteAvatarPreview({
  skinColor, hairColor, shirtColor, pantsColor,
  hasClothing = false,
  hairStyle, facing, size = 180,
}: SpriteAvatarPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Keep all mutable props in a ref so the rAF loop always reads the latest
  // values without needing to restart.
  const propsRef = useRef({ skinColor, hairColor, shirtColor, pantsColor, hasClothing, hairStyle: hairStyle ?? '', facing: facing ?? 0 });
  propsRef.current = { skinColor, hairColor, shirtColor, pantsColor, hasClothing, hairStyle: hairStyle ?? '', facing: facing ?? 0 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Canvas always supports '2d'; use ! to preserve TypeScript narrowing inside the closure
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;

    const img = getIdleImg();
    const s   = size;

    // Reusable temp canvas (white bg so multiply works)
    const tmp    = document.createElement('canvas');
    tmp.width    = s;
    tmp.height   = s;
    const tCtx   = tmp.getContext('2d')!;
    tCtx.imageSmoothingEnabled = false;

    let frame         = 0;
    let lastFrameTime = 0;
    let animId:       number;

    // Foot anchor in preview canvas coords (430/460 of canvas height)
    const feetX = s / 2;
    const feetY = (430 / 460) * s;

    function loop(now: number) {
      // Advance animation frame at IDLE_FPS
      if (now - lastFrameTime >= 1000 / IDLE_FPS) {
        frame         = (frame + 1) % IDLE_FRAMES;
        lastFrameTime = now;
      }

      if (!img.complete || img.naturalWidth === 0) {
        animId = requestAnimationFrame(loop);
        return;
      }

      const {
        skinColor, hairColor, shirtColor, pantsColor,
        hasClothing,
        hairStyle: hStyle, facing: f,
      } = propsRef.current;

      const { row, flip } = FACING_MAP[(f ?? 0) % 8];
      const srcX = frame * SPRITE_FW;
      const srcY = row * SPRITE_FH;

      // ── Step 1: render to temp canvas (white bg + sprite) ────────────────
      tCtx.clearRect(0, 0, s, s);
      tCtx.fillStyle = '#ffffff';
      tCtx.fillRect(0, 0, s, s);
      tCtx.drawImage(img, srcX, srcY, SPRITE_FW, SPRITE_FH, 0, 0, s, s);

      const w = s, h = s;

      if (!hasClothing) {
        // Replace the source sprite's light body pixels so the result is
        // exactly the selected armory skin swatch, without multiply drift.
        tintLightBodyPixels(tCtx, skinColor);
      } else {
        // ── Step 2: colour zones with multiply ─────────────────────────────
        tCtx.globalCompositeOperation = 'multiply';

        // Skin — face + hands
        tCtx.fillStyle = skinColor;
        tCtx.fillRect(w * 0.26, h * 0.22, w * 0.48, h * 0.30);
        tCtx.fillRect(w * 0.07, h * 0.62, w * 0.14, h * 0.08);
        tCtx.fillRect(w * 0.79, h * 0.62, w * 0.14, h * 0.08);

        // Shirt — torso + sleeves
        tCtx.fillStyle = shirtColor;
        tCtx.fillRect(w * 0.22, h * 0.51, w * 0.56, h * 0.22);
        tCtx.fillRect(w * 0.05, h * 0.51, w * 0.19, h * 0.14);
        tCtx.fillRect(w * 0.76, h * 0.51, w * 0.19, h * 0.14);

        // Pants — legs
        tCtx.fillStyle = pantsColor;
        tCtx.fillRect(w * 0.25, h * 0.72, w * 0.50, h * 0.21);
      }

      tCtx.globalCompositeOperation = 'source-over';

      // ── Step 3: copy to main canvas + mask out white bg ──────────────────
      ctx.clearRect(0, 0, s, s);

      ctx.save();
      if (flip) {
        // Mirror around the canvas centre-X
        ctx.translate(s, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(tmp, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(img, srcX, srcY, SPRITE_FW, SPRITE_FH, 0, 0, s, s);
      ctx.globalCompositeOperation = 'source-over';

      ctx.restore();

      if (hStyle && hStyle !== 'none') {
        // The game renders 460px sprite frames at CHAR_SCALE 0.20 (92px).
        // Use that same ratio here so the wardrobe and plaza share one anchor.
        const hairScale = s / 92;
        const PREVIEW_HAIR_Y_OFFSET = 2;

        ctx.save();
        ctx.translate(feetX, feetY);
        ctx.scale(hairScale, hairScale);
        ctx.translate(-feetX, -feetY);
        ctx.translate(0, -PREVIEW_HAIR_Y_OFFSET / hairScale);
        drawHairLayer(ctx, feetX, feetY, row, flip, hStyle, hairColor, 'idle', frame);
        ctx.restore();
      }

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [size]); // colours + facing + hairStyle are read from propsRef — no restart needed

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', display: 'block' }}
    />
  );
}
