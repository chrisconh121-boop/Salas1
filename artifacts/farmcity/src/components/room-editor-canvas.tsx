import { useEffect, useMemo, useRef, useState } from 'react';

export interface RoomTile {
  x: number;
  y: number;
}

interface RoomEditorCanvasProps {
  tiles: RoomTile[];
  floorTextureId: string;
  wallTextureId: string;
  onToggleTile: (tile: RoomTile) => void;
}

interface Camera {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

const WORLD_WIDTH = 64;
const WORLD_HEIGHT = 32;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

function keyFor(tile: RoomTile): string {
  return `${tile.x},${tile.y}`;
}

function isInside(tile: RoomTile): boolean {
  return tile.x >= 0 && tile.x < WORLD_WIDTH && tile.y >= 0 && tile.y < WORLD_HEIGHT;
}

function pointsForTile(
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  camera: Camera,
) {
  const centerX = canvasWidth / 2 + camera.offsetX;
  const centerY = canvasHeight / 2 + camera.offsetY;
  const screenX = centerX + (x - y) * width / 2;
  const screenY = centerY + (x + y) * height / 2;
  return {
    top: [screenX, screenY - height / 2] as [number, number],
    right: [screenX + width / 2, screenY] as [number, number],
    bottom: [screenX, screenY + height / 2] as [number, number],
    left: [screenX - width / 2, screenY] as [number, number],
  };
}

function drawPolygon(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  fill: string,
  stroke?: string,
) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function textureColors(textureId: string) {
  if (textureId.includes('tile')) {
    return { base: '#718d91', light: '#89a8a7', dark: '#547176', mark: 'rgba(227,224,183,.22)' };
  }
  if (textureId.includes('clay')) {
    return { base: '#a56b56', light: '#bc8061', dark: '#7d4e46', mark: 'rgba(255,213,163,.20)' };
  }
  return { base: '#ad7e4b', light: '#c59459', dark: '#80572f', mark: 'rgba(244,211,137,.19)' };
}

export function RoomEditorCanvas({
  tiles,
  floorTextureId,
  wallTextureId,
  onToggleTile,
}: RoomEditorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ zoom: 1, offsetX: -256, offsetY: -384 });
  const [hoveredTile, setHoveredTile] = useState<RoomTile | null>(null);
  const pointerRef = useRef({ active: false, moved: false, x: 0, y: 0 });
  const tileSet = useMemo(() => new Set(tiles.map(keyFor)), [tiles]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0 || size.height === 0) return;
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * pixelRatio);
    canvas.height = Math.floor(size.height * pixelRatio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    context.lineJoin = 'round';
    context.lineWidth = 1;

    const width = TILE_WIDTH * camera.zoom;
    const height = TILE_HEIGHT * camera.zoom;
    const floor = textureColors(floorTextureId);
    const wall = textureColors(wallTextureId);
    context.fillStyle = '#1e2930';
    context.fillRect(0, 0, size.width, size.height);

    // Draw the complete 64 x 32 working plane, clipping naturally to the viewport.
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < WORLD_WIDTH; x += 1) {
        const points = pointsForTile(x, y, width, height, size.width, size.height, camera);
        const allPoints = [points.top, points.right, points.bottom, points.left];
        context.strokeStyle = 'rgba(206, 183, 128, .14)';
        context.beginPath();
        context.moveTo(allPoints[0][0], allPoints[0][1]);
        for (const point of allPoints.slice(1)) context.lineTo(point[0], point[1]);
        context.closePath();
        context.stroke();
      }
    }

    for (const tile of tiles) {
      const points = pointsForTile(tile.x, tile.y, width, height, size.width, size.height, camera);
      drawPolygon(context, [points.top, points.right, points.bottom, points.left], floor.base, '#d7a75d');

      context.save();
      context.globalAlpha = .7;
      context.strokeStyle = floor.mark;
      context.lineWidth = Math.max(1, camera.zoom);
      context.beginPath();
      context.moveTo(points.left[0] + width * .16, points.left[1]);
      context.lineTo(points.top[0], points.top[1] + height * .18);
      context.lineTo(points.right[0] - width * .16, points.right[1]);
      context.stroke();
      context.restore();

      const neighbors: Array<{
        present: boolean;
        side: 'north' | 'east' | 'south' | 'west';
      }> = [
        { present: tileSet.has(`${tile.x},${tile.y - 1}`), side: 'north' },
        { present: tileSet.has(`${tile.x + 1},${tile.y}`), side: 'east' },
        { present: tileSet.has(`${tile.x},${tile.y + 1}`), side: 'south' },
        { present: tileSet.has(`${tile.x - 1},${tile.y}`), side: 'west' },
      ];
      for (const neighbor of neighbors) {
        if (neighbor.present) continue;
        const depth = Math.max(5, 7 * camera.zoom);
        const edge = neighbor.side === 'north'
          ? [points.top, points.right]
          : neighbor.side === 'east'
            ? [points.right, points.bottom]
            : neighbor.side === 'south'
              ? [points.bottom, points.left]
              : [points.left, points.top];
        const lowerEdge: Array<[number, number]> = [
          [edge[0][0], edge[0][1] + depth],
          [edge[1][0], edge[1][1] + depth],
        ];
        drawPolygon(context, [edge[0], edge[1], lowerEdge[1], lowerEdge[0]], wall.dark, wall.light);
        context.strokeStyle = 'rgba(255, 222, 147, .34)';
        context.beginPath();
        context.moveTo(edge[0][0], edge[0][1]);
        context.lineTo(edge[1][0], edge[1][1]);
        context.stroke();
      }
    }

    if (hoveredTile && isInside(hoveredTile)) {
      const points = pointsForTile(
        hoveredTile.x,
        hoveredTile.y,
        width,
        height,
        size.width,
        size.height,
        camera,
      );
      drawPolygon(
        context,
        [points.top, points.right, points.bottom, points.left],
        tileSet.has(keyFor(hoveredTile)) ? 'rgba(255, 229, 151, .20)' : 'rgba(207, 230, 194, .16)',
        '#f3c978',
      );
    }
  }, [camera, floorTextureId, hoveredTile, size, tileSet, tiles, wallTextureId]);

  function getTileFromPointer(event: React.PointerEvent<HTMLCanvasElement>): RoomTile | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    const width = TILE_WIDTH * camera.zoom;
    const height = TILE_HEIGHT * camera.zoom;
    const screenX = event.clientX - bounds.left;
    const screenY = event.clientY - bounds.top;
    const a = (screenX - size.width / 2 - camera.offsetX) / (width / 2);
    const b = (screenY - size.height / 2 - camera.offsetY) / (height / 2);
    const tile = { x: Math.floor((a + b) / 2 + .5), y: Math.floor((b - a) / 2 + .5) };
    return isInside(tile) ? tile : null;
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    pointerRef.current = { active: true, moved: false, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (pointer.active && (Math.abs(event.clientX - pointer.x) > 4 || Math.abs(event.clientY - pointer.y) > 4)) {
      pointer.moved = true;
    }
    if (pointer.active && pointer.moved) {
      const deltaX = event.clientX - pointer.x;
      const deltaY = event.clientY - pointer.y;
      setCamera((current) => ({
        ...current,
        offsetX: current.offsetX + deltaX,
        offsetY: current.offsetY + deltaY,
      }));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
    setHoveredTile(getTileFromPointer(event));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (pointer.active && !pointer.moved) {
      const tile = getTileFromPointer(event);
      if (tile) onToggleTile(tile);
    }
    pointerRef.current.active = false;
    pointerRef.current.moved = false;
  }

  function zoomBy(amount: number) {
    setCamera((current) => ({ ...current, zoom: Math.min(1.8, Math.max(.55, current.zoom + amount)) }));
  }

  function resetCamera() {
    setCamera({ zoom: 1, offsetX: -256, offsetY: -384 });
  }

  return (
    <div ref={stageRef} className="room-editor-stage">
      <canvas
        ref={canvasRef}
        className="pixelated"
        aria-label="Editor isométrico de tiles de tu casa"
        data-testid="canvas-room-editor"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerRef.current.active = false; }}
        onPointerLeave={() => setHoveredTile(null)}
        onWheel={(event) => {
          event.preventDefault();
          zoomBy(event.deltaY > 0 ? -.1 : .1);
        }}
      />
      <div className="room-editor-stage-tools" aria-label="Controles del lienzo">
        <button type="button" onClick={() => zoomBy(.15)} aria-label="Acercar" data-testid="button-zoom-in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(-.15)} aria-label="Alejar" data-testid="button-zoom-out">
          −
        </button>
        <button type="button" onClick={resetCamera} aria-label="Centrar lienzo" data-testid="button-center-canvas">
          ·
        </button>
      </div>
    </div>
  );
}