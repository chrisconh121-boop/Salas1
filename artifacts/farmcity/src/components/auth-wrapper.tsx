import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { token, isInitialized, setPlayer, logout } = useAuth();

  const {
    data: player,
    isSuccess,
    isPending,
    error,
    refetch,
  } = useGetMe({
    query: {
      enabled: isInitialized && !!token,
      // Keep the session lookup scoped to the current token. Without this,
      // React Query can briefly reuse the previous player's /auth/me result
      // after a logout/login cycle.
      queryKey: [...getGetMeQueryKey(), token],
      retry: false,
      // A previous invalid token can leave this query in an error state. Allow
      // it to fetch again after the user signs in with a new token.
      retryOnMount: true,
    }
  });

  useEffect(() => {
    if (isSuccess && player) {
      setPlayer({
        ...player,
        avatar: player.avatar ?? undefined,
      });
    }
  }, [isSuccess, player, setPlayer]);

  useEffect(() => {
    // Only clear session on a genuine 401 (invalid/expired token)
    if (error && (error as { status?: number }).status === 401) {
      logout();
    }
  }, [error, logout]);

  if (token && (!isInitialized || (isPending && !player))) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: '#2A5022', color: '#FFF8E7' }}
      >
        <p className="font-['VT323'] text-2xl">Cargando tu mundo...</p>
      </div>
    );
  }

  const errorStatus = (error as { status?: number } | null)?.status;
  if (token && error && errorStatus !== 401) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center px-6 text-center"
        style={{ background: '#2A5022', color: '#FFF8E7' }}
      >
        <div className="max-w-sm">
          <p className="font-['VT323'] text-2xl">No pudimos recuperar tu mundo</p>
          <p className="mt-2 font-['VT323'] text-lg opacity-80">
            Tu sesión sigue guardada. Intenta conectar de nuevo.
          </p>
          <button
            type="button"
            className="mt-5 border-2 px-5 py-2 font-['VT323'] text-xl transition-opacity hover:opacity-80"
            style={{
              background: '#B86B2D',
              color: '#FFF8E7',
              borderColor: '#F6C453',
            }}
            onClick={() => void refetch()}
          >
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
