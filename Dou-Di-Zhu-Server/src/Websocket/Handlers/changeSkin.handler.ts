import { CustomWebSocket, WSMessage, MessageType } from '../webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../../utils/logger';
import  { getConnectedUsersCount, broadcastToAll } from '../../utils/broadcast'
import { lobbyHandler } from '../../lobby/lobby';

export const handleChangeSkin = async(
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer,
) => {
    const { Data } = message;

    logger.info('Change skin',
        {
            userId: ws.userId,
            bit: Data.Skin,
        });


    const lobbyResult = await lobbyHandler.getPlayerLobby(ws.userId);
    var lobbyId = lobbyResult?.getLobbyId();

    const response: WSMessage = {
        Type: MessageType.CHANGE_SKIN,
        Data: {
            UserId: ws.userId,
            UserName: ws.userName,
            LobbyId: lobbyId,
            Skin: Data.Skin,
            Bit: lobbyResult?.getPlayerInfo(ws.userId)?.getBit(),
        },
    };

    var jsonResponse = JSON.stringify(response);
    ws.send(jsonResponse);

    const broadcastMessage: WSMessage = {
        Type: MessageType.CHANGE_SKIN,
        Data: {
            UserId: "",
            UserName: ws.userName,
            LobbyId: lobbyId,
            Skin: Data.Skin,
            Bit: lobbyResult?.getPlayerInfo(ws.userId)?.getBit(),
        },
    };

    broadcastToAll(wss, broadcastMessage, ws, lobbyId);
}