import { CustomWebSocket, WSMessage } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import { broadcastToAll } from '../../utils/broadcast';

export const handleGameState = (
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer
) => {
    logger.debug('Game state updated', {
        userId: ws.userId,
        gameState: message.Data
    });

    broadcastToAll(wss, message);
};