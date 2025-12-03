import React from 'react';
import { TemplateProjectConfig } from '../../types';

interface TemplateCardProps {
  template: TemplateProjectConfig;
  onOpenTemplate: (project: TemplateProjectConfig) => void;
}

const TemplateCard: React.FC<TemplateCardProps> = ({ template, onOpenTemplate }) => {
  return (
    <div key={template.id} className="e-card modern-card quick-access-card template-card" onClick={() => onOpenTemplate(template)}>
      <div className="e-card-image template-image">
        {template.image && <img src={template.image} />}
      </div>
      <div className="e-card-content">
        <h3>{template.title}</h3>
        <p>{template.description}</p>
      </div>
    </div>
  );
};

export default TemplateCard;
