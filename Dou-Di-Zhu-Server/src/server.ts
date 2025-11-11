import express from 'express';
import { logger } from './utils/logger';
import { WebSocketService } from "./Websocket/websocketService";

const app = express();
const PORT = 3000;

const server = app.listen(PORT, () => 
{
    logger.info(`Server started on - ${PORT} url`);
});

const webSocketService = new WebSocketService(server);

function Shutdown() 
{
    logger.info('Start close server...');

    server.close(() => 
    {
        logger.info(`Server closed correctly`);
        process.exit(0);
    });
    
    setTimeout(() => 
    {
        logger.info(`Server force closed`);
        process.exit(1);
    }, 5000);
}