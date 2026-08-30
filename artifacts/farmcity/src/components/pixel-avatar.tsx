import React, { useEffect, useRef } from 'react';

interface PixelAvatarProps {
  skinColor: string;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  hairStyle?: string;
  scale?: number;
  direction?: 'down' | 'up' | 'left' | 'right';
  className?: string;
}

export function PixelAvatar({
  skinColor,
  hairColor,
  shirtColor,
  pantsColor,
  hairStyle = 'short',
  scale = 4,
  direction = 'down',
  className = ''
}: PixelAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // We draw in a 16x16 grid
    const size = 16;
    canvas.width = size * scale;
    canvas.height = size * scale;
    
    // Disable anti-aliasing
    ctx.imageSmoothingEnabled = false;

    // Helper to draw a pixel
    const p = (x: number, y: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    };

    const drawRect = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, w * scale, h * scale);
    };

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Outline helper (draws a 1-pixel outline around a shape if we wanted, but we'll keep it simple)
    const shadowColor = 'rgba(0,0,0,0.2)';

    // Pants (legs)
    drawRect(6, 12, 4, 3, pantsColor);
    if (direction === 'down' || direction === 'up') {
      // Split legs
      drawRect(7, 13, 2, 2, shadowColor); // Inner leg shadow
    }

    // Shirt (body)
    drawRect(5, 7, 6, 5, shirtColor);
    
    // Arms (shirt sleeves)
    drawRect(4, 7, 1, 4, shirtColor);
    drawRect(11, 7, 1, 4, shirtColor);

    // Hands (skin)
    drawRect(4, 11, 1, 1, skinColor);
    drawRect(11, 11, 1, 1, skinColor);

    // Head
    drawRect(5, 2, 6, 5, skinColor);

    // Face features (only if looking down/front)
    if (direction === 'down') {
      // Eyes
      drawRect(6, 4, 1, 1, '#111');
      drawRect(9, 4, 1, 1, '#111');
    } else if (direction === 'left') {
      drawRect(5, 4, 1, 1, '#111');
    } else if (direction === 'right') {
      drawRect(10, 4, 1, 1, '#111');
    }

    // Hair
    if (hairStyle === 'short' || !hairStyle) {
      drawRect(4, 1, 8, 2, hairColor);
      drawRect(4, 3, 1, 2, hairColor);
      drawRect(11, 3, 1, 2, hairColor);
    } else if (hairStyle === 'long') {
      drawRect(4, 1, 8, 2, hairColor);
      drawRect(4, 3, 2, 5, hairColor);
      drawRect(10, 3, 2, 5, hairColor);
    } else if (hairStyle === 'spiky') {
      drawRect(5, 1, 6, 2, hairColor);
      p(6, 0, hairColor);
      p(8, 0, hairColor);
      p(10, 0, hairColor);
      drawRect(4, 2, 1, 2, hairColor);
      drawRect(11, 2, 1, 2, hairColor);
    }

  }, [skinColor, hairColor, shirtColor, pantsColor, hairStyle, scale, direction]);

  return (
    <canvas 
      ref={canvasRef} 
      className={`pixelated ${className}`} 
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
