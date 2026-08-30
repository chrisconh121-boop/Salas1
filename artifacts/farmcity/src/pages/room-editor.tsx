import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Globe2,
  Home,
  LockKeyhole,
  MousePointer2,
  Plus,
  Save,
  ShieldCheck,
} from 'lucide-react';

import { useAuth } from '@/contexts/auth-context';
import { RoomEditorCanvas, type RoomTile } from '@/components/room-editor-canvas';
import type { RoomWall } from '@/components/isometric-canvas';
import {
  getGetMyRoomQueryKey,
  getGetPublicRoomsQueryKey,
  useGetMyRoom,
} from '@workspace/api-client-react';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';
type FeedbackKind = 'info' | 'success' | 'error';

interface Feedback {
  kind: FeedbackKind;
  title: string;
  message: string;
}

const FLOOR_TEXTURES = [
  { id: 'floor-wood', name: 'Madera clara', tone: 'wood' },
  { id: 'floor-tile', name: 'Baldosa azul', tone: 'tile' },
  { id: 'floor-clay', name: 'Barro coral', tone: 'clay' },
];

const WALL_TEXTURES = [
  { id: 'wall-plaster', name: 'Enlucido', tone: 'wood' },
  { id: 'wall-wood', name: 'Tablones', tone: 'clay' },
  { id: 'wall-stone', name: 'Piedra', tone: 'tile' },
];

const INITIAL_TILES: RoomTile[] = Array.from({ length: 6 }, (_, y) =>
  Array.from({ length: 8 }, (_, x) => ({ x: x + 28, y: y + 13 })),
).flat();

// Walls are deliberately explicit data. Editing the floor never adds,
// removes, or moves one of these entries.
const INITIAL_WALLS: RoomWall[] = [
  { x: 28, y: 13, side: 'north' }, { x: 29, y: 13, side: 'north' },
  { x: 30, y: 13, side: 'north' }, { x: 31, y: 13, side: 'north' },
  { x: 32, y: 13, side: 'north' }, { x: 33, y: 13, side: 'north' },
  { x: 34, y: 13, side: 'north' }, { x: 35, y: 13, side: 'north' },
  { x: 28, y: 18, side: 'south' }, { x: 29, y: 18, side: 'south' },
  { x: 30, y: 18, side: 'south' }, { x: 31, y: 18, side: 'south' },
  { x: 32, y: 18, side: 'south' }, { x: 33, y: 18, side: 'south' },
  { x: 34, y: 18, side: 'south' }, { x: 35, y: 18, side: 'south' },
  { x: 28, y: 13, side: 'west' }, { x: 28, y: 14, side: 'west' },
  { x: 28, y: 15, side: 'west' }, { x: 28, y: 16, side: 'west' },
  { x: 28, y: 17, side: 'west' }, { x: 28, y: 18, side: 'west' },
  { x: 35, y: 13, side: 'east' }, { x: 35, y: 14, side: 'east' },
  { x: 35, y: 15, side: 'east' }, { x: 35, y: 16, side: 'east' },
  { x: 35, y: 17, side: 'east' }, { x: 35, y: 18, side: 'east' },
];

function tileKey(tile: RoomTile): string {
  return `${tile.x},${tile.y}`;
}

function countPerimeter(tiles: RoomTile[]): number {
  const set = new Set(tiles.map(tileKey));
  return tiles.reduce((total, tile) => total + [
    [tile.x, tile.y - 1],
    [tile.x + 1, tile.y],
    [tile.x, tile.y + 1],
    [tile.x - 1, tile.y],
  ].filter(([x, y]) => !set.has(`${x},${y}`)).length, 0);
}

export default function RoomEditor() {
  const { token } = useAuth();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isNewRoom = new URLSearchParams(location.split('?')[1] ?? '').get('new') === '1';
  const socketRef = useRef<WebSocket | null>(null);
  const passwordRef = useRef('');
  const [tiles, setTiles] = useState<RoomTile[]>(INITIAL_TILES);
  const [walls, setWalls] = useState<RoomWall[]>(INITIAL_WALLS);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [roomName, setRoomName] = useState('Mi rincón');
  const [floorTextureId, setFloorTextureId] = useState(FLOOR_TEXTURES[0].id);
  const [wallTextureId, setWallTextureId] = useState(WALL_TEXTURES[0].id);
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState('');
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [feedback, setFeedback] = useState<Feedback>({
    kind: 'info',
    title: 'Preparando tu mesa de trabajo',
    message: 'Conectando con FarmCity…',
  });
  const [isSaving, setIsSaving] = useState(false);
  const { data: savedRoom } = useGetMyRoom({
    query: {
      enabled: !!token,
      queryKey: getGetMyRoomQueryKey(),
      retry: false,
    },
  });

  const perimeter = useMemo(() => countPerimeter(tiles), [tiles]);

  useEffect(() => {
    passwordRef.current = password;
  }, [password]);

  useEffect(() => {
    if (isNewRoom || !savedRoom) return;
    setRoomId(savedRoom.id);
    setHasSavedPassword(savedRoom.hasPassword);
    setRoomName(savedRoom.name);
    setTiles(savedRoom.tiles);
    setWalls(savedRoom.walls);
    setFloorTextureId(savedRoom.floorTextureId);
    setWallTextureId(savedRoom.wallTextureId);
    setIsPublic(savedRoom.isPublic);
    setPassword('');
    setFeedback({
      kind: 'success',
      title: 'Casa recuperada',
      message: 'Tus cambios anteriores están listos para seguir editándolos.',
    });
  }, [isNewRoom, savedRoom?.id]);

  useEffect(() => {
    if (!isNewRoom) return;
    setRoomId(null);
    setHasSavedPassword(false);
    setRoomName('Mi rincón');
    setTiles(INITIAL_TILES);
    setWalls(INITIAL_WALLS);
    setFloorTextureId(FLOOR_TEXTURES[0].id);
    setWallTextureId(WALL_TEXTURES[0].id);
    setIsPublic(true);
    setPassword('');
    setFeedback({
      kind: 'info',
      title: 'Nueva sala',
      message: 'Diseña una sala independiente. Al guardarla recibirá su propio ID.',
    });
  }, [isNewRoom]);

  useEffect(() => {
    if (!token) {
      setLocation('/');
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnection('connected');
      setFeedback({
        kind: 'info',
        title: 'Todo listo',
        message: 'Toca un tile para añadirlo o quitarlo del plano.',
      });
    };

    ws.onclose = () => {
      setConnection('disconnected');
      setFeedback({
        kind: 'error',
        title: 'Conexión interrumpida',
        message: 'No se ha guardado nada. Vuelve a intentarlo cuando regreses a estar en línea.',
      });
    };

    ws.onerror = () => {
      setConnection('disconnected');
      setFeedback({
        kind: 'error',
        title: 'No se pudo conectar',
        message: 'Comprueba tu conexión y vuelve a intentarlo.',
      });
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as {
          type?: string;
          data?: { roomId?: string; code?: string; message?: string };
        };

        if (
          (message.type === 'room:created' || message.type === 'room:updated') &&
          message.data?.roomId
        ) {
          // The join follows the create acknowledgement immediately, as required by the room protocol.
          setRoomId(message.data.roomId);
          setIsSaving(false);
          void queryClient.invalidateQueries({ queryKey: getGetMyRoomQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetPublicRoomsQueryKey() });

          if (message.type === 'room:created' && isNewRoom) {
            setFeedback({
              kind: 'success',
              title: 'Sala creada',
              message: `Se guardó correctamente. ID: ${message.data.roomId}`,
            });
            setLocation('/rooms');
            return;
          }

          ws.send(JSON.stringify({
            type: 'room:join',
            data: { roomId: message.data.roomId, ...(passwordRef.current ? { password: passwordRef.current } : {}) },
          }));
          setFeedback({
            kind: 'success',
            title: message.type === 'room:updated' ? 'Sala actualizada' : 'Sala creada',
            message: `Tu casa ya existe. Entrando en ella… (${message.data.roomId})`,
          });
          return;
        }

        if (message.type === 'room:joined' || message.type === 'room:snapshot') {
          const snapshot = message.data as {
            id?: string;
            name?: string;
            tiles?: RoomTile[];
            walls?: RoomWall[];
            floorTextureId?: string;
            wallTextureId?: string;
          };
          if (snapshot.tiles?.length) {
            window.localStorage.setItem('farmcity_current_room', JSON.stringify({
              id: snapshot.id,
              name: snapshot.name,
              tiles: snapshot.tiles,
               walls: snapshot.walls,
              floorTextureId: snapshot.floorTextureId,
              wallTextureId: snapshot.wallTextureId,
            }));
            if (snapshot.id) setRoomId(snapshot.id);
          }
          setFeedback({
            kind: 'success',
            title: 'Ya estás dentro',
            message: 'Tu espacio está listo para recibir visitas.',
          });
          // The editor is only the setup step. Once the server confirms the
          // room, open the playable isometric view instead of leaving the
          // player on the tile-drawing canvas.
          setLocation('/plaza');
          return;
        }

        if (message.type === 'room:error') {
          setIsSaving(false);
          const code = message.data?.code ? ` · ${message.data.code}` : '';
          const messageText = message.data?.code === 'ROOM_LIMIT_REACHED'
            ? 'Ya tienes 10 salas. Edita una existente o elimina una antes de crear otra.'
            : (message.data?.message ?? 'El servidor rechazó la sala.');
          setFeedback({
            kind: 'error',
            title: 'No se pudo guardar',
            message: `${messageText}${code}`,
          });
        }
      } catch {
        setFeedback({
          kind: 'error',
          title: 'Respuesta no reconocida',
          message: 'FarmCity envió una respuesta que no pudimos leer.',
        });
      }
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [queryClient, setLocation, token]);

  function toggleTile(tile: RoomTile) {
    setTiles((current) => {
      const exists = current.some((candidate) => candidate.x === tile.x && candidate.y === tile.y);
      return exists
        ? current.filter((candidate) => candidate.x !== tile.x || candidate.y !== tile.y)
        : [...current, tile];
    });
    setFeedback({
      kind: 'info',
      title: 'Plano actualizado',
      message: 'La forma y sus paredes se recalculan al instante.',
    });
  }

  function handleSave() {
    // The URL is the source of truth for intent. This prevents a stale
    // roomId from turning a "Nueva sala" save into an update.
    const targetRoomId = isNewRoom ? null : roomId;
    const name = roomName.trim();
    if (!name) {
      setFeedback({ kind: 'error', title: 'Falta un nombre', message: 'Ponle un nombre a tu casa antes de guardarla.' });
      return;
    }
    if (tiles.length === 0) {
      setFeedback({ kind: 'error', title: 'El plano está vacío', message: 'Añade al menos un tile para crear una sala.' });
      return;
    }
    if (!isPublic && !password.trim() && !(targetRoomId && hasSavedPassword)) {
      setFeedback({ kind: 'error', title: 'Falta una contraseña', message: 'Las salas privadas necesitan una contraseña.' });
      return;
    }
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setFeedback({ kind: 'error', title: 'Sin conexión', message: 'Espera a que FarmCity vuelva a estar en línea.' });
      return;
    }

    const data = {
      ...(targetRoomId ? { roomId: targetRoomId } : {}),
      name,
      tiles,
      walls,
      floorTextureId,
      wallTextureId,
      isPublic,
      ...(!isPublic ? { password: password.trim() } : {}),
    };
    setIsSaving(true);
    setFeedback({
      kind: 'info',
      title: targetRoomId ? 'Actualizando tu casa' : 'Creando una sala nueva',
      message: 'Enviando el plano a FarmCity…',
    });
    socketRef.current.send(JSON.stringify({ type: targetRoomId ? 'room:update' : 'room:create', data }));
  }

  function startNewRoom() {
    setRoomId(null);
    setHasSavedPassword(false);
    setPassword('');
    setLocation('/room-editor?new=1');
  }

  return (
    <main className="room-editor-page">
      <div className="room-editor-shell">
        <header className="room-editor-topbar">
          <div className="room-editor-brand">
            <div className="room-editor-brand-mark" aria-hidden="true">
              <Home size={23} strokeWidth={1.8} />
            </div>
            <div className="room-editor-brand-copy">
              <small>FarmCity / Plaza</small>
              <strong>{isNewRoom ? 'Nueva sala' : 'Mi Casa'}</strong>
            </div>
          </div>
          <div className="room-editor-topbar-actions">
            <button
              type="button"
              className="room-editor-new-room"
              onClick={startNewRoom}
              data-testid="button-new-room"
            >
              <Plus size={15} /> Nueva sala
            </button>
            <div
              className={`room-editor-connection ${connection === 'connected' ? 'is-connected' : ''} ${connection === 'disconnected' ? 'is-error' : ''}`}
              data-testid="status-room-connection"
            >
              {connection === 'connected' ? 'Conectado' : connection === 'connecting' ? 'Conectando…' : 'Sin conexión'}
            </div>
          </div>
        </header>

        <div className="room-editor-layout">
          <section className="room-editor-card room-editor-canvas-card" aria-labelledby="room-editor-title">
            <div className="room-editor-card-heading">
              <div>
                <span className="room-editor-kicker">Construcción paso a paso</span>
                <h1 id="room-editor-title">Dibuja tu pequeño mundo</h1>
                <p className="room-editor-subtitle">Cada toque cambia el suelo. Las paredes aparecen alrededor de tu forma.</p>
              </div>
              <span className="room-editor-size-badge" data-testid="text-room-grid-size">64 × 32</span>
            </div>
            <RoomEditorCanvas
              tiles={tiles}
              floorTextureId={floorTextureId}
              wallTextureId={wallTextureId}
              onToggleTile={toggleTile}
            />
            <div className="room-editor-help">
              <span className="room-editor-legend"><i aria-hidden="true" /> Pared perimetral</span>
              <span><MousePointer2 size={12} style={{ verticalAlign: 'text-bottom' }} /> Toca o haz clic para editar</span>
            </div>
            <div className="room-editor-stats">
              <span data-testid="text-room-tile-count">SUELO<strong>{tiles.length} tiles</strong></span>
              <span data-testid="text-room-wall-count">PERÍMETRO<strong>{perimeter} paredes</strong></span>
              <span data-testid="text-room-status">VISTA<strong>En tiempo real</strong></span>
            </div>
          </section>

          <aside className="room-editor-card" aria-label="Detalles de la sala">
            <div className="room-editor-card-heading">
              <div>
                <span className="room-editor-kicker">Ficha de la sala</span>
                <h2>Hazla tuya</h2>
              </div>
              <ShieldCheck size={22} color="#718a52" aria-hidden="true" />
            </div>
            <div className="room-editor-form">
              <div className="room-editor-field">
                <label htmlFor="room-name">Nombre de la casa</label>
                <input
                  id="room-name"
                  type="text"
                  maxLength={50}
                  value={roomName}
                  placeholder="Ej. La casa del huerto"
                  onChange={(event) => setRoomName(event.target.value)}
                  data-testid="input-room-name"
                />
                <span className="room-editor-field-hint">{roomName.length}/50 caracteres</span>
              </div>

              <div className="room-editor-field">
                <span className="room-editor-section-label">Suelo</span>
                <div className="room-editor-texture-grid">
                  {FLOOR_TEXTURES.map((texture) => (
                    <button
                      key={texture.id}
                      type="button"
                      className={`room-editor-texture ${floorTextureId === texture.id ? 'is-selected' : ''}`}
                      onClick={() => setFloorTextureId(texture.id)}
                      data-testid={`button-floor-texture-${texture.id}`}
                    >
                      <span className={`room-editor-texture-swatch ${texture.tone}`} aria-hidden="true" />
                      <span>{texture.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="room-editor-field">
                <span className="room-editor-section-label">Paredes</span>
                <div className="room-editor-texture-grid">
                  {WALL_TEXTURES.map((texture) => (
                    <button
                      key={texture.id}
                      type="button"
                      className={`room-editor-texture ${wallTextureId === texture.id ? 'is-selected' : ''}`}
                      onClick={() => setWallTextureId(texture.id)}
                      data-testid={`button-wall-texture-${texture.id}`}
                    >
                      <span className={`room-editor-texture-swatch ${texture.tone}`} aria-hidden="true" />
                      <span>{texture.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="room-editor-field">
                <span className="room-editor-section-label">Visibilidad</span>
                <div className="room-editor-visibility">
                  <button
                    type="button"
                    className={isPublic ? 'is-selected' : ''}
                    onClick={() => setIsPublic(true)}
                    data-testid="button-visibility-public"
                  >
                    <Globe2 size={14} style={{ verticalAlign: 'text-bottom' }} /> Pública
                  </button>
                  <button
                    type="button"
                    className={!isPublic ? 'is-selected' : ''}
                    onClick={() => setIsPublic(false)}
                    data-testid="button-visibility-private"
                  >
                    <LockKeyhole size={14} style={{ verticalAlign: 'text-bottom' }} /> Privada
                  </button>
                </div>
              </div>

              {!isPublic && (
                <div className="room-editor-field">
                  <label htmlFor="room-password">Contraseña de entrada</label>
                  <input
                    id="room-password"
                    type="password"
                    maxLength={100}
                    value={password}
                    placeholder="Solo para tus invitados"
                    onChange={(event) => setPassword(event.target.value)}
                    data-testid="input-room-password"
                  />
                </div>
              )}

              <div className="room-editor-divider" />

              <div className={`room-editor-feedback ${feedback.kind === 'success' ? 'is-success' : ''} ${feedback.kind === 'error' ? 'is-error' : ''}`} data-testid="status-room-feedback">
                {feedback.kind === 'success' ? <Check size={17} aria-hidden="true" /> : feedback.kind === 'error' ? <AlertTriangle size={17} aria-hidden="true" /> : <MousePointer2 size={17} aria-hidden="true" />}
                <div>
                  <strong>{feedback.title}</strong>
                  {feedback.message}
                </div>
              </div>

              <div className="room-editor-actions">
                <button type="button" className="room-editor-action room-editor-action-secondary" onClick={() => setLocation('/plaza')} data-testid="button-cancel-room">
                  <ArrowLeft size={15} style={{ verticalAlign: 'text-bottom' }} /> Cancelar
                </button>
                <button type="button" className="room-editor-action room-editor-action-primary" onClick={handleSave} disabled={isSaving} data-testid="button-save-room">
                  <Save size={15} style={{ verticalAlign: 'text-bottom' }} /> {isSaving ? 'Guardando…' : 'Guardar sala'}
                </button>
              </div>
              <p className="room-editor-footer-note">Tu sala se guarda en FarmCity y podrás volver a ella desde la Plaza.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}