import React, { useRef, useEffect, useState } from 'react';
import ReactDOMServer from 'react-dom/server';
import { createPortal } from 'react-dom';
import { Draggable, getRandomId } from '@syncfusion/ej2-base';
import { AIAssistViewComponent } from '@syncfusion/ej2-react-interactive-chat';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ensurePortalRoot } from '../../utilities/variablePickerUtils';
import { IconRegistry } from '../../assets/icons';
import './ChatPopup.css';

// Props type definition for ChatPopup component
type ChatPopupProps = {
  open: boolean;
  onClose: () => void;
  promptSuggestions?: string[];
};

// ChatPopup component for AI assistant interaction
export const ChatPopup: React.FC<ChatPopupProps> = ({
  open,
  onClose,
  promptSuggestions,
}) => {
  // DOM references
  const popupRef = useRef<HTMLDivElement>(null);
  const popupHeightRef = useRef('0px');
  const dragRef = useRef<Draggable | null>(null);
  const aiViewRef = useRef<AIAssistViewComponent>(null);

  // UI state
  const [isMinimized, setIsMinimized] = useState(false);

  // Get message icon from registry
  const MessageIcon = IconRegistry['Message'];

  // Toggle between minimized and maximized states
  const toggleMinimize = () => {
    if (!popupRef.current) return;

    if (popupRef.current.style.height === '0px') {
      popupRef.current.style.height = popupHeightRef.current;
      setIsMinimized(false);
    } else {
      popupHeightRef.current = popupRef.current.style.height;
      popupRef.current.style.height = '0px';
      setIsMinimized(true);
    }
  };

  // Handle user input and dispatch to workflow execution
  const handleUserInput = (args: any) => {
    const text = (args?.prompt || '').trim();
    
    if (text.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wf:chat:prompt', {
        detail: { text, at: new Date().toISOString() }
      }));
    }
  };

  // Render banner template with icon and instruction text
  const bannerTemplate = ReactDOMServer.renderToStaticMarkup(
    <div className="banner-content">
      <MessageIcon />
      <span>Send a message below to trigger the chat workflow</span>
    </div>
  );

  // Initialize draggable functionality for chat popup
  useEffect(() => {
    if (!open || !popupRef.current) return;

    const el = popupRef.current;
    dragRef.current = new Draggable(el, {
      clone: false,
      handle: '.chat-popup-header',
      dragArea: '.editor-container'
    });

    return () => {
      (dragRef.current as any)?.destroy?.();
      dragRef.current = null;
    };
  }, [open]);

  // Listen for assistant responses from workflow execution
  useEffect(() => {
    const onAssistantReply = (e: Event) => {
      const ce = e as CustomEvent<{ text?: string; triggeredFrom?: string }>;
      const reply = (ce.detail?.text || '').trim();
      const triggeredFrom = (ce.detail?.triggeredFrom || '').trim();

      if (!reply) return;

      if (triggeredFrom) {
        aiViewRef.current?.addPromptResponse({
          prompt: `${triggeredFrom}${getRandomId()}`,
          response: reply
        });
      } else {
        aiViewRef.current?.addPromptResponse(reply);
      }
    };

    window.addEventListener('wf:chat:assistant-response', onAssistantReply as EventListener);

    return () => window.removeEventListener('wf:chat:assistant-response', onAssistantReply as EventListener);
  }, []);

  // Hide popup when closed
  if (!open) return null;

  return createPortal(
    <div ref={popupRef} className="chat-popup">
      {/* Header with title and action buttons */}
      <div className="chat-popup-header">
        <div className="chat-popup-title">Chat</div>
        <div className="chat-popup-btn-group">
          {/* Minimize/Maximize button */}
          <ButtonComponent
            className="chat-popup-btn"
            title={isMinimized ? 'Maximize' : 'Minimize'}
            iconCss={isMinimized ? 'e-icons e-expand' : 'e-icons e-collapse-2'}
            onClick={toggleMinimize}
          />
          {/* Close button */}
          <ButtonComponent
            className="chat-popup-btn"
            title="Close"
            iconCss="e-icons e-close"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Chat interaction area */}
      <div className="chat-popup-body">
        <AIAssistViewComponent
          id="workflow-chat"
          ref={aiViewRef}
          bannerTemplate={bannerTemplate}
          promptPlaceholder="Type a message..."
          promptRequest={handleUserInput}
          promptIconCss="e-icons e-user"
          promptSuggestions={promptSuggestions}
        />
      </div>
    </div>,
    ensurePortalRoot()
  );
};
