import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import  { getConnectedUsersCount, broadcastToAll } from '../../utils/broadcast'
import { lobbyHandler } from '../../lobby/lobby';

export const handleBitIsRaised = async(
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer
) => {
    const { Data } = message;

    logger.info('Bit raise',
        {
            userId: ws.userId,
        });

    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);

    lobbyResult?.raiseBit(ws.userId);
    
}