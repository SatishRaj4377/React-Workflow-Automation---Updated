import React, { useRef, useEffect, useState, useMemo } from 'react';
import ReactDOMServer from 'react-dom/server';
import { createPortal } from 'react-dom';
import { Draggable, getRandomId } from '@syncfusion/ej2-base';
import { AIAssistViewComponent } from '@syncfusion/ej2-react-interactive-chat';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ensurePortalRoot } from '../../utilities/variablePickerUtils';
import { IconRegistry } from '../../assets/icons';
import './ChatPopup.css';

interface UpdateBannerDetail {
  text?: string;
}

interface AssistantResponseDetail {
  text?: string;
  triggeredFrom?: string;
}

// Event args contract expected from AIAssistViewComponent when user submits a prompt
interface PromptRequestArgs {
  prompt?: string;
}

// Props type definition for ChatPopup component
type ChatPopupProps = {
  open: boolean;
  onClose: () => void;
  promptSuggestions?: string[];
  bannerTemplateText?: string;
};

// ChatPopup component for AI assistant interaction
export const ChatPopup: React.FC<ChatPopupProps> = ({
  open,
  onClose,
  promptSuggestions,
  bannerTemplateText,
}) => {
  // DOM references
  const popupRef = useRef<HTMLDivElement>(null);
  // Stores last known expanded height so we can restore it after minimizing
  const popupHeightRef = useRef<string>('0px');
  const dragRef = useRef<Draggable | null>(null);
  const aiViewRef = useRef<AIAssistViewComponent>(null);

  // UI state
  const [isMinimized, setIsMinimized] = useState(false);
  const [customBannerText, setCustomBannerText] = useState<string | null>(null);

  // Get message icon from registry
  const MessageIcon = IconRegistry['Message'];

  // Render banner HTML
  const renderBannerHtml = (text?: string | null) =>
    ReactDOMServer.renderToStaticMarkup(
      <div className="banner-content">
        <MessageIcon />
        <span>{(text && text.trim()) || 'Send a message below to trigger the chat workflow'}</span>
      </div>
    );

  // Sync prop-driven banner text
  useEffect(() => {
    setCustomBannerText(bannerTemplateText ?? null);
  }, [bannerTemplateText]);

  // Minimize/maximize helpers to keep state and UI in sync
  const minimize = () => {
    const popupElement = popupRef.current;
    if (!popupElement) return;
    // Save current height before collapsing
    if (popupElement.style.height !== '0px' && popupElement.style.height) {
      popupHeightRef.current = popupElement.style.height;
    } else if (!popupHeightRef.current) {
      popupHeightRef.current = `${popupElement.getBoundingClientRect().height || 420}px`;
    }
    popupElement.style.height = '0px';
    setIsMinimized(true);
  };

  const maximize = () => {
    const popupElement = popupRef.current;
    if (!popupElement) return;
    const target = popupHeightRef.current && popupHeightRef.current !== '0px'
      ? popupHeightRef.current
      : `${Math.max(420, popupElement.getBoundingClientRect().height || 420)}px`;
    popupElement.style.height = target;
    setIsMinimized(false);
  };

  // Initialize stored height on open
  useEffect(() => {
    if (open && popupRef.current) {
      const storedHeight = popupRef.current.style.height || `${popupRef.current.getBoundingClientRect().height || 420}px`;
      popupHeightRef.current = storedHeight;
    }
  }, [open]);

  // Toggle between minimized and maximized states
  const toggleMinimize = () => {
    if (!popupRef.current) return;
    if (isMinimized) {
      maximize();
    } else {
      minimize();
    }
  };

  // Handle user input and dispatch to workflow execution
  const handleUserInput = (args: PromptRequestArgs) => {
    const text = (args?.prompt || '').trim();
    if (text.length > 0 && typeof window !== 'undefined') {
      // Event fired by the chat when the user submits a prompt
      window.dispatchEvent(new CustomEvent('wf:chat:prompt', {
        detail: { text, at: new Date().toISOString() }
      }));
      // Auto-minimize after sending a message
      minimize();
    }
  };

  // Compute banner template once from current text or default
  // Only regenerate the server-rendered banner markup when input text changes
  const bannerTemplate = useMemo(
    () => renderBannerHtml(customBannerText ?? bannerTemplateText),
    [customBannerText, bannerTemplateText]
  );

  // Initialize draggable functionality for chat popup
  useEffect(() => {
    if (!open || !popupRef.current) return;

    const popupElement = popupRef.current;
    dragRef.current = new Draggable(popupElement, {
      clone: false,
      handle: '.chat-popup-header',
      dragArea: '.editor-container'
    });

    return () => {
      // Clean up draggable instance when popup is closed/unmounted
      dragRef.current?.destroy();
      dragRef.current = null;
    };
  }, [open]);

  // Listen for custom banner updates coming from Chat node configuration panel
  useEffect(() => {
    // Listen for banner text updates sent from the Chat node configuration panel
    const onUpdateBanner = (event: Event) => {
      const customEvent = event as CustomEvent<UpdateBannerDetail>;
      const updatedText = (customEvent.detail?.text ?? '').trim();
      setCustomBannerText(updatedText || null);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('wf:chat:update-banner', onUpdateBanner as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('wf:chat:update-banner', onUpdateBanner as EventListener);
      }
    };
  }, []);

  // Listen for assistant responses from workflow execution
  useEffect(() => {
    // Listen for assistant responses published by the workflow runtime and
    // push them into the Syncfusion AIAssistView. Also auto-expand the popup.
    const onAssistantReply = (event: Event) => {
      const customEvent = event as CustomEvent<AssistantResponseDetail>;
      const assistantReplyText = (customEvent.detail?.text || '').trim();
      const triggerSource = (customEvent.detail?.triggeredFrom || '').trim();

      if (!assistantReplyText) return;

      // Auto-maximize when a response arrives so the user can read it
      maximize();

      if (triggerSource) {
        aiViewRef.current?.addPromptResponse({
          prompt: `${triggerSource}${getRandomId()}`,
          response: assistantReplyText
        });
      } else {
        aiViewRef.current?.addPromptResponse(assistantReplyText);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('wf:chat:assistant-response', onAssistantReply as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('wf:chat:assistant-response', onAssistantReply as EventListener);
      }
    };
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
