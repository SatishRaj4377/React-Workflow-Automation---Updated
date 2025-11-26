import { NodeModel } from '@syncfusion/ej2-diagrams';
import { BaseNodeExecutor } from './BaseExecutors';
import { ExecutionContext, NodeExecutionResult } from '../types';

import { getServerExecutedNodes } from '../constants/nodeRegistry';

export class ServerNodeExecutor extends BaseNodeExecutor {
  constructor(private serverBaseUrl: string = 'http://localhost:3001') {
    super();
  }

  protected getSupportedNodeTypes(): string[] {
    return getServerExecutedNodes();
  }

  async executeNode(node: NodeModel, context: ExecutionContext): Promise<NodeExecutionResult> {
    const nodeConfig = this.getNodeConfig(node);
    if (!nodeConfig) {
      return { success: false, error: 'Invalid node configuration' };
    }

    if (nodeConfig.nodeType === 'Webhook') {
      return this.executeWebhookNode(node, context);
    }

    // For other server-side nodes, make API call to specific endpoints
    try {
      const endpoint = this.getEndpointForNodeType(nodeConfig.nodeType);
      const response = await fetch(`${this.serverBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeConfig, context }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Server execution failed');
      }

      // Store result and enrich with node-specific processing
      const processedResult = await this.processNodeResult(nodeConfig.nodeType, result.data);
      this.updateExecutionContext(node, context, processedResult);
      return { success: true, data: processedResult };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown server error',
      };
    }
  }

  private getEndpointForNodeType(nodeType: string): string {
    switch (nodeType) {
      case 'Gmail':
        return '/execute-node/gmail';
      case 'Google Sheets':
        return '/execute-node/gsheets';
      case 'Google Calendar':
        return '/execute-node/gcalendar';
      case 'Telegram':
        return '/execute-node/telegram';
      case 'Twilio':
        return '/execute-node/twilio';
      case 'Google Docs':
        return '/execute-node/gdocs';
      default:
        throw new Error(`No endpoint configured for node type: ${nodeType}`);
    }
  }

  private executeWebhookNode(node: NodeModel, context: ExecutionContext): Promise<NodeExecutionResult> {
    return new Promise((resolve, reject) => {
      if (!node.id) {
        reject({ success: false, error: 'Node ID is required for webhook execution' });
        return;
      }

      const ws = new WebSocket('ws://localhost:3001');
      
      const cleanup = () => {
        ws.close();
      };

      ws.onopen = () => {
        console.log(`Registering webhook for node ${node.id}`);
        ws.send(JSON.stringify({ event: 'register-webhook', workflowId: node.id }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.event === 'webhook-triggered' && message.nodeId === node.id) {
          this.updateExecutionContext(node, context, message.data);
          cleanup();
          resolve({ success: true, data: message.data });
        }
      };

      ws.onerror = (error) => {
        cleanup();
        reject({ success: false, error: 'WebSocket connection failed' });
      };
    });
  }

  private async processNodeResult(nodeType: string, data: any): Promise<any> {
    // Process and transform data based on node type
    switch (nodeType) {
      case 'Gmail':
        return this.processGmailResult(data);
      case 'Google Sheets':
        return this.processGoogleSheetsResult(data);
      case 'Google Calendar':
        return this.processGoogleCalendarResult(data);
      case 'Telegram':
        return this.processTelegramResult(data);
      default:
        return data;
    }
  }

  private processGmailResult(data: any): any {
    // Transform Gmail API response to a more usable format
    return {
      ...data,
      messages: data.messages?.map((msg: any) => ({
        id: msg.id,
        threadId: msg.threadId,
        subject: msg.subject || '(no subject)',
        from: msg.from,
        date: new Date(msg.date),
        snippet: msg.snippet,
        hasAttachments: !!msg.attachments?.length,
      })) || [],
    };
  }

  private processGoogleSheetsResult(data: any): any {
    // Transform Sheets API response
    return {
      ...data,
      rows: data.values || [],
      totalRows: data.values?.length || 0,
      headers: data.values?.[0] || [],
    };
  }

  private processGoogleCalendarResult(data: any): any {
    // Transform Calendar API response
    return {
      ...data,
      events: data.items?.map((event: any) => ({
        id: event.id,
        title: event.summary,
        start: new Date(event.start.dateTime || event.start.date),
        end: new Date(event.end.dateTime || event.end.date),
        location: event.location,
        description: event.description,
      })) || [],
    };
  }

  private processTelegramResult(data: any): any {
    // Transform Telegram API response
    return {
      ...data,
      message: {
        id: data.message_id,
        text: data.text,
        chat: data.chat,
        date: new Date(data.date * 1000),
      },
    };
  }
}