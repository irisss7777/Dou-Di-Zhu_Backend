import { CustomWebSocket, MessageType, WSMessage } from '../webtypes';
import { logger } from '../../utils/logger';
import { WebSocketServer } from 'ws';
import { handleUserJoin } from './user.handler';
import { handleUserLeave } from './userExit.handler';
import { handleGameState } from './game.handler';
import { handleUserPass } from './pass.handler';
import { handleCanUseCard } from './canUseCard.handler';
import { handleUseCard } from "./useCard.Handler";
import { handleBitIsRaised } from "./bitIsRaised.handler";
import { handleEmotionUse } from "./emotionUse.Handler";

export type MessageHandler = (
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer
) => void;

const messageHandlers: Record<string, MessageHandler> = {
    [MessageType.USER_JOIN]: handleUserJoin,
    [MessageType.USER_LEAVE]: handleUserLeave,
    [MessageType.GAME_MOVE]: handleGameState,
    [MessageType.USER_PASS]: handleUserPass,
    [MessageType.CAN_USE_CARD]: handleCanUseCard,
    [MessageType.USE_CARD]: handleUseCard,
    [MessageType.BIT_RAISED]: handleBitIsRaised,
    [MessageType.EMOTION_USE]: handleEmotionUse,
};

export const handleWebSocketMessage = (
    ws: CustomWebSocket,
    message: WSMessage,
    wss: WebSocketServer
) => {
    const handler = messageHandlers[message.Type];
    
    if (handler) {
        handler(ws, message, wss);
    }
};

export const registerHandler = (messageType: string, handler: MessageHandler) => {
    messageHandlers[messageType] = handler;
};