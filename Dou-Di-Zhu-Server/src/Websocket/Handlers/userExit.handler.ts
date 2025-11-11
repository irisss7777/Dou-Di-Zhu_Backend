import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import  { getConnectedUsersCount, broadcastToAll } from '../../utils/broadcast'
import { lobbyHandler } from '../../lobby/lobby';

export const handleUserLeave = async(
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer
) => {
    const { Data } = message;
    
    logger.info('WebSocket connection closed',
        {
            userId: ws.userId,
        });

    const lobbyResult= await lobbyHandler.disconnectPlayer(ws.userId);
    
    if(lobbyResult.lobbyId !+ undefined){
        const broadcastMessage: WSMessage = {
            Type: MessageType.USER_LEAVE,
            Data: {
                UserId: ws.userId,
                UserName: ws.userName,
                LobbyPlayers: lobbyResult.lobby?.getPlayerCount() || 0,
                MaxLobbyPlayers: lobbyResult.lobby?.getMaxPlayers() || 4
            },
        };

        broadcastToAll(wss, broadcastMessage, ws, lobbyResult.lobbyId);
    }
}