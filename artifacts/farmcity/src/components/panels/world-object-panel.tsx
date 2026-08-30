import { PanelBackdrop } from './panel-backdrop';

const BORDER = '4px solid #3D2010';
const BTN_BORDER = '2px solid #3D2010';

export type WorldObjectType = 'fountain' | 'tree' | 'bench';

interface ObjectConfig {
  emoji: string;
  name: string;
  subtitle: string;
  description: string;
  headerColor: string;
  actions: { emoji: string; label: string; desc: string; color: string }[];
}

const OBJECT_CONFIGS: Record<WorldObjectType, ObjectConfig> = {
  fountain: {
    emoji: '🏛️',
    name: 'Fuente Central',
    subtitle: 'Decoración Histórica',
    description: 'La fuente más antigua de FarmCity. Dicen que quien lanza una moneda y pide un deseo, lo verá cumplido antes de la próxima cosecha.',
    headerColor: '#4A6741',
    actions: [
      { emoji: '👀', label: 'Inspeccionar',  desc: 'Ver detalles del objeto',     color: '#3D2010' },
      { emoji: '💧', label: 'Beber agua',    desc: 'Restaura +10 de vida',        color: '#2980B9' },
      { emoji: '📷', label: 'Fotografiar',   desc: 'Tomar foto del objeto',       color: '#8E44AD' },
      { emoji: '✨', label: 'Desear',        desc: 'Lanza una moneda al agua',    color: '#D4A017' },
      { emoji: 'ℹ️', label: 'Información',   desc: 'Estadísticas del objeto',    color: '#7A4F1E' },
    ],
  },
  tree: {
    emoji: '🌳',
    name: 'Árbol Roble',
    subtitle: 'Naturaleza',
    description: 'Un roble centenario que da sombra a los paseantes de la plaza. Sus raíces guardan secretos de tiempos remotos.',
    headerColor: '#2E6B28',
    actions: [
      { emoji: '🔍', label: 'Examinar',     desc: 'Busca insectos o frutas',     color: '#3D2010' },
      { emoji: '📷', label: 'Fotografiar',  desc: 'Tomar foto del árbol',        color: '#8E44AD' },
      { emoji: '🍃', label: 'Recolectar',   desc: 'Recoge hojas especiales',     color: '#2E7D32' },
      { emoji: 'ℹ️', label: 'Información',  desc: 'Datos del árbol',            color: '#7A4F1E' },
    ],
  },
  bench: {
    emoji: '🪑',
    name: 'Banca de Madera',
    subtitle: 'Mobiliario de plaza',
    description: 'Una vieja banca de roble donde vecinos y viajeros descansan. ¿Cuántas historias habrá escuchado?',
    headerColor: '#7A4F1E',
    actions: [
      { emoji: '🪑', label: 'Sentarse',     desc: 'Descansa un momento',        color: '#5C7A3A' },
      { emoji: '📷', label: 'Fotografiar',  desc: 'Tomar foto de la banca',     color: '#8E44AD' },
      { emoji: '🔍', label: 'Inspeccionar', desc: 'Busca objetos perdidos',     color: '#3D2010' },
      { emoji: 'ℹ️', label: 'Información',  desc: 'Historia del objeto',       color: '#7A4F1E' },
    ],
  },
};

interface WorldObjectPanelProps {
  objectType: WorldObjectType;
  onClose: () => void;
}

export function WorldObjectPanel({ objectType, onClose }: WorldObjectPanelProps) {
  const cfg = OBJECT_CONFIGS[objectType];

  return (
    <PanelBackdrop onClose={onClose}>
      <div style={{ border: BORDER, background: '#FFF8E7' }}>

        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ background: cfg.headerColor, borderBottom: BORDER }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{cfg.emoji}</span>
            <span className="font-['VT323'] text-white text-xl tracking-widest uppercase">
              {cfg.name}
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

        {/* Object info */}
        <div
          className="flex items-center gap-4 px-4 py-3"
          style={{ borderBottom: '3px solid #D4A96A', background: '#FFFDF5' }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center text-4xl"
            style={{ width: 64, height: 64, border: '3px solid #3D2010', background: '#E8F0D8' }}
          >
            {cfg.emoji}
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-['VT323'] text-xl text-[#3D2010] leading-tight">{cfg.name}</span>
            <span className="font-['VT323'] text-sm text-[#7A4F1E]">{cfg.subtitle}</span>
            <div className="flex gap-2 mt-0.5 flex-wrap">
              <span
                className="font-['VT323'] text-xs px-1"
                style={{ background: '#FFF3CD', border: '1px solid #FFD54F', color: '#7A4F1E' }}
              >
                📍 Plaza Central
              </span>
              <span
                className="font-['VT323'] text-xs px-1"
                style={{ background: '#FFF3CD', border: '1px solid #FFD54F', color: '#7A4F1E' }}
              >
                ⭐ Nivel 1
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div
          className="px-4 py-2"
          style={{ borderBottom: '2px solid #D4A96A', background: '#FFFAEF' }}
        >
          <p className="font-['VT323'] text-sm text-[#7A4F1E] leading-snug">
            {cfg.description}
          </p>
        </div>

        {/* Actions */}
        <div className="p-3 flex flex-col gap-2">
          <span className="font-['VT323'] text-xs text-[#7A4F1E] uppercase tracking-widest px-1">
            Acciones disponibles
          </span>
          {cfg.actions.map(({ emoji, label, desc, color }) => (
            <button
              key={label}
              className="flex items-center gap-3 w-full px-3 py-2 text-left hover:opacity-90 active:translate-y-px transition-all"
              style={{ border: BTN_BORDER, background: '#FFF8E7' }}
            >
              <span className="text-base w-5 text-center leading-none flex-shrink-0">{emoji}</span>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-['VT323'] text-base leading-tight" style={{ color }}>{label}</span>
                <span className="font-['VT323'] text-xs text-[#A0856A] leading-tight truncate">{desc}</span>
              </div>
              <span className="font-['VT323'] text-[#D4A96A] text-xs flex-shrink-0">▶</span>
            </button>
          ))}
        </div>
      </div>
    </PanelBackdrop>
  );
}
