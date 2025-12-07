import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import { lobbyHandler } from '../../lobby/lobby';
import  { broadcastToAll } from '../../utils/broadcast'
import { Card } from "../../cards/cardSystem";


export const handleBestCombination = async (
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer,
) => {
    const {Data} = message;

    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);
    var lobbyId = lobbyResult?.getLobbyId();

    var bestCombination = lobbyResult?.tryGetBestCombination(ws.userId);
    
    if(bestCombination){
        const response: WSMessage = {
            Type: MessageType.SELECT_BEST_COMBINATION,
            Data: {
                UserId: ws.userId,
                UserName: ws.userName,
                LobbyId: lobbyId,
                BestCombination: bestCombination,
            },
        };

        var jsonResponse = JSON.stringify(response);
        ws.send(jsonResponse);
    }
}