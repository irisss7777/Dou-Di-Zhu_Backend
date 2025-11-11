import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import { lobbyHandler } from '../../lobby/lobby';
import  { broadcastToAll } from '../../utils/broadcast'
import { Card } from "../../cards/cardSystem";


export const handleCanUseCard = async (
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer,
) => {
    const {Data} = message;

    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);
    var lobbyId = lobbyResult?.getLobbyId();

    var can: boolean = false;
    
    if (lobbyResult != undefined) {
        var cards: Card[] = Data.Cards;
        can = lobbyResult.canUseCards(ws.userId, cards);
    }

    const response: WSMessage = {
        Type: MessageType.CAN_USE_CARD,
        Data: {
            UserId: ws.userId,
            UserName: ws.userName,
            LobbyId: lobbyId,
            Can: can,
        },
    };

    var jsonResponse = JSON.stringify(response);
    ws.send(jsonResponse);
}