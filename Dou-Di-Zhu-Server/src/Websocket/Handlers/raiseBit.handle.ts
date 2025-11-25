import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import { lobbyHandler } from '../../lobby/lobby';
import  { broadcastToAll } from '../../utils/broadcast'


export const handleRaiseBit = async (
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer,
    time: number,
    maxTime : number,
    currentBit : number
) => {
    const { Data } = message;

    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);
    var lobbyId = lobbyResult?.getLobbyId();

    const response: WSMessage = {
        Type: MessageType.RAISE_BIT,
        Data: {
            UserId: ws.userId,
            UserName: Data.UserName,
            LobbyId: lobbyId,
            Time: time,
            MaxTime: maxTime,
            CurrentBit: currentBit,
            RaiseActive: true,
        },
    };

    var jsonResponse = JSON.stringify(response);
    ws.send(jsonResponse);

    const broadcastMessage: WSMessage = {
        Type: MessageType.RAISE_BIT,
        Data: {
            UserId: "",
            UserName: Data.UserName,
            LobbyId: lobbyId,
            Time: time,
            MaxTime: maxTime,
            CurrentBit: currentBit,
            RaiseActive: false,
        },
    };

    broadcastToAll(wss, broadcastMessage, ws, lobbyId);
};