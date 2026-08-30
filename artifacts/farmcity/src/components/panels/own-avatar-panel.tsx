import { useState } from 'react';
import { PanelBackdrop } from './panel-backdrop';
import { Avatar } from '@workspace/api-client-react';

// ── Shared pixel-art panel styles ─────────────────────────────────────────────
const BORDER     = '4px solid #3D2010';
const BTN_BORDER = '2px solid #3D2010';

interface OwnAvatarPanelProps {
  username: string;
  avatar:   Avatar;
  onClose:  () => void;
  onAction: (action: string, payload?: string) => void;
}

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex-1 h-3 overflow-hidden" style={{ background: '#E8D5AA', border: '1px solid #3D2010' }}>
      <div className="h-full" style={{ width: `${Math.round((value / max) * 100)}%`, background: color }} />
    </div>
  );
}

// ── Emote picker data ─────────────────────────────────────────────────────────
const EMOTES = [
  { emoji: '👋', label: 'Hola'      },
  { emoji: '😄', label: 'Feliz'     },
  { emoji: '😂', label: 'Risa'      },
  { emoji: '😍', label: 'Amor'      },
  { emoji: '😢', label: 'Triste'    },
  { emoji: '😠', label: 'Enojado'   },
  { emoji: '🤩', label: 'Asombro'   },
  { emoji: '❤️', label: 'Corazón'   },
  { emoji: '🎉', label: 'Fiesta'    },
  { emoji: '👍', label: 'Bien'      },
  { emoji: '💀', label: 'Calaca'    },
  { emoji: '🔥', label: 'Fuego'     },
  { emoji: '⭐', label: 'Estrella'  },
  { emoji: '💤', label: 'Dormir'    },
  { emoji: '🌈', label: 'Arcoíris'  },
  { emoji: '🍀', label: 'Suerte'    },
];

// ── Inventory placeholder ─────────────────────────────────────────────────────
const INVENTORY_EMPTY = (
  <div className="flex flex-col items-center gap-2 py-6">
    <span className="text-4xl">🎒</span>
    <span className="font-['VT323'] text-base text-[#7A4F1E]">Inventario vacío</span>
    <span className="font-['VT323'] text-xs text-[#B58A5A]">Recoge objetos en el mundo para verlos aquí</span>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
type SubView = 'main' | 'emociones' | 'inventario';

export function OwnAvatarPanel({ username, avatar, onClose, onAction }: OwnAvatarPanelProps) {
  const [view, setView]     = useState<SubView>('main');
  const [isSitting, setIsSitting] = useState(false);

  // ── Button handlers ──────────────────────────────────────────────────────────
  const handleCambiarRopa = () => { onAction('change-costume'); onClose(); };
  const handleBailar      = () => { onAction('dance'); onClose(); };
  const handleSentarse    = () => {
    if (isSitting) {
      onAction('standup');
    } else {
      onAction('sit');
    }
    setIsSitting(v => !v);
    onClose();
  };
  const handleFoto = () => { onAction('photo'); onClose(); };
  const handleMiGranja = () => {
    // TODO: navigate to farm when feature exists
    alert('¡Próximamente! Tu granja estará lista pronto 🌾');
  };
  const handleEmote = (emoji: string) => {
    onAction('emote', emoji);
    onClose();
  };

  // ── Sub-view: Emociones ──────────────────────────────────────────────────────
  if (view === 'emociones') {
    return (
      <PanelBackdrop onClose={onClose}>
        <div style={{ border: BORDER, background: '#FFF8E7', width: 260 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2" style={{ background: '#7A4F1E', borderBottom: BORDER }}>
            <button
              onClick={() => setView('main')}
              className="font-['VT323'] text-white text-xl hover:text-yellow-300 transition-colors"
            >
              ‹ Volver
            </button>
            <span className="font-['VT323'] text-white text-xl tracking-widest">EMOCIONES</span>
            <button
              onClick={onClose}
              className="font-['VT323'] text-white text-xl hover:text-yellow-300 transition-colors px-1"
              style={{ border: '2px solid rgba(255,255,255,0.4)', minWidth: 24, textAlign: 'center' }}
            >✕</button>
          </div>
          {/* Emoji grid */}
          <div className="p-3 grid grid-cols-4 gap-2">
            {EMOTES.map(({ emoji, label }) => (
              <button
                key={emoji}
                onClick={() => handleEmote(emoji)}
                className="flex flex-col items-center gap-0.5 py-2 hover:bg-[#F5E6C8] active:translate-y-px transition-all"
                style={{ border: BTN_BORDER, background: '#FFF8E7' }}
                title={label}
              >
                <span className="text-2xl leading-none">{emoji}</span>
                <span className="font-['VT323'] text-xs text-[#7A4F1E] leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </PanelBackdrop>
    );
  }

  // ── Sub-view: Inventario ──────────────────────────────────────────────────────
  if (view === 'inventario') {
    return (
      <PanelBackdrop onClose={onClose}>
        <div style={{ border: BORDER, background: '#FFF8E7', width: 260 }}>
          <div className="flex items-center justify-between px-3 py-2" style={{ background: '#7A4F1E', borderBottom: BORDER }}>
            <button onClick={() => setView('main')} className="font-['VT323'] text-white text-xl hover:text-yellow-300 transition-colors">‹ Volver</button>
            <span className="font-['VT323'] text-white text-xl tracking-widest">INVENTARIO</span>
            <button onClick={onClose} className="font-['VT323'] text-white text-xl hover:text-yellow-300 transition-colors px-1" style={{ border: '2px solid rgba(255,255,255,0.4)', minWidth: 24, textAlign: 'center' }}>✕</button>
          </div>
          <div className="px-3 pb-3">{INVENTORY_EMPTY}</div>
        </div>
      </PanelBackdrop>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <PanelBackdrop onClose={onClose}>
      <div style={{ border: BORDER, background: '#FFF8E7' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2" style={{ background: '#7A4F1E', borderBottom: BORDER }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="font-['VT323'] text-white text-xl tracking-widest uppercase">{username}</span>
          </div>
          <button
            onClick={onClose}
            className="font-['VT323'] text-white text-xl leading-none hover:text-yellow-300 transition-colors px-1"
            style={{ border: '2px solid rgba(255,255,255,0.4)', minWidth: 24, textAlign: 'center' }}
          >✕</button>
        </div>

        {/* Identity row */}
        <div className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: '3px solid #D4A96A', background: '#FFFDF5' }}>
          {/* Avatar swatch */}
          <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 56, height: 56, border: '3px solid #3D2010', background: '#C8E6B0' }}>
            <svg width="48" height="48" viewBox="0 0 16 16" style={{ imageRendering: 'pixelated' }}>
              <rect x="5" y="14" width="2" height="1" fill="#2A2A2A" />
              <rect x="9" y="14" width="2" height="1" fill="#2A2A2A" />
              <rect x="5" y="10" width="3" height="5" fill={avatar.pantsColor} />
              <rect x="8" y="10" width="3" height="5" fill={avatar.pantsColor} />
              <rect x="4" y="6"  width="8" height="5" fill={avatar.shirtColor} />
              <rect x="2" y="6"  width="2" height="4" fill={avatar.shirtColor} />
              <rect x="12" y="6" width="2" height="4" fill={avatar.shirtColor} />
              <rect x="2" y="10" width="2" height="1" fill={avatar.skinColor} />
              <rect x="12" y="10" width="2" height="1" fill={avatar.skinColor} />
              <rect x="7" y="5"  width="2" height="1" fill={avatar.skinColor} />
              <rect x="5" y="1"  width="6" height="5" fill={avatar.skinColor} />
              <rect x="5" y="1"  width="6" height="2" fill={avatar.hairColor} />
              <rect x="5" y="1"  width="1" height="3" fill={avatar.hairColor} />
              <rect x="6" y="3"  width="1" height="1" fill="#111" />
              <rect x="9" y="3"  width="1" height="1" fill="#111" />
            </svg>
          </div>
          <div className="flex flex-col gap-0.5 flex-1">
            <span className="font-['VT323'] text-xl text-[#3D2010] leading-tight">{username.toUpperCase()}</span>
            <div className="flex items-center gap-1">
              <span className="font-['VT323'] text-base text-[#7A4F1E]">Nivel</span>
              <span className="font-['VT323'] text-xl text-[#3D2010] leading-tight">1</span>
            </div>
            <span className="font-['VT323'] text-sm text-[#5C7A3A]">🌾 Granjero</span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-['VT323'] text-xs text-[#7A4F1E]">EXP</span>
            <div className="w-14 h-2" style={{ background: '#E8D5AA', border: '1px solid #3D2010' }}>
              <div className="h-full" style={{ width: '30%', background: '#F5A623' }} />
            </div>
            <span className="font-['VT323'] text-xs text-[#7A4F1E]">300/1000</span>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: '3px solid #D4A96A', background: '#FFFDF5' }}>
          <div className="flex items-center gap-2">
            <span className="text-sm w-4">❤️</span>
            <span className="font-['VT323'] text-sm text-[#7A4F1E] w-8">Vida</span>
            <StatBar value={100} max={100} color="#E74C3C" />
            <span className="font-['VT323'] text-xs text-[#7A4F1E] w-14 text-right">100/100</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm w-4">🪙</span>
            <span className="font-['VT323'] text-sm text-[#7A4F1E] w-8">Oro</span>
            <span className="font-['VT323'] text-lg text-[#C5A028] flex-1">0</span>
            <span className="text-xs">💎</span>
            <span className="font-['VT323'] text-lg text-[#9B59B6]">0</span>
          </div>
        </div>

        {/* Action grid — 2 columns, 4 rows */}
        <div className="p-3 grid grid-cols-2 gap-2">

          {/* Cambiar ropa */}
          <button onClick={handleCambiarRopa} className="flex items-center gap-2 px-2 py-2 text-left hover:bg-[#F5E6C8] active:translate-y-px transition-all" style={{ border: BTN_BORDER, background: '#FFF8E7' }}>
            <span className="text-base leading-none">👗</span>
            <span className="font-['VT323'] text-sm text-[#3D2010] leading-tight">Cambiar ropa</span>
          </button>

          {/* Bailar */}
          <button onClick={handleBailar} className="flex items-center gap-2 px-2 py-2 text-left hover:bg-[#F5E6C8] active:translate-y-px transition-all" style={{ border: BTN_BORDER, background: '#FFF8E7' }}>
            <span className="text-base leading-none">💃</span>
            <span className="font-['VT323'] text-sm text-[#3D2010] leading-tight">Bailar</span>
          </button>

          {/* Emociones → sub-view */}
          <button onClick={() => setView('emociones')} className="flex items-center gap-2 px-2 py-2 text-left hover:bg-[#F5E6C8] active:translate-y-px transition-all" style={{ border: BTN_BORDER, background: '#FFF8E7' }}>
            <span className="text-base leading-none">😄</span>
            <span className="font-['VT323'] text-sm text-[#3D2010] leading-tight">Emociones</span>
          </button>

          {/* Sentarse — toggle */}
          <button
            onClick={handleSentarse}
            className="flex items-center gap-2 px-2 py-2 text-left active:translate-y-px transition-all"
            style={{
              border: BTN_BORDER,
              background: isSitting ? '#D4E8C0' : '#FFF8E7',
            }}
          >
            <span className="text-base leading-none">🪑</span>
            <span className="font-['VT323'] text-sm text-[#3D2010] leading-tight">
              {isSitting ? 'Levantarse' : 'Sentarse'}
            </span>
          </button>

          {/* Fotografía */}
          <button onClick={handleFoto} className="flex items-center gap-2 px-2 py-2 text-left hover:bg-[#F5E6C8] active:translate-y-px transition-all" style={{ border: BTN_BORDER, background: '#FFF8E7' }}>
            <span className="text-base leading-none">📷</span>
            <span className="font-['VT323'] text-sm text-[#3D2010] leading-tight">Fotografía</span>
          </button>

          {/* Inventario → sub-view */}
          <button onClick={() => setView('inventario')} className="flex items-center gap-2 px-2 py-2 text-left hover:bg-[#F5E6C8] active:translate-y-px transition-all" style={{ border: BTN_BORDER, background: '#FFF8E7' }}>
            <span className="text-base leading-none">🎒</span>
            <span className="font-['VT323'] text-sm text-[#3D2010] leading-tight">Inventario</span>
          </button>

          {/* Mi Granja */}
          <button onClick={handleMiGranja} className="flex items-center gap-2 px-2 py-2 text-left hover:bg-[#F5E6C8] active:translate-y-px transition-all" style={{ border: BTN_BORDER, background: '#FFF8E7' }}>
            <span className="text-base leading-none">🏡</span>
            <span className="font-['VT323'] text-sm text-[#3D2010] leading-tight">Mi Granja</span>
          </button>

          {/* Config — placeholder */}
          <button
            onClick={() => alert('Configuración próximamente ⚙️')}
            className="flex items-center gap-2 px-2 py-2 text-left hover:bg-[#F5E6C8] active:translate-y-px transition-all"
            style={{ border: BTN_BORDER, background: '#FFF8E7' }}
          >
            <span className="text-base leading-none">⚙️</span>
            <span className="font-['VT323'] text-sm text-[#3D2010] leading-tight">Config.</span>
          </button>

        </div>

        {/* Close button */}
        <div className="px-3 pb-3">
          <button
            onClick={onClose}
            className="w-full py-2 font-['VT323'] text-base text-white tracking-widest uppercase hover:opacity-90 active:translate-y-px transition-all"
            style={{ background: '#3D2010', border: '2px solid #1A0A02' }}
          >
            Cerrar panel
          </button>
        </div>
      </div>
    </PanelBackdrop>
  );
}
