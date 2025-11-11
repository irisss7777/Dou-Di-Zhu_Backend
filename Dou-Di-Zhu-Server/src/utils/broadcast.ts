import { WebSocketServer } from 'ws';
import { CustomWebSocket, WSMessage } from '../Websocket/webtypes';

export const broadcastToAll = (
    wss: WebSocketServer,
    message: WSMessage,
    excludeWs?: CustomWebSocket,
    currentLobby? : string
) => {
    const data = JSON.stringify(message);

    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            const customClient = client as CustomWebSocket;
            
            if (currentLobby && customClient.lobbyId !== currentLobby) {
                return; 
            }
            
            if (!excludeWs || customClient !== excludeWs) {
                client.send(data);
            }
        }
    });
};

export const getConnectedUsersCount = (wss: WebSocketServer): number => {
    let count = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) count++;
    });
    return count;
};