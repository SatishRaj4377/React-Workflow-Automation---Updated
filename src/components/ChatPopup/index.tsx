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
  const popupHeightRef = useRef('0px');
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
    const el = popupRef.current;
    if (!el) return;
    // Save current height before collapsing
    if (el.style.height !== '0px' && el.style.height) {
      popupHeightRef.current = el.style.height;
    } else if (!popupHeightRef.current) {
      popupHeightRef.current = `${el.getBoundingClientRect().height || 420}px`;
    }
    el.style.height = '0px';
    setIsMinimized(true);
  };

  const maximize = () => {
    const el = popupRef.current;
    if (!el) return;
    const target = popupHeightRef.current && popupHeightRef.current !== '0px' ? popupHeightRef.current : `${Math.max(420, el.getBoundingClientRect().height || 420)}px`;
    el.style.height = target;
    setIsMinimized(false);
  };

  // Initialize stored height on open
  useEffect(() => {
    if (open && popupRef.current) {
      const h = popupRef.current.style.height || `${popupRef.current.getBoundingClientRect().height || 420}px`;
      popupHeightRef.current = h;
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
  const handleUserInput = (args: any) => {
    const text = (args?.prompt || '').trim();
    if (text.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wf:chat:prompt', {
        detail: { text, at: new Date().toISOString() }
      }));
      // Auto-minimize after sending a message
      minimize();
    }
  };

  // Compute banner template once from current text or default
  const bannerTemplate = renderBannerHtml(customBannerText ?? bannerTemplateText);

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

  // Listen for custom banner updates coming from Chat node configuration panel
  useEffect(() => {
    const onUpdateBanner = (e: Event) => {
      const ce = e as CustomEvent<{ text?: string }>;
      const txt = (ce.detail?.text ?? '').trim();
      setCustomBannerText(txt || null);
    };
    window.addEventListener('wf:chat:update-banner', onUpdateBanner as EventListener);
    return () => window.removeEventListener('wf:chat:update-banner', onUpdateBanner as EventListener);
  }, []);

  // Listen for assistant responses from workflow execution
  useEffect(() => {
    const onAssistantReply = (e: Event) => {
      const ce = e as CustomEvent<{ text?: string; triggeredFrom?: string }>;
      const reply = (ce.detail?.text || '').trim();
      const triggeredFrom = (ce.detail?.triggeredFrom || '').trim();

      if (!reply) return;

      // Auto-maximize when a response arrives
      maximize();

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
