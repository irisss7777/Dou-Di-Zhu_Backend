import { WebSocketServer, WebSocket } from 'ws';
import { CustomWebSocket, MessageType, WSMessage } from './webtypes';
import { handleWebSocketMessage } from './Handlers/_Index';
import  { getConnectedUsersCount } from '../utils/broadcast'
import { logger } from '../utils/logger';
import { IncomingMessage } from 'http';
import { lobbyHandler } from '../lobby/lobby';

export class WebSocketService
{
    private wss: WebSocketServer;

    constructor(server: any)
    {
        this.wss = new WebSocketServer(
        {
                server,
                path: '/ws'
        });

        this.setupEventHandlers();

        logger.info('WebSocket server started');
    }

    private setupEventHandlers()
    {
        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => 
        {
            this.handleConnection(ws as CustomWebSocket, req);
        });

        this.wss.on('error', (error) => 
        {
            logger.error('WebSocket server error', { error });
        });
    }

    private handleConnection(ws: CustomWebSocket, req: IncomingMessage)
    {
        ws.isAlive = true;
        ws.userId = this.generateUserId();

        const ip = req.socket.remoteAddress;
        logger.info('New WebSocket connection',
        {
            userId: ws.userId,
            ip
        });

        ws.on('message', (data: Buffer) => 
        {
            this.handleMessage(ws, data);
        });

        ws.on('close', (code, reason) => 
        {
            this.handleClose(ws, code, reason);
        });

        ws.on('error', (error) => 
        {
            this.handleError(ws, error);
        });
    }

    private handleMessage(ws: CustomWebSocket, data: Buffer)
    {
        try
        {
            const message: WSMessage = JSON.parse(data.toString());

            if (!message.Type || !message.Data) {
                throw new Error('Invalid message structure');
            }

            handleWebSocketMessage(ws, message, this.wss);

        }
        catch (error) 
        {
            logger.error('Message WebSocket error - Invalid message format');
        }
    }

    private handleClose(ws: CustomWebSocket, code: number, reason: Buffer)
    {
        const message : WSMessage = {
            Type: MessageType.USER_LEAVE,
            Data: {
                Message: "Player leave"
            }
        }

        handleWebSocketMessage(ws, message, this.wss);
    }

    private handleError(ws: CustomWebSocket, error: Error)
    {
        logger.error('WebSocket ошибка',
            {
                userId: ws.userId,
                error: error.message
            });
    }

    private Disconnect()
    {
        const interval = setInterval(() =>
        {
            this.wss.clients.forEach((ws) =>
            {
                const customWs = ws as CustomWebSocket;

                if (!customWs.isAlive)
                {
                    logger.debug('Соединение разорвано по таймауту',
                        {
                            userId: customWs.userId
                        });
                    return ws.terminate();
                }

                customWs.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () =>
        {
            clearInterval(interval);
        });
    }

    private generateUserId(): string
    {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    public broadcast(message: WSMessage, excludeWs?: CustomWebSocket)
    {
        const data = JSON.stringify(message);

        this.wss.clients.forEach((client) =>
        {
            if (client.readyState === WebSocket.OPEN)
            {
                if (!excludeWs || client !== excludeWs)
                {
                    client.send(data);
                }
            }
        });
    }

    public getConnectedCount(): number
    {
        return getConnectedUsersCount(this.wss);
    }

    public getClientCount(): number
    {
        return this.wss.clients.size;
    }
}