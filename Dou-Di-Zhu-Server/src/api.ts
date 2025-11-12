import express from 'express';
import { lobbyHandler } from './lobby/lobby';
import { logger } from './utils/logger';

export function startAPIServer(port: number = 3002) {
    const app = express();

    app.use(express.json());

    app.use((req, res, next) => {
        logger.info(`API ${req.method} ${req.path}`);
        next();
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    app.get('/api/lobbies', async (req, res) => {
        try {
            const lobbyInfo = await lobbyHandler.getLobbyInfo();
            res.json({
                success: true,
                data: {
                    lobbies: lobbyInfo,
                    totalLobbies: lobbyInfo.length,
                    totalPlayers: lobbyInfo.reduce((sum, lobby) => sum + lobby.players, 0)
                }
            });
        } catch (error) {
            logger.error('API Error getting lobby info:', error);
            res.status(500).json({
                success: false,
                
                error: 'Internal server error'
            });
        }
    });

    app.get('/api/lobbies/:lobbyId/table', async (req, res) => {
        try {
            const lobbyId = req.params.lobbyId;
            const tableState = await lobbyHandler.getLobbyTableState(lobbyId);

            if (!tableState) {
                return res.status(404).json({
                    success: false,
                    error: 'Lobby not found'
                });
            }

            res.json({
                success: true,
                data: tableState
            });
        } catch (error) {
            logger.error('API Error getting table state:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    });

    app.get('/api/stats', (req, res) => {
        res.json({
            success: true,
            data: {
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                memory: process.memoryUsage()
            }
        });
    });

    app.listen(port, () => {
        logger.info(`API Server started on port ${port}`);
    });

    return app;
}