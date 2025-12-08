import React, { useEffect, useRef, useState } from 'react';
import { TemplateProjectConfig } from '../../types';
import { IconRegistry } from '../../assets/icons';

interface TemplateCardProps {
  template: TemplateProjectConfig;
  onOpenTemplate: (project: TemplateProjectConfig) => void;
}

const ICON_SIZE = 40; // px
const ICON_GAP = 10;  // px (keep in sync with CSS)

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onOpenTemplate }) => {
  const icons: string[] = (template.nodes || [])
    .map((key: string) => (IconRegistry as any)[key])
    .filter((v: any) => typeof v === 'string');
  const showIcons = icons.length > 0;

  // Show only fully visible icons in compact row
  const rowRef = useRef<HTMLDivElement>(null);
  const [maxVisible, setMaxVisible] = useState<number>(icons.length);

  useEffect(() => {
    if (!rowRef.current) return;

    const calc = () => {
      const w = rowRef.current?.clientWidth || 0;
      const perIcon = ICON_SIZE + ICON_GAP;
      const count = Math.max(1, Math.floor((w + ICON_GAP) / perIcon));
      setMaxVisible(Math.min(count, icons.length));
    };

    calc();
    const R = (window as any).ResizeObserver;
    const ro = R ? new R(calc) : null;
    if (ro && rowRef.current) ro.observe(rowRef.current);
    window.addEventListener('resize', calc);
    return () => {
      window.removeEventListener('resize', calc);
      if (ro && rowRef.current) ro.unobserve(rowRef.current);
    };
  }, [icons.length]);

  const compactIcons = icons.slice(0, maxVisible);
  const isSingleRow = icons.length <= maxVisible; // if all fit in one line

  return (
    <div key={template.id} className="e-card quick-access-card template-card" onClick={() => onOpenTemplate(template)}>
      {showIcons ? (
        <div className="e-card-image template-icons-band">
          {/* Single-line band by default; overflow hidden and only full icons shown */}
          <div ref={rowRef} className="icons-row compact">
            {compactIcons.map((src, idx) => (
              <img key={idx} className="node-icon" src={src} alt="node" />
            ))}
          </div>
          {/* Full grid on hover */}
          <div className={`icons-grid-on-hover ${isSingleRow ? 'single-row' : ''}`}>
            {icons.map((src, idx) => (
              <img key={idx} className="node-icon" src={src} alt="node" />
            ))}
          </div>
        </div>
      ) : (
        <div className="e-card-image template-icons-band" />
      )}
      <div className="e-card-content template-meta">
        <h3>{template.title}</h3>
        <p>{template.description}</p>
      </div>
    </div>
  );
};

export default TemplateCard;
