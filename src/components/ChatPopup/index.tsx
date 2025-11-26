import React, { useRef, useEffect, useState } from 'react';
import ReactDOMServer from 'react-dom/server';
import { createPortal } from 'react-dom';
import { Draggable, getRandomId } from '@syncfusion/ej2-base';
import { AIAssistViewComponent  } from '@syncfusion/ej2-react-interactive-chat';
import { ensurePortalRoot } from '../../helper/variablePickerUtils';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { IconRegistry } from '../../assets/icons';
import './ChatPopup.css';

type ChatPopupProps = {
  open: boolean;
  onClose: () => void;
  promptSuggestions?: string[];
};

export const ChatPopup: React.FC<ChatPopupProps> = ({
  open,
  onClose,
  promptSuggestions,
}) => {
  const popupRef = useRef<HTMLDivElement>(null);
  const popupHeightRef = useRef('0px');
  const dragRef = useRef<Draggable | null>(null);
  const aiViewRef = useRef<AIAssistViewComponent>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  
  const MessageIcon = IconRegistry['Message'];
  
  const toggleMinimize = () => {
    if (!popupRef.current) return;
    if (popupRef.current.style.height === '0px'){
      popupRef.current.style.height = popupHeightRef.current; // Restore height
      setIsMinimized(false);
    } else {
      popupHeightRef.current = popupRef.current.style.height;
      popupRef.current.style.height = '0px'; // Minimize
      setIsMinimized(true);
    }
  };

  const handleUserInput = (args: any) => {
    const text = (args?.prompt || '').trim();
    if (text.length > 0 && typeof window !== 'undefined') {
      // Let the Editor decide whether to auto-start the workflow.
      window.dispatchEvent(new CustomEvent('wf:chat:prompt', {
        detail: { text, at: new Date().toISOString() }
      }));
    }
  }

  // Chat Banner Template
  const bannerTemplate = ReactDOMServer.renderToStaticMarkup(
    <div className="banner-content">
      <MessageIcon />
      <span>Send a message below to trigger the chat workflow</span>
    </div>
  );

  // Make the chat popup draggable by header
  useEffect(() => {
    if (!open || !popupRef.current) return;
    const el = popupRef.current;
    dragRef.current = new Draggable(el, {
      clone: false,
      handle: '.chat-popup-header', // drag only from header
      dragArea: '.editor-container'
    });
    return () => {
      (dragRef.current as any)?.destroy?.();
      dragRef.current = null;
    };
  }, [open]);

  // Update the response in the chat received from execution
  useEffect(() => {
    const onAssistantReply = (e: Event) => {
      const ce = e as CustomEvent<{ text?: string, triggeredFrom?: string}>;
      const reply = (ce.detail?.text || '').trim();
      const triggeredFrom = (ce.detail?.triggeredFrom || '').trim();
      if (!reply) return;
      if (triggeredFrom){
        aiViewRef.current?.addPromptResponse({prompt: `${triggeredFrom}${getRandomId()}`, response: reply }); 
      }else{
        aiViewRef.current?.addPromptResponse(reply); 
      }
    };
    window.addEventListener('wf:chat:assistant-response', onAssistantReply as EventListener);
    return () => window.removeEventListener('wf:chat:assistant-response', onAssistantReply as EventListener);
  }, []);
  
  if (!open) return null;

  return createPortal(
    <div
      ref={popupRef}
      className="chat-popup"
    >
      {/* Header */}
      <div className="chat-popup-header" >
        <div className="chat-popup-title">Chat</div>
        <div className='chat-popup-btn-group'>
          <ButtonComponent
            className="chat-popup-btn"
            title={isMinimized ? 'Maximize' : 'Minimize'}
            iconCss={isMinimized ? 'e-icons e-expand' : 'e-icons e-collapse-2'}
            onClick={toggleMinimize}
          />
          <ButtonComponent
            className="chat-popup-btn"
            title='Close'
            iconCss='e-icons e-close'
            onClick={onClose}
          />
        </div>
      </div>

      {/* Body */}
      <div className="chat-popup-body">
        <AIAssistViewComponent
          id="workflow-chat"
          ref={aiViewRef}
          bannerTemplate={bannerTemplate}
          promptPlaceholder='Type a message...'
          promptRequest={handleUserInput}
          promptIconCss='e-icons e-user'
          promptSuggestions={promptSuggestions}
        />
      </div>
    </div>,
    ensurePortalRoot()
  );
};
