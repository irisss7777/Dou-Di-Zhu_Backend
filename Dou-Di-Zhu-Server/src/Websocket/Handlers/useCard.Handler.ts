import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import { lobbyHandler } from '../../lobby/lobby';
import  { broadcastToAll } from '../../utils/broadcast'
import { Card } from "../../cards/cardSystem";


export const handleUseCard = async (
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
        if(can){

            lobbyResult.tryUseCards(ws.userId, cards);

            if(cards != undefined)
                lobbyResult?.getPlayerInfo(ws.userId)?.removeCard(cards);
            
            var cardCount = lobbyResult?.getCardCount(ws.userId);

            const response: WSMessage = {
                Type: MessageType.USE_CARD,
                Data: {
                    UserId: ws.userId,
                    UserName: ws.userName,
                    LobbyId: lobbyId,
                    Used: true,
                    Cards: cards,
                    CardsCount: cardCount,
                },
            };
            
            if(cardCount == 0){
                const responseWin: WSMessage = {
                    Type: MessageType.GAME_STATE,
                    Data: {
                        UserId: ws.userId,
                        UserName: ws.userName,
                        LobbyId: lobbyId,
                        Win: true,
                    },
                };

                var jsonResponseWin = JSON.stringify(responseWin);
                ws.send(jsonResponseWin);
                
                var winPlayer = lobbyResult?.getPlayerInfo(ws.userId);
                var allPlayerInfos = lobbyResult?.getAllPlayers();

                wss.clients.forEach((client) => {
                    if (client.readyState === client.OPEN) {
                        const customClient = client as CustomWebSocket;
                        
                        const broadcastMessage: WSMessage = {
                            Type: MessageType.GAME_STATE,
                            Data: {
                                UserId: ws.userId,
                                UserName: ws.userName,
                                LobbyId: lobbyId,
                                Win: winPlayer?.getLandLordStatus() ? false : lobbyResult?.getPlayerInfo(customClient.userId)?.getLandLordStatus() ? false : true,
                            },
                        };

                        var jsonResponseOther = JSON.stringify(broadcastMessage);
                        client.send(jsonResponseOther);
                    }
                });

                wss.clients.forEach((client) => {
                    if (client.readyState === client.OPEN) {
                        const customClient = client as CustomWebSocket;

                        if (lobbyResult && customClient.lobbyId !== lobbyResult.getLobbyId()) {
                            return;
                        }

                        lobbyResult.disconnectPlayer(customClient.userId);
                        customClient.isConnected = false;
                    }
                });
            }
            

            var jsonResponse = JSON.stringify(response);
            ws.send(jsonResponse);

            const broadcastMessage: WSMessage = {
                Type: MessageType.USE_CARD_OTHER,
                Data: {
                    UserId: "",
                    UserName: ws.userName,
                    LobbyId: lobbyId,
                    Cards: cards,
                    CardsCount: cardCount,
                },
            };

            broadcastToAll(wss, broadcastMessage, ws, lobbyId);
        }
        else {
            const response: WSMessage = {
                Type: MessageType.USE_CARD,
                Data: {
                    UserId: ws.userId,
                    UserName: ws.userName,
                    LobbyId: lobbyId,
                    Used: false,
                },
            };

            var jsonResponse = JSON.stringify(response);
            ws.send(jsonResponse);
        }
    }
}