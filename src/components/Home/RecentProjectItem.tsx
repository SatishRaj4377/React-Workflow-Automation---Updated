import React, { useState } from 'react';
import { DropDownButtonComponent, MenuEventArgs } from '@syncfusion/ej2-react-splitbuttons';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { TooltipComponent } from '@syncfusion/ej2-react-popups';
import { ProjectData } from '../../types';
import { IconRegistry } from '../../assets/icons';

interface RecentProjectItemProps {
  project: ProjectData;
  index: number;
  isBookmarked: boolean;
  getProjectKey: (project: ProjectData, index: number, prefix?: string) => string;
  onOpenProject: (project: ProjectData) => void;
  onBookmarkToggle: (projectId: string, e: React.MouseEvent) => void;
  onMenuSelect: (project: ProjectData) => (args: MenuEventArgs) => void;
  menuItems: { text: string; iconCss: string }[];
  formatDate: (date: Date) => string;
  formatDateForListCell: (date: Date | string) => string;
}

const RecentProjectItem: React.FC<RecentProjectItemProps> = ({
  project,
  index,
  isBookmarked,
  getProjectKey,
  onOpenProject,
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
      key={getProjectKey(project, index, 'recent-')}
      className={`project-list-item ${menuOpen ? 'menu-open' : ''}`}
      onClick={() => onOpenProject(project)}
      tabIndex={0}
      aria-label={`Recent workflow ${project.name}`}
    >
      <span className="project-col project-icon">
        <WorkflowFolderIcon className="svg-icon" />
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
        <TooltipComponent content={isBookmarked ? 'Remove from favorites' : 'Add to favorites'}>
          <ButtonComponent
            cssClass="bookmark-btn e-flat"
            iconCss={`e-icons e-star-filled ${isBookmarked ? 'star-filled' : ''}`}
            onClick={(e) => onBookmarkToggle(project.id, e)}
          />
        </TooltipComponent>
      </span>

      <span className="project-col project-menu">
        <DropDownButtonComponent
          items={menuItems}
          iconCss="e-icons e-more-vertical-1 e-flat"
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

export default RecentProjectItem;