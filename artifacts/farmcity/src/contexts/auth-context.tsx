import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

export interface AvatarData {
  id: number;
  playerId: number;
  skinColor: string;
  hairColor: string;
  hairStyle: string;
  shirtColor: string;
  pantsColor: string;
  hatStyle: string | null;
  accessory: string | null;
}

export interface PlayerData {
  id: number;
  username: string;
  createdAt: string;
  isOnline: boolean;
  avatar?: AvatarData;
}

interface AuthContextValue {
  token: string | null;
  player: PlayerData | null;
  isInitialized: boolean;
  setPlayer: (player: PlayerData) => void;
  login: (token: string, player: PlayerData) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'farmcity_token';

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Some browsers block storage in private or restricted contexts. Keep the
    // in-memory session usable instead of crashing the login flow.
    return null;
  }
}

function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The API session can still be used until this tab is closed.
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [player, setPlayerState] = useState<PlayerData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Read storage at request time so a just-completed login is available to the
  // very next API request, even before React has finished rendering state.
  useEffect(() => {
    setAuthTokenGetter(readStoredToken);
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== TOKEN_KEY) return;

      const nextToken = event.newValue;
      setToken(nextToken);
      // Let AuthWrapper validate the token again in this tab. Clearing the
      // player immediately prevents showing the previous account while the
      // new session is being restored.
      setPlayerState(null);
    };

    window.addEventListener('storage', handleStorageChange);
    setIsInitialized(true);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      setAuthTokenGetter(null);
    };
  }, []);

  const login = useCallback((newToken: string, newPlayer: PlayerData) => {
    storeToken(newToken);
    setToken(newToken);
    setPlayerState(newPlayer);
  }, []);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setPlayerState(null);
  }, []);

  const setPlayer = useCallback((newPlayer: PlayerData) => {
    setPlayerState(newPlayer);
  }, []);

  return (
    <AuthContext.Provider value={{ token, player, isInitialized, setPlayer, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
