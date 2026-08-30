import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, DoorOpen, LockKeyhole, Plus, RefreshCw } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  getGetPublicRoomsQueryKey,
  useGetPublicRooms,
} from '@workspace/api-client-react';
import { useAuth } from '@/contexts/auth-context';

function formatRoomDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sala disponible';

  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export default function Rooms() {
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const roomsQuery = useGetPublicRooms({
    query: {
      enabled: !!token,
      queryKey: getGetPublicRoomsQueryKey(),
      refetchInterval: 10000,
      retry: false,
    },
  });

  useEffect(() => {
    if (!token) setLocation('/');
  }, [token, setLocation]);

  if (!token) return null;

  return (
    <main className="room-list-page">
      <section className="room-list-window" aria-labelledby="room-list-title">
        <header className="room-list-topbar">
          <button
            type="button"
            className="room-list-back"
            onClick={() => setLocation('/plaza')}
            aria-label="Volver a la plaza"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="room-list-brand">
            <div className="room-list-brand-mark" aria-hidden="true">
              <DoorOpen size={22} />
            </div>
            <div>
              <small>FarmCity / Comunidad</small>
              <strong>Salas</strong>
            </div>
          </div>
          <button
            type="button"
            className="room-list-refresh"
            onClick={() => void roomsQuery.refetch()}
            disabled={roomsQuery.isFetching}
            aria-label="Actualizar salas"
            title="Actualizar salas"
          >
            <RefreshCw size={17} className={roomsQuery.isFetching ? 'room-list-spinning' : ''} />
          </button>
        </header>

        <div className="room-list-content">
          <div className="room-list-heading">
            <span className="room-list-kicker">Explora nuevos rincones</span>
            <h1 id="room-list-title">Salas de la comunidad</h1>
            <p>
              Toca una sala para entrar directamente. Cada casa tiene un ID único
              generado por FarmCity.
            </p>
            <button
              type="button"
              className="room-list-create"
              onClick={() => setLocation('/room-editor?new=1')}
              data-testid="button-create-new-room"
            >
              <Plus size={16} /> Crear nueva sala
            </button>
          </div>

          {roomsQuery.isLoading && (
            <div className="room-list-state" role="status">
              <span className="room-list-loader" aria-hidden="true" />
              Buscando salas abiertas…
            </div>
          )}

          {roomsQuery.isError && (
            <div className="room-list-state room-list-state-error" role="alert">
              No se pudieron cargar las salas. Intenta actualizar nuevamente.
            </div>
          )}

          {!roomsQuery.isLoading && !roomsQuery.isError && roomsQuery.data?.length === 0 && (
            <div className="room-list-state room-list-empty">
              <span aria-hidden="true">🌱</span>
              <strong>Aún no hay salas públicas</strong>
              <span>Crea la primera desde “Mi Casa” y aparecerá aquí.</span>
            </div>
          )}

          {!!roomsQuery.data?.length && (
            <div className="room-list-grid" aria-label="Salas públicas">
              {roomsQuery.data.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  className="room-list-card"
                  onClick={() => setLocation(`/plaza?room=${encodeURIComponent(room.id)}`)}
                  data-testid={`button-join-room-${room.id}`}
                >
                  <span className="room-list-card-icon" aria-hidden="true">🏡</span>
                  <span className="room-list-card-copy">
                    <strong>{room.name}</strong>
                    <span className="room-list-owner">Casa de {room.ownerUsername}</span>
                    <span className="room-list-id">
                      ID: <code>{room.id}</code>
                    </span>
                  </span>
                  <span className="room-list-card-meta">
                    <span>{formatRoomDate(room.createdAt)}</span>
                    {room.hasPassword && (
                      <span title="Esta sala tiene una contraseña">
                        <LockKeyhole size={13} aria-label="Sala con contraseña" />
                      </span>
                    )}
                    <ArrowRight size={18} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          )}

          <footer className="room-list-footer">
            <span>Las salas privadas no aparecen en este listado.</span>
            <button type="button" onClick={() => setLocation('/plaza')}>
              <ArrowLeft size={14} /> Volver a la plaza
            </button>
          </footer>
        </div>
      </section>
    </main>
  );
}