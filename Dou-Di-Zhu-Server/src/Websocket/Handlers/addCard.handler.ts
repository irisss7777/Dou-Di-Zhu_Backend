import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import { lobbyHandler } from '../../lobby/lobby';
import { Card } from "../../cards/cardSystem";
import { broadcastToAll } from "../../utils/broadcast";

export const handleAddCard = async (
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer,
    cardCount: number,
    targetAdd = false,
) => {
    const { Data } = message;

    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);
    var lobbyId = lobbyResult?.getLobbyId();

    const cardCountMessages: Array<{
        message: WSMessage;
        client: CustomWebSocket;
    }> = [];

    if(targetAdd) {
        var cards = lobbyResult?.getCardHolder().getRandomCards(cardCount);

        const response: WSMessage = {
            Type: MessageType.ADD_CARD,
            Data: {
                UserId: ws.userId,
                UserName: ws.userName,
                LobbyId: lobbyId,
                CardData: cards,
            },
        };

        var cardsCount = cardCount;

        if(lobbyResult?.getCardCount(ws.userId) != undefined)
            cardsCount += lobbyResult?.getCardCount(ws.userId);

        wss.clients.forEach((client) => {
            if (client.readyState === client.OPEN) {
                const customClient = client as CustomWebSocket;

                if (lobbyResult && customClient.lobbyId !== lobbyResult.getLobbyId()) {
                    return;
                }
                cardCountMessages.forEach(item => {
                    const jsonResponseCards = JSON.stringify(item.message);
                    client.send(jsonResponseCards);
                });
            }
        });
        
        return;
    }
        
        
    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            const customClient = client as CustomWebSocket;

            if (lobbyResult && customClient.lobbyId !== lobbyResult.getLobbyId()) {
                return;
            }

            var cards = lobbyResult?.getCardHolder().getRandomCards(cardCount);
            var cardsCount = cardCount;

            if(lobbyResult?.getCardCount(customClient.userId) != undefined)
                cardsCount += lobbyResult?.getCardCount(customClient.userId);

            if(cards != undefined && cards?.length > 0){
                const response: WSMessage = {
                    Type: MessageType.ADD_CARD,
                    Data: {
                        UserId: customClient.userId,
                        UserName: customClient.userName,
                        LobbyId: lobbyId,
                        CardData: cards,
                    },
                };

                if(cards != undefined)
                    lobbyResult?.getPlayerInfo(customClient.userId)?.addCard(cards);

                var jsonResponse = JSON.stringify(response);
                client.send(jsonResponse);

                const cardResponse: WSMessage = {
                    Type: MessageType.CARD_COUNT,
                    Data: {
                        UserName: customClient.userName,
                        CardsCount: cardsCount,
                    },
                };

                cardCountMessages.push({
                    message: cardResponse,
                    client: customClient
                });
            }
        }
    });

    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            const customClient = client as CustomWebSocket;

            if (lobbyResult && customClient.lobbyId !== lobbyResult.getLobbyId()) {
                return;
            }
            cardCountMessages.forEach(item => {
                const jsonResponseCards = JSON.stringify(item.message);
                client.send(jsonResponseCards);
            });
        }
    });
};