import { CustomWebSocket, WSMessage, MessageType } from '../Websocket/webtypes';
import { WebSocketServer } from 'ws';
import { logger } from '../utils/logger';
import { getConnectedUsersCount, broadcastToAll } from '../utils/broadcast';
import {Card, CardHolder } from "../cards/cardSystem";
import { handleStartMove } from  "../Websocket/Handlers/startMove.handler"
import {CardCombination, CardTable, CombinationType, TableState } from "../CardTable/cardTableSystem";
import { handleRaiseBit } from "../Websocket/Handlers/raiseBit.handle";
import { handleChangeSkin } from "../Websocket/Handlers/changeSkin.handler";
import { handleAddCard } from "../Websocket/Handlers/addCard.handler";
import { handleUserPass } from "../Websocket/Handlers/pass.handler";

class Mutex {
    private locked = false;
    private queue: (() => void)[] = [];

    async acquire(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }

    release(): void {
        if (this.queue.length > 0) {
            const nextResolver = this.queue.shift();
            if (nextResolver) {
                nextResolver();
            }
        } else {
            this.locked = false;
        }
    }
}

class PlayerInfo {
    private playerId: string;
    private playerName: string;
    private ws: CustomWebSocket;
    private wss: WebSocketServer;
    private skin : number;
    private landlordSkin : number;
    private cards: Card[] = [];
    private bitCount : number;
    private isLandLord : boolean = false;

    constructor(playerId: string, playerName: string, ws: CustomWebSocket, wss: WebSocketServer, skin = 0, landlordSkin = 2, bitCount = 0) {
        this.playerId = playerId;
        this.playerName = playerName;
        this.ws = ws;
        this.wss = wss;
        this.skin = skin;
        this.landlordSkin = landlordSkin;
        this.bitCount = bitCount;
    }

    public getId(): string {
        return this.playerId;
    }

    public getName(): string {
        return this.playerName;
    }
    
    public getWs() : CustomWebSocket{
        return this.ws;
    }
    
    public getWss() : WebSocketServer{
        return this.wss;
    }
    
    public getSkin() : number{
        var skin = this.isLandLord ? this.landlordSkin : this.skin;
        return  skin;
    }
    
    public addCard(cards : Card[]) : void{
        this.cards = this.cards.concat(cards);
    }
    
    public removeCard(cards : any[]) : void{
        const cardsToRemove = new Set(
            cards.map(card => `${card.CardValue}-${card.CardSuit}`)
        );

        this.cards = this.cards.filter(card =>
            !cardsToRemove.has(`${card.getValue()}-${card.getSuit()}`)
        );
    }
    
    public getCardCount() : number{
        return this.cards.length;
    }
    
    public getAllCards() : Card[]{
        return this.cards;
    }

    public raiseBit(currentBit : number) : void{
        this.bitCount = currentBit;
    }
    
    public getBit() : number{
        return this.bitCount;
    }

    public setLandlordStatus() : void{
        this.isLandLord = true;
        this.skin = 2;
    }
}

class LobbyService {
    private lobbyId: string;
    private maxPlayerLobbyCount: number;
    private currentPlayerLobbyCount: number;
    private connectedPlayers: PlayerInfo[] = [];
    private lobbyMutex = new Mutex();
    private cardHolder = new CardHolder();
    private moveTime : number;
    private cantMoveTime : number = 4.0;
    private currentPlayerNumber : number = 0;
    private canccelation = false;
    private cardTable : CardTable;
    private lobbyHandle : LobbyHandler;
    private hasLandLord = false;
    private currentBit = 0;
    private currentBitPassed = 0;
    private lobbyIsStarted = false;
    private currentPlayer = 0;
    private lobbyIsActive = true;
    private pairProbability : number;
    private gameType : number;

    constructor(maxPlayerLobbyCount: number, lobbyHandle: LobbyHandler, gameType: number) {
        this.gameType = gameType;
        this.moveTime = gameType == 0 ? 20 : 15;
        this.pairProbability = gameType == 0 ? 0.05 : 0.98;
        this.lobbyId = this.generateLobbyId();
        this.maxPlayerLobbyCount = maxPlayerLobbyCount;
        this.currentPlayerLobbyCount = 0;
        this.cardHolder.initHolder();
        this.cardTable = new CardTable();
        this.lobbyHandle = lobbyHandle;
    }
    
    public getCardPropability() : number{
        return this.pairProbability;
    }
    
    public destroyLobby(): void{
        this.lobbyIsActive = false;
    }
    
    public startGame()
    {
        var currentPlayer = undefined;
        if(this.connectedPlayers[this.currentPlayerNumber] != undefined)
            currentPlayer = this.connectedPlayers[this.currentPlayerNumber];
        
        if(currentPlayer != undefined)
            this.waitForNextMove(currentPlayer);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    public tryUseCards(playerId : string, cards : Card[]) : void{
        var playerInfo = this.getPlayerInfo(playerId);
        if(playerInfo != undefined) {
            if (this.cardTable.canAddCardHandle(playerInfo, cards, this.gameType)) {
                this.cardTable.addCard(playerInfo, cards);

                if(this.connectedPlayers[this.currentPlayerNumber].getId() == playerId)
                    this.canccelation = true;
            }
        }
    }

    public canUseCards(playerId : string, cards : Card[]) : boolean{
        var playerInfo = this.getPlayerInfo(playerId);
        if(playerInfo != undefined) {
            return this.cardTable.canAddCardHandle(playerInfo, cards, this.gameType);
        }
        
        return false;
    }
    
    public tryGetBestCombination(playerId : string) : Card[] | null{
        var playerInfo = this.getPlayerInfo(playerId);
        
        if(playerInfo){
            return this.cardTable.hasValidCombination(playerInfo.getAllCards(), playerInfo, this.gameType);
        }
        
        return null;
    }
    
    public getCardCount(playerId : string) : number{
        var playerInfo = this.getPlayerInfo(playerId);
        if(playerInfo != undefined) {
            return playerInfo.getCardCount();
        }
        
        return 0;
    }

    private async waitForNextMove(playerInfo: PlayerInfo) {
        var waitPlayerInfo = playerInfo;

        while (this.lobbyIsActive) {
            var currentTickCount = 0;
            var isRaised = false;
            
            const playerCards = playerInfo.getAllCards();
            const canPlayAnyCard = this.canPlayerPlayAnyCard(playerInfo, playerCards);
            var moveTime = canPlayAnyCard ? this.moveTime : this.cantMoveTime;
            var finalMoveTime = this.hasLandLord ? moveTime : this.moveTime;

            while (currentTickCount < finalMoveTime && this.lobbyIsActive) {
                currentTickCount++;

                if (this.canccelation) {
                    this.canccelation = false;
                    isRaised = true;
                    break;
                }

                const message: WSMessage = {
                    Type: MessageType.NEW_USER_JOIN,
                    Data: {
                        UserId: waitPlayerInfo.getId(),
                        UserName: waitPlayerInfo.getName(),
                    },
                };

                if (this.hasLandLord) {
                    handleStartMove(waitPlayerInfo.getWs(), message, waitPlayerInfo.getWss(), currentTickCount, finalMoveTime);
                } else {
                    handleRaiseBit(waitPlayerInfo.getWs(), message, waitPlayerInfo.getWss(), currentTickCount, this.moveTime, this.currentBit);
                }

                await this.delay(1000);

                if (currentTickCount >= finalMoveTime - 1) {
                    const passMessage: WSMessage = {
                        Type: MessageType.PLAYER_PASS,
                        Data: {},
                    };
                    handleUserPass(waitPlayerInfo.getWs(), passMessage, waitPlayerInfo.getWss());
                }
            }

            this.currentPlayerNumber++;

            if (this.currentPlayerNumber >= this.connectedPlayers.length)
                this.currentPlayerNumber = 0;

            var currentPlayer = undefined;
            if (this.connectedPlayers[this.currentPlayerNumber] != undefined)
                currentPlayer = this.connectedPlayers[this.currentPlayerNumber];

            if (currentPlayer != undefined)
                waitPlayerInfo = currentPlayer;
        }
    }

    private canPlayerPlayAnyCard(playerInfo: PlayerInfo, cards: Card[]): boolean {
        if (!cards.length) return false;

        const validCombination = this.cardTable.hasValidCombination(cards, playerInfo, this.gameType);
        return validCombination !== null;
    }

    public raiseBit(playerId : string) : void{
        this.currentBitPassed = 0;

        this.currentBit += 20;

        const player = this.connectedPlayers.find(player => player.getId() === playerId);
        player?.raiseBit(this.currentBit);

        this.pass(playerId);
    }

    public passRaiseByPlayer(playerId : string) : void{
        this.pass(playerId);
        this.passRaiseBit();
    }

    private passRaiseBit(): void {
        this.currentBitPassed++;

        if (this.currentBitPassed >= 2) {
            this.hasLandLord = true;

            let landlordCandidate: PlayerInfo | null = null;

            let allZeroBits = true;
            for (const player of this.connectedPlayers) {
                if (player.getBit() > 0) {
                    allZeroBits = false;
                    break;
                }
            }

            if (allZeroBits) {
                landlordCandidate = this.connectedPlayers[0] || null;
            } else {
                for (const player of this.connectedPlayers) {
                    if (!landlordCandidate || player.getBit() > landlordCandidate.getBit()) {
                        landlordCandidate = player;
                    }
                }
            }

            if (landlordCandidate) {
                const message: WSMessage = {
                    Type: MessageType.ADD_CARD,
                    Data: {
                    }
                }

                handleAddCard(landlordCandidate.getWs(), message, landlordCandidate.getWss(), 3, true);
                landlordCandidate.setLandlordStatus();
                this.onLandlordSetted();
            }
        }
    }
    
    private onLandlordSetted() : void{
        this.getAllPlayers().forEach((playerInfo) => {
            const message : WSMessage = {
                Type: MessageType.CHANGE_SKIN,
                Data: {
                    Skin: playerInfo.getSkin(),
                }
            }

            handleChangeSkin(playerInfo.getWs(), message, playerInfo.getWss())
        });
    }


    public pass(playerId : string) : void{
        if(this.connectedPlayers[this.currentPlayerNumber].getId() == playerId)
            this.canccelation = true;
        
        var playerInfo = this.getPlayerInfo(playerId);
        
        if(playerInfo != undefined)
            this.cardTable.clearHandle(playerInfo);
    }

    public async tryConnectPlayer(playerId: string, playerName: string, ws: CustomWebSocket, wss: WebSocketServer, gameType : number): Promise<boolean> {
        await this.lobbyMutex.acquire();

        try {
            if(this.lobbyIsStarted)
                return false;
            
            if(gameType != this.gameType)
                return false;
            
            if (this.currentPlayerLobbyCount < this.maxPlayerLobbyCount &&
                !this.connectedPlayers.some(player => player.getId() === playerId)) {
                this.currentPlayerLobbyCount++;
                
                this.connectedPlayers.push(new PlayerInfo(playerId, playerName, ws, wss, this.currentPlayer));
                logger.info(`Player ${playerId} (${playerName}) connected to lobby ${this.lobbyId}. Count: ${this.currentPlayerLobbyCount}/${this.maxPlayerLobbyCount}`);
                
                if(this.currentPlayerLobbyCount >= this.maxPlayerLobbyCount){
                    this.lobbyIsStarted = true;
                }

                if(this.currentPlayer < 1)
                    this.currentPlayer++;
                
                return true;
            }

            return false;
        } finally {
            this.lobbyMutex.release();
        }
    }

    public async disconnectPlayer(playerId: string): Promise<boolean> {
        await this.lobbyMutex.acquire();

        try {
            const index = this.connectedPlayers.findIndex(player => player.getId() === playerId);
            if (index > -1) {
                const playerName = this.connectedPlayers[index].getName();
                this.connectedPlayers.splice(index, 1);
                this.currentPlayerLobbyCount--;
                
                if(this.currentPlayerLobbyCount <= 0)
                    this.lobbyHandle.cleanupEmptyLobbies();
                
                logger.info(`Player ${playerId} (${playerName}) disconnected from lobby ${this.lobbyId}. Count: ${this.currentPlayerLobbyCount}/${this.maxPlayerLobbyCount}`);
                return true;
            }
            return false;
        } finally {
            this.lobbyMutex.release();
        }
    }

    public hasPlayer(playerId: string): boolean {
        return this.connectedPlayers.some(player => player.getId() === playerId);
    }
    
    public getCardHolder() : CardHolder{
        return this.cardHolder;
    }

    public getLobbyId(): string {
        return this.lobbyId;
    }
    
    public getLobbyStartedState() : boolean{
        return this.lobbyIsStarted;
    }

    public getAllPlayerIds(): string[] {
        return this.connectedPlayers.map(player => player.getId());
    }

    public getAllPlayerNames(): string[] {
        return this.connectedPlayers.map(player => player.getName());
    }

    public getAllSkins(): number[] {
        return this.connectedPlayers.map(player => player.getSkin());
    }

    public getAllCardsCount(): number[] {
        return this.connectedPlayers.map(player => player.getCardCount());
    }

    public getAllPlayers(): PlayerInfo[] {
        return [...this.connectedPlayers];
    }

    public getPlayerCount(): number {
        return this.currentPlayerLobbyCount;
    }

    public getMaxPlayers(): number {
        return this.maxPlayerLobbyCount;
    }

    public getConnectedPlayers(): PlayerInfo[] {
        return [...this.connectedPlayers];
    }

    public isFull(): boolean {
        return this.currentPlayerLobbyCount >= this.maxPlayerLobbyCount;
    }

    public isEmpty(): boolean {
        if(this.currentPlayerLobbyCount == 0 && this.lobbyIsActive)
            this.destroyLobby();
        
        return this.currentPlayerLobbyCount === 0;
    }

    public getTableState(): TableState {
        return this.cardTable.getTableState();
    }

    public getPlayerInfo(playerId: string): PlayerInfo | null {
        const player = this.connectedPlayers.find(player => player.getId() === playerId);
        return player || null;
    }

    private generateLobbyId(): string {
        return `Lobby_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    public getHasLandLord() : boolean{
        return this.hasLandLord;
    }
}

class LobbyHandler {
    private allLobby: LobbyService[] = [];
    private connectMutex = new Mutex();
    private readonly defaultMaxPlayers: number;

    constructor(defaultMaxPlayers: number = 4) {
        this.defaultMaxPlayers = defaultMaxPlayers;
    }

    public async tryConnectPlayer(playerId: string, playerName: string, gameType : number, ws: CustomWebSocket, wss: WebSocketServer): Promise<{ success: boolean; lobbyId?: string; lobby?: LobbyService }> {
        await this.connectMutex.acquire();

        try {
            for (const lobby of this.allLobby) {
                if (await lobby.tryConnectPlayer(playerId, playerName, ws, wss, gameType)) {
                    return {
                        success: true,
                        lobbyId: lobby.getLobbyId(),
                        lobby: lobby
                    };
                }
            }

            const newLobby = new LobbyService(this.defaultMaxPlayers, this, gameType);
            this.allLobby.push(newLobby);

            if (await newLobby.tryConnectPlayer(playerId, playerName, ws, wss, gameType)) {
                return {
                    success: true,
                    lobbyId: newLobby.getLobbyId(),
                    lobby: newLobby
                };
            }

            logger.warn(`Failed to connect player ${playerId} (${playerName}) to any lobby`);
            return { success: false };
        } finally {
            this.connectMutex.release();
        }
    }

    public async disconnectPlayer(playerId: string): Promise<{ lobbyId?: string; lobby?: LobbyService }> {
        await this.connectMutex.acquire();

        try {
            for (const lobby of this.allLobby) {
                const disconnected = await lobby.disconnectPlayer(playerId);
                if (disconnected) {
                    this.allLobby = this.allLobby.filter(l => !l.isEmpty());
                    return {
                        lobbyId: lobby.getLobbyId(),
                        lobby: lobby
                    };
                }
            }
            return { };
        } finally {
            this.connectMutex.release();
        }
    }

    public userPass(playerId: string) : void{
        for (const lobby of this.allLobby) {
            if (lobby.hasPlayer(playerId)) {
                if(lobby.getHasLandLord())
                    lobby.pass(playerId);
                else 
                    lobby.passRaiseByPlayer(playerId);
            }
        }
    }

    public getLobbyCount(): number {
        return this.allLobby.length;
    }

    public async getPlayerLobby(playerId: string): Promise<LobbyService | null> {
        await this.connectMutex.acquire();

        try {
            for (const lobby of this.allLobby) {
                if (lobby.hasPlayer(playerId)) {
                    return lobby;
                }
            }
            return null;
        } finally {
            this.connectMutex.release();
        }
    }

    public async getLobbyInfo(): Promise<{ lobbyId: string; players: number; maxPlayers: number; playerIds: string[]; playerNames: string[] }[]> {
        await this.connectMutex.acquire();

        try {
            return this.allLobby.map(lobby => ({
                lobbyId: lobby.getLobbyId(),
                players: lobby.getPlayerCount(),
                maxPlayers: lobby.getMaxPlayers(),
                playerIds: lobby.getAllPlayerIds(),
                playerNames: lobby.getAllPlayerNames()
            }));
        } finally {
            this.connectMutex.release();
        }
    }

    public getLobbyById(lobbyId: string): LobbyService | null {
        return this.allLobby.find(lobby => lobby.getLobbyId() === lobbyId) || null;
    }

    public async getLobbyTableState(lobbyId: string): Promise<TableState | null> {
        await this.connectMutex.acquire();
        try {
            const lobby = this.getLobbyById(lobbyId);
            return lobby ? lobby.getTableState() : null;
        } finally {
            this.connectMutex.release();
        }
    }

    public async getPlayerInfo(playerId: string): Promise<PlayerInfo | null> {
        await this.connectMutex.acquire();

        try {
            for (const lobby of this.allLobby) {
                const playerInfo = lobby.getPlayerInfo(playerId);
                if (playerInfo) {
                    return playerInfo;
                }
            }
            return null;
        } finally {
            this.connectMutex.release();
        }
    }

    public async cleanupEmptyLobbies(): Promise<void> {
        await this.connectMutex.acquire();

        try {
            const initialCount = this.allLobby.length;
            this.allLobby = this.allLobby.filter(lobby => !lobby.isEmpty());
            const removedCount = initialCount - this.allLobby.length;
        } finally {
            this.connectMutex.release();
        }
    }
}

const lobbyHandler = new LobbyHandler(3);

export { lobbyHandler, PlayerInfo };