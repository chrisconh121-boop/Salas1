import { useLocation } from 'wouter';

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ background: '#3A6E2F' }}
    >
      <div className="text-center">
        <div className="text-6xl mb-4">🌾</div>
        <h1
          className="font-['VT323'] text-8xl text-yellow-300"
          style={{ textShadow: '4px 4px 0 #1A3A12' }}
        >
          404
        </h1>
        <p className="font-['VT323'] text-2xl text-green-200 mt-2">
          Esta página no existe en FarmCity
        </p>
        <p className="font-['VT323'] text-lg text-green-400 mt-1">
          Quizás la pisoteó una vaca 🐄
        </p>
        <button
          onClick={() => setLocation('/')}
          className="mt-8 px-8 py-3 font-['VT323'] text-xl tracking-widest transition-all active:translate-y-px"
          style={{
            background: '#7A4F1E',
            color: '#FFF8E7',
            border: '3px solid #3D2010',
          }}
        >
          🌾 Volver al inicio
        </button>
      </div>
    </div>
  );
}
