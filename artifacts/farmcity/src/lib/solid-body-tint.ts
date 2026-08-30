/**
 * Replaces the sprite's light body pixels with the exact selected color.
 * The source character is white inside a dark outline, so multiply blending
 * can leave the body slightly lighter than the armory swatch.
 */
export function tintLightBodyPixels(
  ctx: CanvasRenderingContext2D,
  color: string,
): void {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return;

  const hex = match[1];
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const isVeryDarkSkin = Math.max(red, green, blue) < 100;
  const minimumBodyChannel = isVeryDarkSkin ? 40 : 140;
  const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let index = 0; index < image.data.length; index += 4) {
    const sourceRed = image.data[index];
    const sourceGreen = image.data[index + 1];
    const sourceBlue = image.data[index + 2];

    // Keep the deepest purple outline and eyes untouched. For very dark skin,
    // also absorb the mid-tone purple anti-aliasing so it cannot read as a
    // visible stripe against the dark body color.
    if (
      sourceRed >= minimumBodyChannel &&
      sourceGreen >= minimumBodyChannel &&
      sourceBlue >= minimumBodyChannel
    ) {
      image.data[index] = red;
      image.data[index + 1] = green;
      image.data[index + 2] = blue;
    }
  }

  ctx.putImageData(image, 0, 0);
}