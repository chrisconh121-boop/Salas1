import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';
import type { PlayerData } from '@/contexts/auth-context';
import { useLogin, useRegister } from '@workspace/api-client-react';
import type { ErrorType } from '@workspace/api-client-react';

function getRequestError(error: unknown, fallback: string): string {
  const requestError = error as ErrorType<{ error?: string }>;
  return requestError.data?.error ?? requestError.message ?? fallback;
}

export default function Home() {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, player } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (player?.avatar) {
      setLocation('/plaza');
    } else if (player) {
      setLocation('/avatar');
    }
  }, [player, setLocation]);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.token, data.player as unknown as PlayerData);
        if (data.player.avatar) {
          setLocation('/plaza');
        } else {
          setLocation('/avatar');
        }
      },
      onError: (err) => {
        setError(getRequestError(err, 'Error al iniciar sesión'));
      },
    },
  });

  const registerMutation = useRegister({
    mutation: {
      onSuccess: (data) => {
        login(data.token, data.player as unknown as PlayerData);
        setLocation('/avatar');
      },
      onError: (err) => {
        setError(getRequestError(err, 'Error al registrarse'));
      },
    },
  });

  const isPending = loginMutation.isPending || registerMutation.isPending;

  if (player) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      setError('Escribe tu nombre de jugador');
      return;
    }
    if (isRegister) {
      registerMutation.mutate({ data: { username: normalizedUsername, password } });
    } else {
      loginMutation.mutate({ data: { username: normalizedUsername, password } });
    }
  };

  return (
    <main className="farmcity-login-scene">
      <div className="farmcity-login-vignette" aria-hidden="true" />

      <section
        className="farmcity-login-shell"
        aria-labelledby="farmcity-login-title"
      >
        <img
          className="farmcity-login-frame"
          src="/assets/farmcity-login-frame.png"
          alt=""
          aria-hidden="true"
        />

        <div className="farmcity-login-content">
          <h1 id="farmcity-login-title" className="sr-only">
            {isRegister ? 'Crear una cuenta en FarmCity' : 'Entrar a FarmCity'}
          </h1>

          <div
            className="farmcity-login-mode"
            role="tablist"
            aria-label="Modo de acceso"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!isRegister}
              className={!isRegister ? 'is-active' : ''}
              onClick={() => {
                setIsRegister(false);
                setError('');
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              className={isRegister ? 'is-active' : ''}
              onClick={() => {
                setIsRegister(true);
                setError('');
              }}
            >
              Crear cuenta
            </button>
          </div>

          <p className="farmcity-login-kicker">
            {isRegister
              ? 'Crea tu personaje y empieza tu historia'
              : 'Tu ciudad campestre te está esperando'}
          </p>

          <form onSubmit={handleSubmit} className="farmcity-login-form">
            <div className="farmcity-login-field">
              <label htmlFor="farmcity-username">Nombre de jugador</label>
              <input
                id="farmcity-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
                autoComplete="username"
                placeholder="Escribe tu nombre"
              />
            </div>

            <div className="farmcity-login-field">
              <label htmlFor="farmcity-password">Contraseña</label>
              <input
                id="farmcity-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {error && (
              <div className="farmcity-login-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="farmcity-login-submit"
            >
              {isPending
                ? 'Cargando…'
                : isRegister
                  ? 'Crear mi cuenta'
                  : 'Entrar al juego'}
            </button>
          </form>

          <button
            type="button"
            className="farmcity-login-switch"
            onClick={() => {
              setIsRegister((current) => !current);
              setError('');
            }}
          >
            {isRegister
              ? '¿Ya tienes una cuenta? Entrar'
              : '¿No tienes cuenta? Regístrate'}
          </button>

          <p className="farmcity-login-note">
            Mundo multijugador en tiempo real
          </p>
        </div>
      </section>
    </main>
  );
}
