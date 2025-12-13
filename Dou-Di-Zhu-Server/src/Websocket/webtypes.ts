import { WebSocket } from 'ws';

export enum MessageType {
    USER_JOIN = 'USER_JOIN',
    NEW_USER_JOIN = 'NEW_USER_JOIN',
    USER_LEAVE = 'USER_LEAVE',
    ALL_USER_INFO = 'ALL_USER_INFO',
    GAME_MOVE = 'GAME_MOVE',
    RAISE_BIT = 'RAISE_BIT',
    BIT_RAISED = 'BIT_RAISED',
    USER_PASS = 'USER_PASS',
    CAN_USE_CARD = 'CAN_USE_CARD',
    SELECT_BEST_COMBINATION = 'SELECT_BEST_COMBINATION',
    USE_CARD = 'USE_CARD',
    USE_CARD_OTHER = 'USE_CARD_OTHER',
    ADD_CARD = 'ADD_CARD',
    PLAYER_PASS = 'PLAYER_PASS',
    CHANGE_SKIN = 'CHANGE_SKIN',
    GAME_STATE = 'GAME_STATE',
    EMOTION_USE = 'EMOTION_USE',
    CARD_COUNT = 'CARD_COUNT',
    ERROR = 'ERROR',
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
    isConnected : boolean,
}