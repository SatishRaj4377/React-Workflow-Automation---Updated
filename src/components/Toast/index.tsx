import React, { useRef, useEffect } from 'react';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { ToastMessage, ToastType } from '../../types';
import './Toast.css';

const Toast: React.FC = () => {
  const defaultToastRef = useRef<ToastComponent>(null);
  const notificaitonToastRef = useRef<ToastComponent>(null);

  useEffect(() => {
    // Default toast global method
    (window as any).showDefaultToast = (message: ToastMessage) => {
      const inst = defaultToastRef.current;
      if (!inst) { console.warn('DefaultToast component not available'); return; }
      try {
        inst.show({
          title: message.title,
          content: message.content,
          cssClass: `toast-${message.type}`,
          icon: getIconForType(message.type),
          timeOut: message.duration || getDefaultDuration(message.type),
          position: { X: 'Right', Y: 'Bottom' },
          animation: {
            show: { effect: 'SlideRightIn', duration: 400, easing: 'ease' },
            hide: { effect: 'SlideRightOut', duration: 300, easing: 'ease' }
          }
        });
      } catch (e) { console.warn('Failed to show default toast', e); }
    };

    // Modern toast global method
    (window as any).showNotificationToast = (message: ToastMessage) => {
      const inst = notificaitonToastRef.current;
      if (!inst) { console.warn('Notification toast component not available'); return; }
      try {
        inst.show({
          title: '',
          content: renderNotificationContent(message),
          cssClass: `toast-notification toast-${message.type}`,
          icon: '',
          timeOut: message.duration || 4000,
          position: { X: 'Center', Y: 'Top' },
          animation: {
            show: { effect: 'SlideTopIn', duration: 300, easing: 'ease' },
            hide: { effect: 'FadeOut', duration: 200, easing: 'ease' }
          }
        });
      } catch (e) { console.warn('Failed to show notification toast', e); }
    };

    return () => {
      delete (window as any).showDefaultToast;
      delete (window as any).showNotificationToast;
    };
  }, []);

  const renderNotificationContent = (message: ToastMessage) => {
    const container = document.createElement('div');
    container.className = 'toast-notification-body';

    const textWrap = document.createElement('div');
    textWrap.className = 'toast-notification-text';

    const titleEl = document.createElement('div');
    titleEl.className = 'toast-notification-title';
    titleEl.textContent = message.title;

    const contentEl = document.createElement('div');
    contentEl.className = 'toast-notification-content';
    contentEl.textContent = message.content;

    textWrap.appendChild(titleEl);
    textWrap.appendChild(contentEl);

    container.appendChild(textWrap);
    return container;
  };

  const getIconForType = (type: ToastType): string => {
    switch (type) {
      case 'success': return 'e-success toast-icons';
      case 'error': return 'e-error toast-icons';
      case 'warning': return 'e-warning toast-icons';
      case 'info': return 'e-info toast-icons';
      default: return 'e-info toast-icons';
    }
  };

  const getDefaultDuration = (type: ToastType): number => {
    switch (type) {
      case 'success': return 3000;
      case 'error': return 5000;
      case 'warning': return 4000;
      case 'info': return 3000;
      default: return 3000;
    }
  };

  return (
    <>
      {/* Default Toast Instance */}
      <ToastComponent
        ref={defaultToastRef}
        id="workflow-toast"
        position={{ X: 'Right', Y: 'Bottom' }}
        showCloseButton={true}
        newestOnTop={true}
        showProgressBar={true}
      />

      {/* Notification Style Toast Instance */}
      <ToastComponent
        ref={notificaitonToastRef}
        id="workflow-toast"
        position={{ X: 'Center', Y: 'Top' }}
        showProgressBar={true}
      />
    </>
  );
};

// Utility functions for showing toasts globally
export const showToast = (message: ToastMessage) => {
  if (message.variant === 'notification') {
    if ((window as any).showNotificationToast) {
      (window as any).showNotificationToast(message);
    } else {
      console.warn('Notification toast component not initialized');
    }
  } else {
    if ((window as any).showDefaultToast) {
      (window as any).showDefaultToast(message);
    } else {
      console.warn('DefaultToast component not initialized');
    }
  }
};

export const showSuccessToast = (title: string, content: string) => {
  showToast({ id: `success-${Date.now()}`, title, content, type: 'success' });
};

export const showErrorToast = (title: string, content: string) => {
  showToast({ id: `error-${Date.now()}`, title, content, type: 'error' });
};

export const showInfoToast = (title: string, content: string) => {
  showToast({ id: `info-${Date.now()}`, title, content, type: 'info' });
};

export const showWarningToast = (title: string, content: string) => {
  showToast({ id: `warning-${Date.now()}`, title, content, type: 'warning' });
};

export default Toast;