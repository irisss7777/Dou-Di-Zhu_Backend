import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import  { getConnectedUsersCount, broadcastToAll } from '../../utils/broadcast'
import { lobbyHandler } from '../../lobby/lobby';

export const handleEmotionUse = async(
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer
) => {
    const { Data } = message;

    logger.info('Emotions',
        {
            userId: ws.userId,
        });
    
    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);
    var lobbyId = lobbyResult?.getLobbyId();

    const response: WSMessage = {
        Type: MessageType.EMOTION_USE,
        Data: {
            Emotion: Data.Emotion,
            TargetPosition: Data.TargetPosition,
            UseName: Data.UseName,
            TargetName: Data.TargetName,
        },
    };

    var jsonResponse = JSON.stringify(response);
    ws.send(jsonResponse);
    
    const broadcastMessage: WSMessage = {
        Type: MessageType.EMOTION_USE,
        Data: {
            Emotion: Data.Emotion,
            TargetPosition: Data.TargetPosition,
            UseName: Data.UseName,
            TargetName: Data.TargetName,
        },
    };

    broadcastToAll(wss, broadcastMessage, ws, lobbyId);
}