import { useEffect, useRef } from 'react';

interface PanelBackdropProps {
  onClose: () => void;
  children: React.ReactNode;
}

export function PanelBackdrop({ onClose, children }: PanelBackdropProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Animate in on mount
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'scale(0.92) translateY(8px)';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
      el.style.opacity = '1';
      el.style.transform = 'scale(1) translateY(0)';
    });
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'rgba(26, 15, 5, 0.72)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-[340px]"
        style={{ willChange: 'transform, opacity' }}
      >
        {children}
      </div>
    </div>
  );
}
