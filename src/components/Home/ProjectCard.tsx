import React from 'react';
import { DropDownButtonComponent, MenuEventArgs } from '@syncfusion/ej2-react-splitbuttons';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ProjectData } from '../../types';

interface ProjectCardProps {
  project: ProjectData;
  isBookmarked: boolean;
  onOpenProject: (project: ProjectData) => void;
  onBookmarkToggle: (projectId: string, e: React.MouseEvent) => void;
  onMenuSelect: (project: ProjectData) => (args: MenuEventArgs) => void;
  menuItems: { text: string; iconCss: string }[];
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isBookmarked,
  onOpenProject,
  onBookmarkToggle,
  onMenuSelect,
  menuItems,
}) => {
  return (
    <div
      key={project.id}
      className="e-card modern-card project-card card-item"
      onClick={() => onOpenProject(project)}
    >
      <div className="e-card-image project-thumbnail">
        <img src={project.thumbnail ?? '/assets/images/template-images/default-image.jpg'} alt={project.name} />
        <div className="project-card-overlay">
          <DropDownButtonComponent
            items={menuItems}
            iconCss="e-icons e-more-vertical-1"
            cssClass="e-caret-hide project-menu-dropdown"
            select={onMenuSelect(project)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
      <div className="e-card-content">
        <div className="project-info">
          <h3 title={project.name} className="project-title">{project.name}</h3>
          <p className="project-modified">Modified: {new Date(project.lastModified).toLocaleString()}</p>
        </div>
        <div className="project-bookmark-card">
          <ButtonComponent
            cssClass="bookmark-btn-card"
            iconCss={`e-icons e-star-filled ${isBookmarked ? 'star-filled' : ''}`}
            onClick={(e) => onBookmarkToggle(project.id, e)}
            title={isBookmarked ? 'Remove from favorites' : 'Add to favorites'}
          />
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;