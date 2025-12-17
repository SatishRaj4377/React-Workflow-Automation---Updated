import React, { useState } from 'react';
import { DropDownButtonComponent, MenuEventArgs } from '@syncfusion/ej2-react-splitbuttons';
import { ButtonComponent, CheckBoxComponent, ChangeEventArgs as CheckBoxChangeEventArgs } from '@syncfusion/ej2-react-buttons';
import { TooltipComponent } from '@syncfusion/ej2-react-popups';
import { ProjectData } from '../../types';
import { IconRegistry } from '../../assets/icons';

interface ProjectListItemProps {
  project: ProjectData;
  isSelected: boolean;
  isBookmarked: boolean;
  onOpenProject: (project: ProjectData) => void;
  onToggleSelect: (project: ProjectData, isChecked: boolean) => void;
  onBookmarkToggle: (projectId: string, e: React.MouseEvent) => void;
  onMenuSelect: (project: ProjectData) => (args: MenuEventArgs) => void;
  menuItems: { text: string; iconCss: string }[];
  formatDate: (date: Date) => string;
  formatDateForListCell: (date: Date | string) => string;
}

const ProjectListItem: React.FC<ProjectListItemProps> = ({
  project,
  isSelected,
  isBookmarked,
  onOpenProject,
  onToggleSelect,
  onBookmarkToggle,
  onMenuSelect,
  menuItems,
  formatDate,
  formatDateForListCell,
}) => {
  const WorkflowFolderIcon = IconRegistry['WorkflowFolder'];
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`project-list-item ${isSelected ? 'selected' : ''} ${menuOpen ? 'menu-open' : ''}`}
      onClick={() => onOpenProject(project)}
      tabIndex={0}
      aria-label={`Workflow ${project.name}`}
    >
      <span className="project-col project-icon" onClick={(e) => e.stopPropagation()}>
        <CheckBoxComponent
          cssClass="project-item-checkbox"
          checked={isSelected}
          change={(e: CheckBoxChangeEventArgs) => onToggleSelect(project, e.checked as boolean)}
        />
        <span className="project-item-icon-svg">
          <WorkflowFolderIcon className="svg-icon" />
        </span>
      </span>

      <span title={project.name} className="project-col project-title">
        {project.name}
      </span>

      <span className="project-col project-date">
        <TooltipComponent content={formatDate(project.workflowData?.metadata?.created ?? project.lastModified)}>
          <span className="project-date">
            {formatDateForListCell(project.workflowData?.metadata?.created ?? project.lastModified)}
          </span>
        </TooltipComponent>
      </span>

      <span className="project-col project-date">
        <TooltipComponent content={formatDate(project.lastModified)}>
          <span className="project-date">{formatDateForListCell(project.lastModified)}</span>
        </TooltipComponent>
      </span>

      <span className="project-col project-bookmark">
        <ButtonComponent
          cssClass="bookmark-btn e-flat"
          iconCss={`e-icons e-star-filled ${isBookmarked ? 'star-filled' : ''}`}
          onClick={(e) => onBookmarkToggle(project.id, e)}
          title={isBookmarked ? 'Remove from favorites' : 'Add to favorites'}
        />
      </span>

      <span className="project-col project-menu">
        <DropDownButtonComponent
          items={menuItems}
          iconCss="e-icons e-more-vertical-1"
          cssClass="e-caret-hide project-menu-dropdown"
          select={onMenuSelect(project)}
          onClick={(e) => e.stopPropagation()}
          open={() => setMenuOpen(true)}
          close={() => setMenuOpen(false)}
        />
      </span>
    </div>
  );
};

export default ProjectListItem;