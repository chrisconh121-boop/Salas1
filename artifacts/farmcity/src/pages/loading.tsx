import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/auth-context';

export default function Loading() {
  const [, setLocation] = useLocation();
  const { token, player } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!token) {
        setLocation('/');
      } else if (player?.avatar) {
        setLocation('/plaza');
      } else if (player) {
        setLocation('/avatar');
      } else {
        // Still waiting for player data, check again
        setTimeout(() => setLocation('/'), 1500);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [token, player, setLocation]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #2A5022 0%, #3A6E2F 50%, #2A5022 100%)' }}
    >
      {/* Decorative pixel tiles */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg,transparent,transparent 31px,rgba(255,255,255,0.5) 31px,rgba(255,255,255,0.5) 32px),' +
            'repeating-linear-gradient(90deg,transparent,transparent 31px,rgba(255,255,255,0.5) 31px,rgba(255,255,255,0.5) 32px)',
        }}
      />

      <div className="relative z-10 text-center select-none">
        <div className="mb-2 text-7xl">🌾</div>
        <h1
          className="font-['VT323'] text-8xl text-yellow-300 tracking-widest"
          style={{ textShadow: '4px 4px 0 #1A3A12, 2px 2px 0 rgba(0,0,0,0.5)' }}
        >
          FarmCity
        </h1>
        <p className="font-['VT323'] text-2xl text-green-200 mt-2 tracking-wide">
          Preparando el mundo...
        </p>

        {/* Pixel bouncing dots */}
        <div className="flex justify-center gap-4 mt-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-4 h-4"
              style={{
                background: '#FFD54F',
                border: '2px solid #B8860B',
                animation: `farmBounce 0.9s ${i * 0.15}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <p
        className="absolute bottom-8 font-['VT323'] text-base text-green-400 tracking-widest"
        style={{ textShadow: '1px 1px 0 #1A3A12' }}
      >
        Un mundo campestre multijugador
      </p>

      <style>{`
        @keyframes farmBounce {
          0%, 100% { transform: translateY(0) scaleY(1); }
          40% { transform: translateY(-14px) scaleY(0.9); }
          60% { transform: translateY(-14px) scaleY(0.9); }
        }
      `}</style>
    </div>
  );
}
