import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import  { getConnectedUsersCount, broadcastToAll } from '../../utils/broadcast'
import { lobbyHandler } from '../../lobby/lobby';
import { handleAddCard } from './addCard.handler';

export const handleUserJoin = async(
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer
) => {
    const { Data } = message;
    
    var gameType : number = Data.GameType;
    
    if (!ws.userId) {
        ws.userId = generateUserId();
    }
    
    if(!ws.userName){
        ws.userName = Data.UserName;
    }

    logger.info('User joined', {
        UserId: ws.userId,
        UserName: Data.UserName
    });

    const lobbyResult = await lobbyHandler.tryConnectPlayer(ws.userId, Data.UserName, gameType, ws, wss);
    var skin = lobbyResult.lobby?.getPlayerInfo(ws.userId)?.getSkin();

    if (!lobbyResult.success) {
        logger.error(`Failed to connect user ${ws.userId} to lobby`);
        return;
    }
    
    ws.lobbyId = lobbyResult.lobbyId;

    logger.info(`User ${ws.userId} connected to lobby ${lobbyResult.lobbyId}`);

    const response: WSMessage = {
        Type: MessageType.USER_JOIN,
        Data: {
            UserId: ws.userId,
            UserName: Data.UserName,
            LobbyId: lobbyResult.lobbyId,
            LobbyPlayers: lobbyResult.lobby?.getPlayerCount() || 0,
            MaxLobbyPlayers: lobbyResult.lobby?.getMaxPlayers() || 4,
            SkinNumber : skin,
        },
    };
    
    var jsonResponse = JSON.stringify(response);
    ws.send(jsonResponse);

    var allPlayerInfo = lobbyResult.lobby?.getAllPlayerNames();
    const filteredPlayers = allPlayerInfo?.filter(name => name !== Data.UserName);
    
    
    const responseAboutAll: WSMessage = {
        Type: MessageType.ALL_USER_INFO,
        Data: {
            UsersId: "",
            UserName: filteredPlayers,
            LobbyId: lobbyResult.lobbyId,
            LobbyPlayers: lobbyResult.lobby?.getPlayerCount() || 0,
            MaxLobbyPlayers: lobbyResult.lobby?.getMaxPlayers() || 4,
            SkinNumber : lobbyResult.lobby?.getAllSkins(),
            CardsCount : lobbyResult.lobby?.getAllCardsCount(),
        },
    };

    var jsonResponseAboutAll = JSON.stringify(responseAboutAll);
    ws.send(jsonResponseAboutAll);

    const broadcastMessage: WSMessage = {
        Type: MessageType.NEW_USER_JOIN,
        Data: {
            UserId: "",
            UserName: Data.UserName,
            LobbyPlayers: lobbyResult.lobby?.getPlayerCount() || 0,
            MaxLobbyPlayers: lobbyResult.lobby?.getMaxPlayers() || 4,
            SkinNumber : skin,
            CardsCount: 0,
        },
    };
    
    var currentPlayerCount = lobbyResult.lobby?.getPlayerCount();
    var maxPlayerCOunt = lobbyResult.lobby?.getMaxPlayers();
    
    if(currentPlayerCount != undefined && maxPlayerCOunt != undefined){
        if(currentPlayerCount >= maxPlayerCOunt){
            lobbyResult.lobby?.startGame();
            
            handleAddCard(
                ws, 
                message,
                wss, 
                17
            )
        }
    }

    broadcastToAll(wss, broadcastMessage, ws, lobbyResult.lobbyId);
};

const generateUserId = (): string => {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};