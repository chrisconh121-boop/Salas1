import { PanelBackdrop } from './panel-backdrop';
import { PlayerSummary } from '@workspace/api-client-react';

const BORDER = '4px solid #3D2010';
const BTN_BORDER = '2px solid #3D2010';

interface OtherPlayerPanelProps {
  player: PlayerSummary;
  onClose: () => void;
}

const ACTIONS = [
  { emoji: '👤', label: 'Ver perfil',      color: '#5C7A3A' },
  { emoji: '➕', label: 'Agregar amigo',   color: '#2980B9' },
  { emoji: '✉️', label: 'Mensaje privado',  color: '#7A4F1E' },
  { emoji: '🔄', label: 'Intercambiar',    color: '#8E44AD' },
  { emoji: '👥', label: 'Invitar a grupo', color: '#27AE60' },
  { emoji: '🏡', label: 'Visitar granja',  color: '#D4A017' },
  { emoji: '🚩', label: 'Reportar',        color: '#C0392B' },
  { emoji: '🚫', label: 'Bloquear',        color: '#7F8C8D' },
] as const;

export function OtherPlayerPanel({ player, onClose }: OtherPlayerPanelProps) {
  const av = player.avatar;

  return (
    <PanelBackdrop onClose={onClose}>
      <div style={{ border: BORDER, background: '#FFF8E7' }}>

        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ background: '#7A4F1E', borderBottom: BORDER }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-['VT323'] text-white text-xl tracking-widest uppercase">
              {player.username}
            </span>
          </div>
          <button
            onClick={onClose}
            className="font-['VT323'] text-white text-xl leading-none hover:text-yellow-300 transition-colors px-1"
            style={{ border: '2px solid rgba(255,255,255,0.4)', minWidth: 24, textAlign: 'center' }}
          >
            ✕
          </button>
        </div>

        {/* Player identity */}
        <div
          className="flex items-center gap-4 px-4 py-3"
          style={{ borderBottom: '3px solid #D4A96A', background: '#FFFDF5' }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: 52, height: 52, border: '3px solid #3D2010', background: '#D4E6F8' }}
          >
            {av ? (
              <svg width="44" height="44" viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
                <rect x="5" y="14" width="2" height="1" fill="#2A2A2A" />
                <rect x="9" y="14" width="2" height="1" fill="#2A2A2A" />
                <rect x="5" y="10" width="3" height="5" fill={av.pantsColor} />
                <rect x="8" y="10" width="3" height="5" fill={av.pantsColor} />
                <rect x="4" y="6" width="8" height="5" fill={av.shirtColor} />
                <rect x="2" y="6" width="2" height="4" fill={av.shirtColor} />
                <rect x="12" y="6" width="2" height="4" fill={av.shirtColor} />
                <rect x="2" y="10" width="2" height="1" fill={av.skinColor} />
                <rect x="12" y="10" width="2" height="1" fill={av.skinColor} />
                <rect x="7" y="5" width="2" height="1" fill={av.skinColor} />
                <rect x="5" y="1" width="6" height="5" fill={av.skinColor} />
                <rect x="5" y="1" width="6" height="2" fill={av.hairColor} />
                <rect x="5" y="1" width="1" height="3" fill={av.hairColor} />
                <rect x="6" y="3" width="1" height="1" fill="#111" />
                <rect x="9" y="3" width="1" height="1" fill="#111" />
              </svg>
            ) : (
              <span className="text-2xl">👤</span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-['VT323'] text-xl text-[#3D2010] leading-tight">
              {player.username.toUpperCase()}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-['VT323'] text-sm text-[#7A4F1E]">Nivel 1</span>
              <span className="text-[#D4A96A]">•</span>
              <span className="font-['VT323'] text-sm text-[#5C7A3A]">⛏️ Aventurero</span>
            </div>
            <div className="flex gap-2 mt-0.5 flex-wrap">
              <span
                className="font-['VT323'] text-xs px-1"
                style={{ background: '#E8F5E9', border: '1px solid #81C784', color: '#2E7D32' }}
              >
                Activo ahora
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 flex flex-col gap-1.5">
          {ACTIONS.map(({ emoji, label, color }) => (
            <button
              key={label}
              className="flex items-center gap-3 w-full px-3 py-2 text-left hover:opacity-90 active:translate-y-px transition-all"
              style={{ border: BTN_BORDER, background: '#FFF8E7' }}
            >
              <span className="text-base w-5 text-center leading-none flex-shrink-0">{emoji}</span>
              <span className="font-['VT323'] text-base leading-tight flex-1" style={{ color }}>
                {label}
              </span>
              <span className="font-['VT323'] text-[#D4A96A] text-xs">▶</span>
            </button>
          ))}
        </div>
      </div>
    </PanelBackdrop>
  );
}
