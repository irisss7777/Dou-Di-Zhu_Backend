import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import  { getConnectedUsersCount, broadcastToAll } from '../../utils/broadcast'
import { lobbyHandler } from '../../lobby/lobby';

export const handleUserPass = async(
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer
) => {
    const { Data } = message;

    if(ws.socketIsBlocked)
        return;

    logger.info('User pass',
        {
            userId: ws.userId,
        });

    lobbyHandler.userPass(ws.userId);
    
    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);
    var lobbyId = lobbyResult?.getLobbyId();

    const response: WSMessage = {
        Type: MessageType.PLAYER_PASS,
        Data: {
            UserId: "",
            UserName: ws.userName,
            LobbyId: lobbyId,
        },
    };

    var jsonResponse = JSON.stringify(response);
    ws.send(jsonResponse);

    const broadcastMessage: WSMessage = {
        Type: MessageType.PLAYER_PASS,
        Data: {
            UserId: "",
            UserName: ws.userName,
            LobbyId: lobbyId,
        },
    };

    broadcastToAll(wss, broadcastMessage, ws, lobbyId);
}