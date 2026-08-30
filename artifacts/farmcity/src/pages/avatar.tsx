import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  CircleUserRound,
  Crosshair,
  Footprints,
  Glasses,
  Save,
  Search,
  Scissors,
  Shirt,
  Sparkles,
  Star,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  getGetAvatarQueryKey,
  useGetAvatar,
  useGetAvatarOptions,
  useSaveAvatar,
} from '@workspace/api-client-react';
import { SpriteAvatarPreview } from '@/components/sprite-avatar-preview';
import {
  drawHairThumbnail,
  HAIR_STYLES,
  HAIR_STYLE_LABELS,
} from '@/lib/hair-renderer';

type CategoryKey =
  | 'hair'
  | 'eyes'
  | 'shirts'
  | 'pants'
  | 'shoes'
  | 'accessories';

type Category = {
  key: CategoryKey;
  label: string;
  placeholder: string;
  icon: typeof Scissors;
};

const CATEGORIES: Category[] = [
  { key: 'hair', label: 'Cabello', placeholder: 'cabello', icon: Scissors },
  { key: 'eyes', label: 'Ojos', placeholder: 'ojos', icon: Glasses },
  { key: 'shirts', label: 'Camisas', placeholder: 'camisas', icon: Shirt },
  { key: 'pants', label: 'Pantalones', placeholder: 'pantalones', icon: UserRound },
  { key: 'shoes', label: 'Zapatos', placeholder: 'zapatos', icon: Footprints },
  { key: 'accessories', label: 'Accesorios', placeholder: 'accesorios', icon: Sparkles },
];

const DEFAULT_SKIN_COLORS = [
  '#f5d0b5',
  '#e7b28d',
  '#c98762',
  '#9e6048',
  '#6c3d32',
  '#f2e4dc',
];

const DEFAULT_SHIRT_COLORS = [
  '#a552b8',
  '#3973b8',
  '#3c9b78',
  '#c87942',
  '#d35a65',
  '#26344d',
];

const DEFAULT_PANTS_COLORS = [
  '#202339',
  '#3e2d54',
  '#31475a',
  '#5c3942',
  '#78634f',
];

const DEFAULT_HAIR_COLORS = [
  '#17131F',
  '#3B241A',
  '#6B3E26',
  '#A76435',
  '#D28A45',
  '#E1B56A',
  '#6D214F',
  '#B83A3A',
  '#1F6F78',
  '#9AA7B2',
  '#6F4AA8',
];

function ColorSwatch({
  color,
  selected,
  onClick,
  disabled = false,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={`Elegir color ${color}`}
      data-testid={`button-color-${color.replace('#', '')}`}
      className={`wardrobe-swatch ${selected ? 'wardrobe-swatch-selected' : ''} ${disabled ? 'wardrobe-swatch-disabled' : ''}`}
      style={{ backgroundColor: color }}
      onClick={onClick}
      disabled={disabled}
    />
  );
}

function HairThumbnail({
  hairStyle,
  hairColor,
}: {
  hairStyle: string;
  hairColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    drawHairThumbnail(context, canvas.width, hairStyle, hairColor);
  }, [hairColor, hairStyle]);

  return (
    <canvas
      ref={canvasRef}
      width={112}
      height={86}
      className="wardrobe-hair-thumbnail"
      data-testid={`canvas-hair-thumbnail-${hairStyle}`}
      aria-hidden="true"
    />
  );
}

function EmptyCatalog({ category }: { category: Category }) {
  const Icon = category.icon;

  return (
    <div className="wardrobe-empty">
      <div className="wardrobe-empty-icon">
        <Icon size={34} strokeWidth={1.5} />
      </div>
      <h3 data-testid="text-catalog-empty">Catálogo vacío</h3>
      <p>
        Todavía no hay {category.placeholder} disponibles.
        <br />
        Aquí aparecerán tus próximos sprites.
      </p>
      <div className="wardrobe-empty-slots" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} className="wardrobe-empty-slot">
            <Icon size={21} strokeWidth={1.2} />
          </span>
        ))}
      </div>
    </div>
  );
}

function LockedColorOption({ garment }: { garment: string }) {
  return (
    <p className="wardrobe-color-locked">
      Sin {garment} equipada: conserva el color del cuerpo
    </p>
  );
}

export default function AvatarCreator() {
  const { token, player, setPlayer } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: options, isLoading: isOptionsLoading, isError: isOptionsError } = useGetAvatarOptions();
  const { data: existingAvatar } = useGetAvatar({
    query: {
      enabled: !!token,
      queryKey: getGetAvatarQueryKey(),
      retry: false,
    },
  });

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('hair');
  const [search, setSearch] = useState('');
  const [facing, setFacing] = useState(0);
  const [skinColor, setSkinColor] = useState(DEFAULT_SKIN_COLORS[0]);
  // Kept for the API contract; the color control returns with the real sprite.
  const [hairColor, setHairColor] = useState(DEFAULT_HAIR_COLORS[0]);
  const [hairStyle, setHairStyle] = useState(HAIR_STYLES[0] ?? 'none');
  const [shirtColor, setShirtColor] = useState(DEFAULT_SHIRT_COLORS[0]);
  const [pantsColor, setPantsColor] = useState(DEFAULT_PANTS_COLORS[0]);

  useEffect(() => {
    if (!token) {
      setLocation('/');
    }
  }, [setLocation, token]);

  useEffect(() => {
    if (!existingAvatar) return;
    setSkinColor(existingAvatar.skinColor);
    setHairColor(existingAvatar.hairColor);
    setHairStyle(existingAvatar.hairStyle || 'none');
    setShirtColor(existingAvatar.shirtColor);
    setPantsColor(existingAvatar.pantsColor);
  }, [existingAvatar?.playerId]);

  useEffect(() => {
    if (!options || existingAvatar) return;
    if (options.skinColors?.length) setSkinColor(options.skinColors[0]);
    if (options.shirtColors?.length) setShirtColor(options.shirtColors[0]);
  }, [existingAvatar, options]);

  const saveMutation = useSaveAvatar({
    mutation: {
      onSuccess: (saved: unknown) => {
        queryClient.invalidateQueries({ queryKey: getGetAvatarQueryKey() });
        if (player) setPlayer({ ...player, avatar: saved as typeof player.avatar });
        setLocation('/plaza');
      },
    },
  });

  const active = CATEGORIES.find((category) => category.key === activeCategory) ?? CATEGORIES[0];
  const skinColors = options?.skinColors?.length ? options.skinColors : DEFAULT_SKIN_COLORS;
  const hairColors = DEFAULT_HAIR_COLORS;
  const hairStyles = options?.hairStyles?.length ? options.hairStyles : HAIR_STYLES;
  const shirtColors = options?.shirtColors?.length ? options.shirtColors : DEFAULT_SHIRT_COLORS;
  // Clothing sprites are not available yet, so clothing colors stay tied to
  // the body color until a garment is actually equipped.
  const hasShirtEquipped = false;
  const hasPantsEquipped = false;
  const previewShirtColor = hasShirtEquipped ? shirtColor : skinColor;
  const previewPantsColor = hasPantsEquipped ? pantsColor : skinColor;
  const filteredHairStyles = hairStyles.filter((style) =>
    (HAIR_STYLE_LABELS[style] ?? style).toLowerCase().includes(search.trim().toLowerCase()),
  );
  const rotate = (amount: number) => {
    setFacing((current) => (current + amount + 8) % 8);
  };

  const handleSave = () => {
    saveMutation.mutate({
      data: {
        skinColor,
        hairColor,
        hairStyle,
        shirtColor: hasShirtEquipped ? shirtColor : skinColor,
        pantsColor: hasPantsEquipped ? pantsColor : skinColor,
        hatStyle: null,
        accessory: null,
      },
    });
  };

  if (!token) return null;

  return (
    <main className="wardrobe-page">
      <section className="wardrobe-window" aria-label="Armario de personaje">
        <header className="wardrobe-header">
          <div className="wardrobe-title">
  <div className="wardrobe-title-icon">
  <img src="/assets/sheriff-badge.png" alt="Insignia" className="wardrobe-badge-img" />
</div>

  <div className="wardrobe-title-text">
    <p>PERSONALIZACIÓN</p>
    <h1 data-testid="text-page-title">Armario</h1>
  </div>

  <div className="wardrobe-title-decoration">
  </div>
</div>
          <button
            type="button"
            className="wardrobe-close"
            data-testid="button-close-wardrobe"
            aria-label="Cerrar armario"
            onClick={() => setLocation('/plaza')}
          >
            <X size={25} />
          </button>
        </header>

        <nav className="wardrobe-tabs" aria-label="Categorías del armario">
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            const selected = category.key === activeCategory;
            return (
              <button
                type="button"
                key={category.key}
                className={`wardrobe-tab ${selected ? 'wardrobe-tab-active' : ''}`}
                data-testid={`button-category-${category.key}`}
                aria-pressed={selected}
                onClick={() => setActiveCategory(category.key)}
              >
                <Icon size={17} strokeWidth={2.1} />
                <span>{category.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="wardrobe-content">
          <aside className="wardrobe-preview-panel">
            <div className="wardrobe-panel-heading">
              <span>VISTA PREVIA</span>
              <span className="wardrobe-live-dot">EN VIVO</span>
            </div>

            <div className="wardrobe-avatar-stage" data-testid="preview-avatar-stage">
              <div className="wardrobe-avatar-glow" />
              <SpriteAvatarPreview
                skinColor={skinColor}
                hairColor={hairColor}
                shirtColor={previewShirtColor}
                pantsColor={previewPantsColor}
                hasClothing={hasShirtEquipped || hasPantsEquipped}
                hairStyle={hairStyle}
                facing={facing}
                size={280}
              />
              <div className="wardrobe-avatar-shadow" />
            </div>

            <div className="wardrobe-player-name">
              <CircleUserRound size={16} />
              <span data-testid="text-player-name">{player?.username ?? 'Tu personaje'}</span>
            </div>

            <div className="wardrobe-preview-controls">
              <button type="button" data-testid="button-rotate-left" onClick={() => rotate(-1)} aria-label="Girar a la izquierda">
                <ChevronLeft size={20} />
              </button>
              <span>GIRAR</span>
              <button type="button" data-testid="button-rotate-right" onClick={() => rotate(1)} aria-label="Girar a la derecha">
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="wardrobe-base-controls">
              <div className="wardrobe-control-label">
                <span>APARIENCIA BASE</span>
                <small>Se guarda con tu personaje</small>
              </div>

              <div className="wardrobe-color-group">
                <span>PIEL</span>
                <div className="wardrobe-swatches">
                  {skinColors.map((color) => (
                    <ColorSwatch
                      key={color}
                      color={color}
                      selected={skinColor === color}
                      onClick={() => setSkinColor(color)}
                    />
                  ))}
                </div>
              </div>

              <div className="wardrobe-color-group">
                <span>CABELLO</span>
                <div className="wardrobe-swatches">
                  {hairColors.map((color) => (
                    <ColorSwatch
                      key={color}
                      color={color}
                      selected={hairColor === color}
                      onClick={() => setHairColor(color)}
                    />
                  ))}
                </div>
              </div>

              <div className="wardrobe-color-group">
                <span>CAMISA</span>
                {hasShirtEquipped ? (
                  <div className="wardrobe-swatches">
                    {shirtColors.map((color) => (
                      <ColorSwatch
                        key={color}
                        color={color}
                        selected={shirtColor === color}
                        onClick={() => setShirtColor(color)}
                      />
                    ))}
                  </div>
                ) : (
                  <LockedColorOption garment="camisa" />
                )}
              </div>

              <div className="wardrobe-color-group">
                <span>PANTALÓN</span>
                {hasPantsEquipped ? (
                  <div className="wardrobe-swatches">
                    {DEFAULT_PANTS_COLORS.map((color) => (
                      <ColorSwatch
                        key={color}
                        color={color}
                        selected={pantsColor === color}
                        onClick={() => setPantsColor(color)}
                      />
                    ))}
                  </div>
                ) : (
                  <LockedColorOption garment="pantalón" />
                )}
              </div>
            </div>
          </aside>

          <section className="wardrobe-catalog-panel">
            <div className="wardrobe-catalog-toolbar">
              <label className="wardrobe-search">
                <Search size={19} />
                  <input
                   data-testid="input-search-hair"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Buscar ${active.placeholder}...`}
                  aria-label={`Buscar ${active.label}`}
                />
              </label>
               <div className="wardrobe-filter" aria-label="Filtro actual del catálogo" data-testid="status-catalog-filter">
                Todos
                <ChevronDown size={17} />
               </div>
            </div>

            <div className="wardrobe-catalog-heading">
              <div>
                <p>CATÁLOGO</p>
                 <h2 data-testid="text-active-category">{active.label}</h2>
              </div>
               <span>
                 {activeCategory === 'hair' ? `${filteredHairStyles.length} ELEMENTOS` : '0 ELEMENTOS'}
               </span>
            </div>

              {isOptionsLoading ? (
                <div className="wardrobe-loading-grid" aria-label="Cargando catálogo" data-testid="status-catalog-loading">
                  {Array.from({ length: 3 }, (_, index) => <span key={index} className="wardrobe-skeleton-card" />)}
                </div>
              ) : activeCategory === 'hair' ? (
               <div className="wardrobe-item-grid">
                 {filteredHairStyles.map((style) => {
                   const selected = hairStyle === style;
                   return (
                     <button
                       type="button"
                       key={style}
                        className={`wardrobe-item ${selected ? 'wardrobe-item-selected' : ''}`}
                        data-testid={`button-hair-${style}`}
                       aria-pressed={selected}
                       onClick={() => setHairStyle(style)}
                     >
                       <span className="wardrobe-item-preview">
                         <HairThumbnail hairStyle={style} hairColor={hairColor} />
                       </span>
                       <span className="wardrobe-item-name">
                         {HAIR_STYLE_LABELS[style] ?? style}
                       </span>
                        {selected ? <span className="wardrobe-item-check"><Check size={14} strokeWidth={2.5} /></span> : null}
                     </button>
                   );
                 })}
               </div>
              ) : isOptionsError ? (
                <div className="wardrobe-empty wardrobe-empty-error" data-testid="status-catalog-error">
                  <div className="wardrobe-empty-icon"><Crosshair size={27} strokeWidth={1.5} /></div>
                  <h3>No pudimos cargar el catálogo</h3>
                  <p>Tu vista previa sigue disponible. Inténtalo de nuevo más tarde.</p>
                </div>
              ) : (
               <EmptyCatalog category={active} />
             )}

             {activeCategory === 'hair' ? (
               <div className="wardrobe-hair-note">
                 <Scissors size={15} />
                 <span>Sprite por capas activo: puedes cambiar su color y verlo en las ocho direcciones.</span>
               </div>
             ) : null}
          </section>
        </div>

        <footer className="wardrobe-footer">
          <button
            type="button"
            className="wardrobe-action wardrobe-action-secondary"
            data-testid="button-cancel-avatar"
            onClick={() => setLocation('/plaza')}
          >
            <X size={19} />
            Cancelar
          </button>
          <button
            type="button"
            className="wardrobe-action wardrobe-action-primary"
            data-testid="button-save-avatar"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            <Save size={19} />
            {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
          {saveMutation.isError ? (
            <p className="wardrobe-save-error" role="alert" data-testid="status-save-error">
              No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.
            </p>
          ) : null}
        </footer>
      </section>
    </main>
  );
}