import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import { lobbyHandler } from '../../lobby/lobby';
import  { broadcastToAll } from '../../utils/broadcast'


export const handleStartMove = async (
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer,
    time: number,
    maxTime : number
) => {
    const { Data } = message;

    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);
    var lobbyId = lobbyResult?.getLobbyId();

    const response: WSMessage = {
        Type: MessageType.GAME_MOVE,
        Data: {
            UserId: ws.userId,
            UserName: Data.UserName,
            LobbyId: lobbyId,
            MoveState : true,
            Time: time,
            MaxTime: maxTime,
        },
    };

    var jsonResponse = JSON.stringify(response);
    ws.send(jsonResponse);

    const broadcastMessage: WSMessage = {
        Type: MessageType.GAME_MOVE,
        Data: {
            UserId: "",
            UserName: Data.UserName,
            LobbyId: lobbyId,
            MoveState : false,
            Time: time,
            MaxTime: maxTime,
        },
    };

    broadcastToAll(wss, broadcastMessage, ws, lobbyId);
};