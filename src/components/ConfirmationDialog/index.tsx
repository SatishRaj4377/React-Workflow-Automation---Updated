import React from 'react';
import { DialogComponent, ButtonPropsModel } from '@syncfusion/ej2-react-popups';
import './ConfirmationDialog.css';

// Props interface for ConfirmationDialog component
interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  content: string;
  onDismiss?: () => void;
  buttonContent?: {
    primary: string;
    secondary: string;
  };
  title?: string;
  variant?: 'danger' | 'primary';
}

// Confirmation dialog component for user actions
const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  content,
  onDismiss,
  buttonContent = {
    primary: 'Delete',
    secondary: 'Cancel'
  },
  title = "Are you sure?",
  variant = 'danger'
}) => {
  // Configure dialog action buttons with cancel and confirm actions
  const dialogButtons: ButtonPropsModel[] = [
    {
      click: onClose,
      buttonModel: {
        content: buttonContent.secondary,
        cssClass: 'cancel-btn',
      },
    },
    {
      click: onConfirm,
      buttonModel: {
        content: buttonContent.primary,
        cssClass: `confirm-btn ${variant === 'danger' ? 'danger-btn' : 'primary-btn'}`,
        isPrimary: true,
      },
    },
  ];

  // Handle dismiss event by calling onDismiss callback or falling back to onClose
  const handleDismiss = () => {
    if (onDismiss) onDismiss();
    else onClose();
  };

  return (
    <DialogComponent
      id="delete-confirmation-dialog"
      header={title}
      visible={isOpen}
      showCloseIcon={true}
      close={handleDismiss}
      overlayClick={handleDismiss}
      buttons={dialogButtons}
      width="400px"
      target={document.body}
      isModal={true}
      cssClass="confirm-dialog-container"
      animationSettings={{ effect: 'None' }}
    >
      {/* Dialog content message */}
      <div className="delete-dialog-content">
        <p>{content}</p>
      </div>
    </DialogComponent>
  );
};

export default ConfirmationDialog;