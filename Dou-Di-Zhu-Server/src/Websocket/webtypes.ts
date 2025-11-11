import { WebSocket } from 'ws';

export enum MessageType {
    USER_JOIN = 'USER_JOIN',
    NEW_USER_JOIN = 'NEW_USER_JOIN',
    USER_LEAVE = 'USER_LEAVE',
    ALL_USER_INFO = 'ALL_USER_INFO',
    GAME_MOVE = 'GAME_MOVE',
    USER_PASS = 'USER_PASS',
    CAN_USE_CARD = 'CAN_USE_CARD',
    USE_CARD = 'USE_CARD',
    USE_CARD_OTHER = 'USE_CARD_OTHER',
    ADD_CARD = 'ADD_CARD',
    PLAYER_PASS = 'PLAYER_PASS',
}

export interface WSMessage {
    Type: MessageType;
    Data: any;
}

export interface CustomWebSocket extends WebSocket {
    userId: string;
    userName?: string;
    lobbyId?: string;
    isAlive: boolean;
}