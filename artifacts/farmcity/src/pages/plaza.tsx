import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Home as HomeIcon } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { IsometricCanvas } from '@/components/isometric-canvas';
import type { LocalAction, RoomWall } from '@/components/isometric-canvas';
import { OwnAvatarPanel } from '@/components/panels/own-avatar-panel';
import { OtherPlayerPanel } from '@/components/panels/other-player-panel';
import { WorldObjectPanel } from '@/components/panels/world-object-panel';
import type { WorldObjectType } from '@/components/panels/world-object-panel';
import {
  getGetMyRoomQueryKey,
  getGetPlazaStatusQueryKey,
  useGetMyRoom,
  useGetPlazaStatus,
} from '@workspace/api-client-react';
import type { Avatar, PlayerSummary } from '@workspace/api-client-react';

interface WsPlayer {
  id: number;
  username: string;
  posX: number;
  posY: number;
  avatar?: Avatar;
}

interface ChatEntry {
  id?: number;
  username: string;
  message: string;
  createdAt: string;
}

type ConnectionState = 'connecting' | 'connected' | 'reconnecting';

interface RoomSnapshot {
  tiles?: Array<{ x: number; y: number }>;
  walls?: RoomWall[];
}

type PanelState =
  | { kind: 'self' }
  | { kind: 'player'; player: WsPlayer }
  | { kind: 'object'; objectType: WorldObjectType };

export default function Plaza() {
  const { token, player: authPlayer, logout } = useAuth();
  const [, setLocation] = useLocation();
  const roomIdFromUrl = new URLSearchParams(window.location.search).get('room');

  const [remotePlayers, setRemotePlayers] = useState<Record<number, WsPlayer>>({});
  // Position packets update this ref without forcing a React render. The
  // canvas consumes it on its own animation frame.
  const remotePlayersRef = useRef<Record<number, PlayerSummary>>({});
  // Transient actions are also renderer-owned state. Their expiry is relative
  // to each receiving client's clock, so the server only relays duration.
  const remoteActionsRef = useRef<Map<number, LocalAction>>(new Map());
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [chatOpen, setChatOpen] = useState(false);
  const [roomTiles, setRoomTiles] = useState<Array<{ x: number; y: number }> | undefined>(() => {
    if (roomIdFromUrl) return undefined;
    try {
      const saved = JSON.parse(window.localStorage.getItem('farmcity_current_room') ?? 'null') as RoomSnapshot | null;
      if (!saved?.tiles?.length) return undefined;
      const minX = Math.min(...saved.tiles.map((tile) => tile.x));
      const minY = Math.min(...saved.tiles.map((tile) => tile.y));
      return saved.tiles.map((tile) => ({ x: tile.x - minX, y: tile.y - minY }));
    } catch {
      return undefined;
    }
  });
  const [roomWalls, setRoomWalls] = useState<RoomWall[]>(() => {
    if (roomIdFromUrl) return [];
    try {
      const saved = JSON.parse(window.localStorage.getItem('farmcity_current_room') ?? 'null') as RoomSnapshot | null;
      if (!saved?.tiles?.length || !Array.isArray(saved.walls)) return [];
      const minX = Math.min(...saved.tiles.map((tile) => tile.x));
      const minY = Math.min(...saved.tiles.map((tile) => tile.y));
      return saved.walls.map((wall) => ({ ...wall, x: wall.x - minX, y: wall.y - minY }));
    } catch {
      return [];
    }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  // Stable ref so handleSendChat doesn't need authPlayer as a dep
  const authPlayerRef = useRef(authPlayer);
  useEffect(() => { authPlayerRef.current = authPlayer; }, [authPlayer]);

  // Canvas action refs — mutated in place so the render loop reads them without re-renders
  const localActionRef = useRef<LocalAction>({ emote: null, anim: null });
  const canvasElemRef  = useRef<HTMLCanvasElement | null>(null);

  const { data: plazaStatus } = useGetPlazaStatus({
    query: { queryKey: getGetPlazaStatusQueryKey(), refetchInterval: 15000 },
  });
  const { data: savedRoom } = useGetMyRoom({
    query: {
      enabled: !!token,
      queryKey: getGetMyRoomQueryKey(),
      retry: false,
    },
  });

  useEffect(() => {
    // An explicit room URL is always authoritative. Its snapshot arrives
    // through WebSocket, so the latest personal-room query must not overwrite
    // it with stale data while React Query is revalidating.
    if (roomIdFromUrl || !savedRoom?.tiles?.length) return;
    const minX = Math.min(...savedRoom.tiles.map((tile) => tile.x));
    const minY = Math.min(...savedRoom.tiles.map((tile) => tile.y));
    setRoomTiles(savedRoom.tiles.map((tile) => ({ x: tile.x - minX, y: tile.y - minY })));
    setRoomWalls(
      savedRoom.walls.map((wall) => ({
        ...wall,
        x: wall.x - minX,
        y: wall.y - minY,
      })),
    );
    try {
      window.localStorage.setItem('farmcity_current_room', JSON.stringify(savedRoom));
    } catch {
      // The server remains the source of truth when storage is unavailable.
    }
  }, [roomIdFromUrl, savedRoom]);

  // Redirect if not logged in
  useEffect(() => {
    if (!token) setLocation('/');
  }, [token, setLocation]);

  // WebSocket connection
  useEffect(() => {
    if (!token) {
      setConnectionState('connecting');
      remotePlayersRef.current = {};
      remoteActionsRef.current.clear();
      return;
    }

    let disposed = false;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    let activeSocket: WebSocket | null = null;

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return;
      const delay = Math.min(1000 * 2 ** reconnectAttempt, 10000);
      reconnectAttempt += 1;
      setConnectionState('reconnecting');
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);
      activeSocket = ws;
      wsRef.current = ws;
      setConnectionState(reconnectAttempt === 0 ? 'connecting' : 'reconnecting');

      ws.onopen = () => {
        if (disposed || wsRef.current !== ws) return;
        reconnectAttempt = 0;
        setConnectionState('connected');
        // The server sends the latest persisted history after opening. Clear
        // the local list first so reconnects cannot duplicate old messages.
        setChatMessages([]);
        if (roomIdFromUrl) {
          ws.send(JSON.stringify({
            type: 'room:join',
            data: { roomId: roomIdFromUrl },
          }));
        }
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        setConnectionState('reconnecting');
        remotePlayersRef.current = {};
        remoteActionsRef.current.clear();
        setRemotePlayers({});
        setChatMessages([]);
        scheduleReconnect();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as Record<string, unknown>;
          const type = msg.type as string;

          switch (type) {
            case 'players_update': {
              const players = Array.isArray(msg.players) ? msg.players as WsPlayer[] : [];
              const next: Record<number, WsPlayer> = {};
              for (const p of players) next[p.id] = p;
              remotePlayersRef.current = next;
              setRemotePlayers(next);
              break;
            }
            case 'room:snapshot': {
              const snapshot = msg.data as RoomSnapshot | undefined;
              if (snapshot?.tiles?.length) {
                const minX = Math.min(...snapshot.tiles.map((tile) => tile.x));
                const minY = Math.min(...snapshot.tiles.map((tile) => tile.y));
                setRoomTiles(snapshot.tiles.map((tile) => ({
                  x: tile.x - minX,
                  y: tile.y - minY,
                })));
                setRoomWalls(
                  Array.isArray(snapshot.walls)
                    ? snapshot.walls.map((wall) => ({
                        ...wall,
                        x: wall.x - minX,
                        y: wall.y - minY,
                      }))
                    : [],
                );
              }
              break;
            }
            case 'player_joined': {
              const p = msg.player as WsPlayer;
              if (p?.id) {
                remotePlayersRef.current = { ...remotePlayersRef.current, [p.id]: p };
                setRemotePlayers((prev) => ({ ...prev, [p.id]: p }));
              }
              break;
            }
            case 'player_moved': {
              const { playerId, posX, posY } = msg as {
                type: string;
                playerId: number;
                posX: number;
                posY: number;
              };
              const currentPlayer = remotePlayersRef.current[playerId];
              if (currentPlayer) {
                remotePlayersRef.current = {
                  ...remotePlayersRef.current,
                  [playerId]: { ...currentPlayer, posX, posY },
                };
              }
              // Also update panel if this player is being viewed
              setPanel((p) =>
                p?.kind === 'player' && p.player.id === playerId
                  ? { ...p, player: { ...p.player, posX, posY } }
                  : p,
              );
              break;
            }
            case 'player_action': {
              const { playerId, action, payload, duration } = msg as {
                type: string;
                playerId: number;
                action: string;
                payload?: string;
                duration?: number;
              };
              if (!Number.isInteger(playerId) || typeof action !== 'string') break;

              const now = performance.now();
              const actionDuration = typeof duration === 'number'
                ? Math.max(0, Math.min(60000, duration))
                : 0;
              const current = remoteActionsRef.current.get(playerId) ?? {
                anim: null,
                emote: null,
              };

              if (action === 'standup') {
                current.anim = null;
              } else if (
                action === 'dance' ||
                action === 'sit' ||
                action === 'dig' ||
                action === 'fish' ||
                action === 'axe' ||
                action === 'interact'
              ) {
                current.anim = { type: action, until: now + actionDuration };
              } else if (action === 'emote' && payload) {
                current.emote = { emoji: payload, until: now + actionDuration };
              }
              remoteActionsRef.current.set(playerId, current);
              break;
            }
            case 'chat_message': {
              const { id, username, message, createdAt } = msg as {
                id?: number;
                type: string;
                username: string;
                message: string;
                createdAt: string;
              };
              setChatMessages((prev) => {
                if (typeof id === 'number' && prev.some((entry) => entry.id === id)) return prev;
                return [...prev.slice(-49), { id, username, message, createdAt }];
              });
              break;
            }
            case 'player_left': {
              const { playerId } = msg as { type: string; playerId: number };
              setRemotePlayers((prev) => {
                const next = { ...prev };
                delete next[playerId];
                return next;
              });
              const nextRemotePlayers = { ...remotePlayersRef.current };
              delete nextRemotePlayers[playerId];
              remotePlayersRef.current = nextRemotePlayers;
              remoteActionsRef.current.delete(playerId);
              setPanel((p) => (p?.kind === 'player' && p.player.id === playerId ? null : p));
              break;
            }
            case 'room:error': {
              const roomError = msg.data as { message?: string } | undefined;
              if (roomIdFromUrl) {
                setConnectionState('reconnecting');
                setPanel(null);
                setChatMessages([]);
              }
              if (roomError?.message) {
                console.warn(roomError.message);
              }
              break;
            }
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onerror = () => {
        if (wsRef.current === ws) setConnectionState('reconnecting');
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      if (wsRef.current === activeSocket) wsRef.current = null;
      activeSocket?.close(1000, 'Cambio de plaza');
      setConnectionState('connecting');
    };
  }, [token]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleMove = useCallback((posX: number, posY: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'move', posX, posY }));
    }
  }, []);

  const sendAction = useCallback((action: string, payload?: string, duration = 0) => {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action, payload, duration }));
    }
  }, []);

  const handlePlayerAction = useCallback((action: string, payload?: string) => {
    const now = performance.now();
    switch (action) {
      case 'change-costume':
        setLocation('/avatar');
        break;
      case 'dance':
        localActionRef.current = { ...localActionRef.current, anim: { type: 'dance', until: now + 8000 } };
        sendAction('dance', undefined, 8000);
        break;
      case 'dig':
        localActionRef.current = { ...localActionRef.current, anim: { type: 'dig', until: now + 8000 } };
        sendAction('dig', undefined, 8000);
        break;
      case 'fish':
        localActionRef.current = { ...localActionRef.current, anim: { type: 'fish', until: now + 10000 } };
        sendAction('fish', undefined, 10000);
        break;
      case 'axe':
        localActionRef.current = { ...localActionRef.current, anim: { type: 'axe', until: now + 8000 } };
        sendAction('axe', undefined, 8000);
        break;
      case 'sit':
        localActionRef.current = { ...localActionRef.current, anim: { type: 'sit', until: now + 60000 } };
        sendAction('sit', undefined, 60000);
        break;
      case 'standup':
        localActionRef.current = { ...localActionRef.current, anim: null };
        sendAction('standup');
        break;
      case 'emote':
        if (payload) {
          localActionRef.current = { ...localActionRef.current, emote: { emoji: payload, until: now + 3000 } };
          sendAction('emote', payload, 3000);
        }
        break;
      case 'photo':
        if (canvasElemRef.current) {
          try {
            const url = canvasElemRef.current.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `farmcity-${Date.now()}.png`;
            a.click();
          } catch {
            // cross-origin canvas restriction — silently ignore
          }
        }
        break;
      default:
        break;
    }
  }, [sendAction, setLocation]);

  const handleSendChat = useCallback(() => {
    const msg = chatInput.trim();
    const socket = wsRef.current;
    if (!msg || !authPlayerRef.current || socket?.readyState !== WebSocket.OPEN) return;

    // Show own message immediately (optimistic) — triggers the canvas bubble too
    setChatMessages((prev) => [
      ...prev.slice(-49),
      {
        username: authPlayerRef.current!.username,
        message: msg,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Send to server; server will NOT echo back to sender to avoid duplicates
    socket.send(JSON.stringify({ type: 'chat', message: msg }));

    setChatInput('');
  }, [chatInput]);

  if (!authPlayer) return null;

  // Shape remote players for the canvas
  const canvasPlayers = remotePlayers as unknown as Record<
    number,
    PlayerSummary & { posX: number; posY: number }
  >;

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ background: '#2A5022' }}>
      {/* Full-screen canvas */}
      <div className="absolute inset-0">
        <IsometricCanvas
          localPlayerId={authPlayer.id}
          localAvatar={authPlayer.avatar as Avatar | undefined}
          localUsername={authPlayer.username}
          players={canvasPlayers}
          playersRef={remotePlayersRef}
          remoteActionsRef={remoteActionsRef}
          messages={chatMessages}
          localActionRef={localActionRef}
          onAction={handlePlayerAction}
          onMove={handleMove}
          onClickSelf={() => setPanel({ kind: 'self' })}
          onClickPlayer={(p) => setPanel({ kind: 'player', player: p as WsPlayer })}
          onClickObject={(type) => setPanel({ kind: 'object', objectType: type as WorldObjectType })}
          onCanvasMount={(el) => { canvasElemRef.current = el; }}
          roomTiles={roomTiles}
          roomWalls={roomWalls}
        />
      </div>

      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-2 pointer-events-none">
        <div className="flex items-center gap-2">
          <span
            className="font-['VT323'] text-2xl text-yellow-300"
            style={{ textShadow: '2px 2px 0 #1A3A12' }}
          >
            🌾 FarmCity
          </span>
          <span
            className="font-['VT323'] text-xs px-2 py-0.5"
            style={{
               background: connectionState === 'connected' ? 'rgba(46,204,113,0.85)' : 'rgba(231,76,60,0.85)',
              color: '#fff',
              border: '1px solid rgba(0,0,0,0.3)',
            }}
          >
             {connectionState === 'connected'
               ? '● En línea'
               : connectionState === 'connecting'
                 ? '● Conectando...'
                 : '● Reconectando...'}
          </span>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {plazaStatus && (
            <span
              className="font-['VT323'] text-sm text-green-200"
              style={{ textShadow: '1px 1px 0 #1A3A12' }}
            >
              👥 {plazaStatus.onlineCount}
            </span>
          )}
          <button
            className="font-['VT323'] text-sm px-2 py-1 transition-colors hover:opacity-80"
            style={{
              background: 'rgba(61,32,16,0.85)',
              color: '#FFF8E7',
              border: '2px solid #7A4F1E',
            }}
            onClick={() => {
              logout();
              setLocation('/');
            }}
          >
            Salir
          </button>
        </div>
      </div>

      {/* Bottom HUD */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none">

        {/* Chat history — slide-up panel, hidden by default */}
        {chatOpen && (
          <div
            className="mx-0 overflow-y-auto px-3 py-2 flex flex-col gap-1 pointer-events-auto"
            style={{
              background: 'rgba(10,10,10,0.88)',
              borderTop: '2px solid #3D2010',
              maxHeight: '35vh',
            }}
          >
            {chatMessages.length === 0
              ? <p className="font-['VT323'] text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Sin mensajes aún…</p>
              : chatMessages.map((m, i) => (
                <p key={i} className="font-['VT323'] text-sm leading-tight break-words">
                  <span style={{ color: '#FFD54F' }}>{m.username}: </span>
                  <span style={{ color: '#ddd' }}>{m.message}</span>
                </p>
              ))
            }
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Chat input row */}
        <div
          className="flex items-center gap-0 pointer-events-auto"
          style={{ background: 'rgba(18,18,18,0.95)', borderTop: '3px solid #3D2010' }}
        >
          {/* History toggle */}
          <button
            onClick={() => setChatOpen(v => !v)}
            className="flex items-center justify-center flex-shrink-0 transition-opacity active:scale-95"
            style={{
              width: 48, height: 48,
              background: chatOpen ? 'rgba(255,255,255,0.12)' : 'transparent',
              border: 'none',
              borderRight: '1px solid rgba(255,255,255,0.08)',
              fontSize: 18,
              position: 'relative',
            }}
            title="Historial de chat"
          >
            💬
            {/* Unread badge — shows count when history is closed */}
            {!chatOpen && chatMessages.length > 0 && (
              <span
                className="absolute top-1 right-1 font-['VT323'] text-xs leading-none px-1"
                style={{ background: '#E74C3C', color: '#fff', borderRadius: 2, minWidth: 14, textAlign: 'center' }}
              >
                {chatMessages.length > 99 ? '99' : chatMessages.length}
              </span>
            )}
          </button>

          {/* Text input */}
          <div className="flex items-center flex-1 px-3 py-2 gap-2">
            <input
              className="flex-1 bg-transparent font-['VT323'] text-base focus:outline-none"
              style={{ color: '#fff' }}
              placeholder="Decir..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && connectionState === 'connected') handleSendChat();
              }}
              maxLength={200}
            />
          </div>

          {/* Send */}
          <button
            onClick={handleSendChat}
            disabled={connectionState !== 'connected' || !chatInput.trim()}
            className="flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80 active:scale-95"
            style={{
              width: 48, height: 48,
              background: '#2ECC71',
              border: 'none',
              borderLeft: '2px solid rgba(0,0,0,0.3)',
              color: '#fff',
              fontSize: 20,
            }}
          >
            ▶
          </button>
        </div>

        {/* Action toolbar */}
        <div
          className="flex items-center justify-around pointer-events-auto"
          style={{
            background: 'rgba(15,15,15,0.95)',
            borderTop: '2px solid #3D2010',
            paddingBottom: 'env(safe-area-inset-bottom, 4px)',
          }}
        >
          {[
            { icon: HomeIcon, label: 'Mi Casa', badge: null, action: () => setLocation('/room-editor') },
            { emoji: '🚪', label: 'Salas', badge: null, action: () => setLocation('/rooms') },
            { emoji: '🎒', label: 'Inventario', badge: null },
            { emoji: '📬', label: 'Solicitudes', badge: 0 },
            { emoji: '⚙️', label: 'Ajustes', badge: null },
          ].map(({ emoji, icon: ActionIcon, label, badge, action }) => (
            <button
              key={label}
              onClick={action}
              className="flex flex-col items-center justify-center py-2 px-4 gap-0.5 transition-opacity hover:opacity-70 active:scale-95 relative"
              style={{ background: 'transparent', border: 'none', minWidth: 64 }}
            >
              <span className="text-2xl leading-none relative">
                {ActionIcon ? <ActionIcon size={24} strokeWidth={1.8} /> : emoji}
                {badge !== null && badge > 0 && (
                  <span
                    className="absolute -top-1 -right-2 font-['VT323'] text-xs px-1 leading-none"
                    style={{ background: '#E74C3C', color: '#fff', borderRadius: 2 }}
                  >
                    {badge}
                  </span>
                )}
              </span>
              <span className="font-['VT323'] text-xs" style={{ color: '#ccc' }}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Panels */}
      {panel?.kind === 'self' && authPlayer.avatar && (
        <OwnAvatarPanel
          username={authPlayer.username}
          avatar={authPlayer.avatar as Avatar}
          onClose={() => setPanel(null)}
          onAction={handlePlayerAction}
        />
      )}
      {panel?.kind === 'player' && (
        <OtherPlayerPanel
          player={panel.player as unknown as PlayerSummary}
          onClose={() => setPanel(null)}
        />
      )}
      {panel?.kind === 'object' && (
        <WorldObjectPanel
          objectType={panel.objectType}
          onClose={() => setPanel(null)}
        />
      )}
    </div>
  );
}
