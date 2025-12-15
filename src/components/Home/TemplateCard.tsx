import React, { useEffect, useRef, useState } from 'react';
import { TemplateProjectConfig } from '../../types';
import { IconRegistry } from '../../assets/icons';
import { computeVisibleIcons, observeResize } from '../../utilities/homeUtils';

interface TemplateCardProps {
  template: TemplateProjectConfig;
  onOpenTemplate: (project: TemplateProjectConfig) => void;
}

const ICON_SIZE = 40; // px
const ICON_GAP = 10;  // px

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onOpenTemplate }) => {
  const icons: string[] = (template.nodes || [])
    .map((key: string) => (IconRegistry as any)[key])
    .filter((v: any) => typeof v === 'string');
  const showIcons = icons.length > 0;

  // Show only fully visible icons in compact row
  const rowRef = useRef<HTMLDivElement>(null);
  const [maxVisible, setMaxVisible] = useState<number>(icons.length);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;

    const calc = () => {
      const count = computeVisibleIcons(el, ICON_SIZE, ICON_GAP);
      setMaxVisible(Math.min(count, icons.length));
    };

    calc();
    return observeResize(el, calc);
  }, [icons.length]);

  const compactIcons = icons.slice(0, maxVisible);

  return (
    <div className="e-card template-card" onClick={() => onOpenTemplate(template)}>
      {showIcons ? (
        <div className="e-card-image template-icons-band">
          {/* Single-line band by default; overflow hidden and only full icons shown */}
          <div ref={rowRef} className="icons-row compact">
            {compactIcons.map((src, idx) => (
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
