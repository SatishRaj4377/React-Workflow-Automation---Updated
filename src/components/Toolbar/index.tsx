import React, { useEffect } from 'react';
import { ToolbarComponent, ItemsDirective, ItemDirective, OverflowOption } from '@syncfusion/ej2-react-navigations';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { ToolbarAction } from '../../types';
import { Tooltip } from '@syncfusion/ej2-react-popups';
import './Toolbar.css';

interface ToolbarProps {
  onAction:(action: ToolbarAction) => void;
  isExecuting: boolean;
  isPanActive: boolean;
}

const Toolbar: React.FC<ToolbarProps> = ({
  onAction,
  isExecuting = false,
  isPanActive,
}) => {
  // Template for execute button
  const executeButtonTemplate = () => {
    return (
      <ButtonComponent
        cssClass={isExecuting ? 'cancel-btn' : 'execute-btn'}
        iconCss={isExecuting ? 'e-icons e-stop-rectangle' : 'e-icons e-play'}
        content={isExecuting ? 'Cancel' : 'Execute'}
        onClick={() => onAction(isExecuting ? 'cancel' : 'execute')}
        isPrimary={!isExecuting}
      />
    );
  };

  const toolbarItems = [
    {
      prefixIcon: 'e-icons e-plus',
      tooltipText: 'Add Nodes',
      id: 'add-nodes',
      click: () => onAction('addNode'),
      overflow: 'Show',
    },
    {
      type: 'Separator',
    },
    {
      prefixIcon: 'e-icons e-add-notes',
      tooltipText: 'Add Sticky Note',
      id: 'add-sticky',
      click: () => onAction('addSticky'),
      overflow: 'Show',
    },
    {
      type: 'Separator',
    },
    {
      prefixIcon: 'e-icons e-ai-chat',
      tooltipText: 'Auto Align Nodes',
      id: 'auto-align-tool',
      click: () => onAction('autoAlign'),
      overflow: 'Show',
    },
    {
      type: 'Separator',
    },
    {
        prefixIcon: 'e-icons e-pan',
        tooltipText: 'Pan',
        id: 'pan-tool',
        click: () => onAction('togglePan'),
        cssClass: isPanActive ? 'e-active' : '',
    },
    {
      type: 'Separator',
    },
    {
      prefixIcon: 'e-icons e-circle-add',
      tooltipText: 'Zoom In',
      id: 'zoom-in',
      click: () => onAction('zoomIn'),
    },
    {
      prefixIcon: 'e-icons e-circle-remove',
      tooltipText: 'Zoom Out',
      id: 'zoom-out',
      click: () => onAction('zoomOut'),
    },
    {
      prefixIcon: 'e-icons e-refresh',
      tooltipText: 'Reset Zoom',
      id: 'reset-zoom',
      click: () => onAction('resetZoom'),
    },
    {
      prefixIcon: 'e-icons e-bring-to-center',
      tooltipText: 'Fit to Page',
      id: 'fit-page',
      click: () => onAction('fitToPage'),
    },
    {
      type: 'Separator'
    },
    {
      template: executeButtonTemplate,
      tooltipText: isExecuting ? 'Cancel Execution' : 'Execute Workflow',
      id: isExecuting ? 'cancel' : 'execute',
      overflow: "Show"
    }

  ];

  // Show tooltip with keyboard shortucts
  useEffect(() => {
    const tooltip = new Tooltip({
      target: '#workflow-toolbar [title]',
      enableHtmlParse: true,
      position: 'BottomCenter',
      beforeRender: (args) => {
        const title = args.target.getAttribute('title');

        if (!title) return;
        
        // Set custom HTML tooltip content
        const shortcutMap: any = {
          'Add Nodes': 'Open Node Palette <kbd>Tab</kbd>',
          'Add Sticky Note': 'Add Sticky Note <kbd>Shift</kbd> <kbd>S</kbd>',
          'Pan': 'Pan <kbd>Space</kbd>',
          'Auto Align Nodes': 'Auto Align Nodes <kbd>Shift</kbd> <kbd>A</kbd>',
          'Zoom In': 'Zoom In <kbd>Ctrl</kbd> <kbd>+</kbd>',
          'Zoom Out': 'Zoom Out <kbd>Ctrl</kbd> <kbd>-</kbd>',
          'Reset Zoom': 'Reset Zoom <kbd>Ctrl</kbd> <kbd>0</kbd>',
          'Fit to Page': 'Fit to Page <kbd>Ctrl</kbd> <kbd>1</kbd>',
          'Execute Workflow': 'Execute <kbd>Ctrl</kbd> <kbd>Enter</kbd>',
          'Cancel Execution': 'Cancel <kbd>Ctrl</kbd> <kbd>Enter</kbd>',
        };
        
        const content = shortcutMap[title];
        if (content) {
          // Remove native tooltip
          args.target.removeAttribute('title');
          // Set custom HTML tooltip content
          args.target.setAttribute('data-content', content);
        }
      }
    });
    tooltip.appendTo('.workflow-toolbar-container');
    return () => {
      tooltip.destroy();
    };
  }, []);

  return (
    <div className="workflow-toolbar-container">
      <ToolbarComponent
        id="workflow-toolbar"
        cssClass="custom-toolbar"
        height="48px"
        overflowMode="Popup"
      >
        <ItemsDirective>
          {toolbarItems.map((item, index) => (
            <ItemDirective
              key={index}
              prefixIcon={item.prefixIcon}
              text={(item as any).text}
              tooltipText={item.tooltipText}
              id={item.id}
              type={item.type as any}
              click={item.click}
              overflow={item.overflow as OverflowOption}
              cssClass={(item as any).cssClass}
              template={item.template}
            />
          ))}
        </ItemsDirective>
      </ToolbarComponent>
    </div>
  );
};

export default Toolbar;
