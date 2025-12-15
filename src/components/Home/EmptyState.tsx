import React from 'react';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { IconRegistry } from '../../assets/icons';

interface EmptyStateProps {
  type: 'search' | 'empty';
  onCreateNew?: () => void;
}
/** This component handles the UI when:
    - No workflows exist.
    - No workflows match the search term.
*/
const EmptyState: React.FC<EmptyStateProps> = ({ type, onCreateNew }) => {
  const WorkflowLogoIcon = IconRegistry['WorkflowLogo'];
  const WorkflowFolderSearchIcon = IconRegistry['WorkflowFolderSearch'];

  if (type === 'search') {
    return (
      <div className="empty-state animate-fade-in-up">
        <div className="empty-icon">
          <WorkflowFolderSearchIcon className="svg-icon search-folder" />
        </div>
        <h3>No workflows found</h3>
        <p>No workflows match your search.</p>
      </div>
    );
  }

  return (
    <div className="empty-state animate-fade-in-up">
      <div className="empty-icon">
        <WorkflowLogoIcon className="svg-icon" />
      </div>
      <h3>No workflows yet</h3>
      <p>Create your first workflow to get started and unlock the power of automation</p>
      {onCreateNew && (
        <ButtonComponent
          onClick={onCreateNew}
          cssClass="action-btn e-primary"
          iconCss="e-icons e-plus"
        >
          Create New Workflow
        </ButtonComponent>
      )}
    </div>
  );
};

export default EmptyState;