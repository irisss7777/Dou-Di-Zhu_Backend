import { Card, CardValueType, CardsSuitType } from "../cards/cardSystem";
import { PlayerInfo } from "../lobby/lobby";
import { logger } from "../utils/logger";

export class CardTable {
    private cardsTableHandles: CardTableHandle[] = [];

    public getTableState(): TableState {
        const playerStates: PlayerTableState[] = this.cardsTableHandles.map(handle => ({
            playerId: handle.getPlayerInfo().getId(),
            playerName: handle.getPlayerInfo().getName(),
            cards: handle.getCards().map(card => ({
                value: card.getValue(),
                suit: card.getSuit(),
                numericValue: card.getNumericValue()
            })),
            cardCount: handle.getCards().length
        }));

        return {
            totalCardsOnTable: this.cardsTableHandles.reduce((sum, handle) => sum + handle.getCards().length, 0),
            players: playerStates,
            lastUpdate: new Date().toISOString()
        };
    }

    public canAddCardHandle(playerInfo: PlayerInfo, cards: any[], gameType : number): boolean {
        const cardInstances = cards.map(cardData =>
            new Card(cardData.CardValue, cardData.CardSuit)
        );

        const newCombination = this.getCombination(cardInstances, gameType);

        if (!newCombination) {
            return false;
        }

        if (this.cardsTableHandles.length > 0) {
            for (const handle of this.cardsTableHandles) {
                if (handle.getPlayerInfo().getId() === playerInfo.getId()) {
                    continue;
                }

                const existingCombination = this.getCombination(handle.getCards(), gameType);
                if (existingCombination && !this.isStronger(newCombination, existingCombination)) {
                    return false;
                }
            }
        }

        return true;
    }

    public hasValidCombination(cards: Card[], playerInfo: PlayerInfo, gameType : number): Card[] | null {
        if (!cards.length) return null;

        const sortedCards = [...cards].sort((a, b) => a.getValue() - b.getValue());
        
        var hastExistCombination = true;

        if (this.cardsTableHandles.length > 0) {
            var existingCombination : CardCombination | null = null;

            var maxValue = -1;
            var maxType = -1;
            
            for (const handle of this.cardsTableHandles) {
                if (handle.getPlayerInfo().getId() === playerInfo.getId()) {
                    continue;
                }

                var newExistingCombination = this.getCombination(handle.getCards(), gameType);

                if (!newExistingCombination) {
                    continue;
                }
                else if(newExistingCombination.rank > maxValue && newExistingCombination.type == maxType){
                    maxValue = newExistingCombination.rank
                    maxType = newExistingCombination.type;
                    existingCombination = newExistingCombination;
                }
                else if(newExistingCombination.type > maxType){
                    maxValue = newExistingCombination.rank
                    maxType = newExistingCombination.type;
                    existingCombination = newExistingCombination;
                }
            }
            
            if(existingCombination) {
                hastExistCombination = false;

                if (existingCombination.type === CombinationType.Single) {
                    for (const card of sortedCards) {
                        if (card.getValue() > existingCombination.rank) {
                            return [card];
                        }
                    }
                }

                else if (existingCombination.type === CombinationType.Pair) {
                    const groups = this.groupByValue(sortedCards);

                    for (const [value, group] of groups) {
                        if (group.length >= 2 && value > existingCombination.rank) {
                            return [group[0], group[1]];
                        }
                    }
                }

                else if (existingCombination.type === CombinationType.Triple) {
                    const groups = this.groupByValue(sortedCards);

                    for (const [value, group] of groups) {
                        if (group.length >= 3 && value > existingCombination.rank) {
                            return [group[0], group[1], group[2]];
                        }
                    }
                }

                else if (existingCombination.type === CombinationType.SingleBomb) {
                    const groups = this.groupByValue(sortedCards);

                    for (const [value, group] of groups) {
                        if (group.length >= 4 && value > existingCombination.rank) {
                            return [group[0], group[1], group[2], group[3]];
                        }
                    }
                } 
            }
        }
        
        if(hastExistCombination)
            return [sortedCards[0]];
        
        return null;
    }

    private getCombination(cards: Card[], gameType : number): CardCombination | null {
        if (cards.length === 0) return null;

        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));

        if (this.isRocket(sortedCards)) {
            return new CardCombination(CombinationType.Rocket, 16, sortedCards);
        }

        const bomb = this.checkBombCombinations(sortedCards, gameType);
        if (bomb) return bomb;

        return this.checkNormalCombinations(sortedCards, gameType);
    }

    public addCard(playerInfo: PlayerInfo, cards: any[]): void {
        const cardInstances = cards.map(cardData =>
            new Card(cardData.CardValue, cardData.CardSuit)
        );

        this.clearHandle(playerInfo);

        const newHandle = new CardTableHandle(playerInfo, cardInstances);
        this.cardsTableHandles.push(newHandle);
    }

    public clearHandlers(): void {
        this.cardsTableHandles = [];
    }

    public getCardCount(playerInfo: PlayerInfo): number {
        const cardHandle = this.cardsTableHandles.find(cardHandler =>
            cardHandler.getPlayerInfo().getId() === playerInfo.getId()
        );
        return cardHandle ? cardHandle.getCards().length : 0;
    }

    public clearHandle(playerInfo: PlayerInfo): void {
        this.cardsTableHandles = this.cardsTableHandles.filter(cardHandler =>
            cardHandler.getPlayerInfo().getId() !== playerInfo.getId()
        );
    }

    public hasCard(playerInfo: PlayerInfo): boolean {
        return this.cardsTableHandles.some(handle =>
            handle.getPlayerInfo().getId() === playerInfo.getId()
        );
    }
    
    public getCards(playerInfo: PlayerInfo): { cards?: Card[] } {
        const handle = this.cardsTableHandles.find(handle =>
            handle.getPlayerInfo().getId() === playerInfo.getId()
        );
        return {
            cards: handle ? handle.getCards() : undefined
        };
    }

    private isStronger(newComb: CardCombination, existingComb: CardCombination): boolean {
        if (newComb.type === CombinationType.Rocket) return true;
        if (existingComb.type === CombinationType.Rocket) return false;

        if (this.isBombType(newComb.type) && !this.isBombType(existingComb.type)) return true;
        if (!this.isBombType(newComb.type) && this.isBombType(existingComb.type)) return false;

        if (this.isBombType(newComb.type) && this.isBombType(existingComb.type)) {
            return this.compareBombs(newComb, existingComb);
        }

        if (newComb.type !== existingComb.type) return false;

        if (this.isSequenceType(newComb.type)) {
            if (newComb.cards.length !== existingComb.cards.length) return false;
        }

        return newComb.rank > existingComb.rank;
    }

    private getCardRank(card: Card): number {
        if (card.isJoker()) {
            return card.getSuit() === CardsSuitType.Black ? 15 : 16;
        }

        return card.getNumericValue() + 1;
    }

    private isRocket(cards: Card[]): boolean {
        return cards.length === 2 &&
            cards[0].isJoker() &&
            cards[1].isJoker() &&
            cards[0].getSuit() !== cards[1].getSuit();
    }

    private checkBombCombinations(cards: Card[], gameType : number): CardCombination | null {
        if(gameType == 0){
            if (cards.length === 4 && this.allSameValue(cards)) {
                return new CardCombination(CombinationType.SingleBomb, this.getCardRank(cards[0]), cards);
            }
        }
        else if(gameType == 1){
            if (cards.length === 4 && this.allSameValue(cards)) {
                return new CardCombination(CombinationType.SingleBomb, this.getCardRank(cards[0]), cards);
            }

            if (cards.length === 5) {
                const bomb = this.findBomb(cards);
                if (bomb) return new CardCombination(CombinationType.BombWithOne, this.getCardRank(bomb[0]), cards);
            }

            if (cards.length === 8) {
                const bomb = this.findBomb(cards);
                const remaining = cards.filter(c => !bomb?.includes(c));
                if (bomb && this.isTwoPairs(remaining)) {
                    return new CardCombination(CombinationType.BombWithTwoPairs, this.getCardRank(bomb[0]), cards);
                }
            }

            const consecutiveBombs = this.findConsecutiveBombs(cards);
            if (consecutiveBombs) {
                return new CardCombination(
                    consecutiveBombs.type,
                    this.getCardRank(consecutiveBombs.highestCard),
                    cards
                );
            }
        }

        return null;
    }

    private checkNormalCombinations(cards: Card[], gameType : number): CardCombination | null {
        if(gameType == 0){
            if (cards.length === 1) {
                return new CardCombination(CombinationType.Single, this.getCardRank(cards[0]), cards);
            }

            if (cards.length === 2 && this.allSameValue(cards)) {
                return new CardCombination(CombinationType.Pair, this.getCardRank(cards[0]), cards);
            }

            if (cards.length === 3 && this.allSameValue(cards)) {
                return new CardCombination(CombinationType.Triple, this.getCardRank(cards[0]), cards);
            }
        }
        if(gameType == 1){
            if (cards.length === 1) {
                return new CardCombination(CombinationType.Single, this.getCardRank(cards[0]), cards);
            }

            if (cards.length === 2 && this.allSameValue(cards)) {
                return new CardCombination(CombinationType.Pair, this.getCardRank(cards[0]), cards);
            }

            if (cards.length === 3 && this.allSameValue(cards)) {
                return new CardCombination(CombinationType.Triple, this.getCardRank(cards[0]), cards);
            }

            if (cards.length === 4) {
                const triple = this.findTriple(cards);
                if (triple) return new CardCombination(CombinationType.ThreeWithOne, this.getCardRank(triple[0]), cards);
            }

            if (cards.length === 5) {
                const triple = this.findTriple(cards);
                const remaining = cards.filter(c => !triple?.includes(c));
                if (triple && remaining.length === 2 && this.allSameValue(remaining)) {
                    return new CardCombination(CombinationType.ThreeWithPair, this.getCardRank(triple[0]), cards);
                }

                if (this.isStraight(cards, 5)) {
                    return new CardCombination(CombinationType.Straight, this.getCardRank(cards[cards.length - 1]), cards);
                }
            }

            if (this.isStraight(cards, cards.length)) {
                return new CardCombination(CombinationType.Straight, this.getCardRank(cards[cards.length - 1]), cards);
            }

            if (this.isSequenceOfPairs(cards)) {
                return new CardCombination(CombinationType.SequenceOfPairs, this.getCardRank(cards[cards.length - 1]), cards);
            }

            if (this.isSequenceOfTriples(cards)) {
                return new CardCombination(CombinationType.SequenceOfTriples, this.getCardRank(cards[cards.length - 1]), cards);
            }

            if (cards.length === 8) {
                const triples = this.findTwoTriples(cards);
                if (triples) return new CardCombination(CombinationType.TwoTriplesWithTwo, this.getCardRank(triples[0][0]), cards);
            }

            if (cards.length === 10) {
                const triples = this.findTwoTriples(cards);
                const remaining = cards.filter(c => !triples?.flat().includes(c));
                if (triples && this.isTwoPairs(remaining)) {
                    return new CardCombination(CombinationType.TwoTriplesWithTwoPairs, this.getCardRank(triples[0][0]), cards);
                }
            }
        }

        return null;
    }

    private allSameValue(cards: Card[]): boolean {
        const firstValue = cards[0].getValue();
        return cards.every(card => card.getValue() === firstValue);
    }

    private findBomb(cards: Card[]): Card[] | null {
        const groups = this.groupByValue(cards);
        for (const group of groups.values()) {
            if (group.length === 4) return group;
        }
        return null;
    }

    private findTriple(cards: Card[]): Card[] | null {
        const groups = this.groupByValue(cards);
        for (const group of groups.values()) {
            if (group.length === 3) return group;
        }
        return null;
    }

    private findTwoTriples(cards: Card[]): Card[][] | null {
        const groups = this.groupByValue(cards);
        const triples: Card[][] = [];
        for (const group of groups.values()) {
            if (group.length === 3) triples.push(group);
        }
        return triples.length >= 2 ? triples.slice(0, 2) : null;
    }

    private isTwoPairs(cards: Card[]): boolean {
        if (cards.length !== 4) return false;
        const groups = this.groupByValue(cards);
        return Array.from(groups.values()).every(group => group.length === 2);
    }

    private isStraight(cards: Card[], minLength: number): boolean {
        if (cards.length < minLength) return false;

        const ranks = cards.map(c => this.getCardRank(c)).sort((a, b) => a - b);

        if (ranks.some(rank => rank >= 13)) return false;

        for (let i = 1; i < ranks.length; i++) {
            if (ranks[i] !== ranks[i - 1] + 1) return false;
        }
        return true;
    }

    private isSequenceOfPairs(cards: Card[]): boolean {
        if (cards.length < 6 || cards.length % 2 !== 0) return false;

        const groups = this.groupByValue(cards);
        if (Array.from(groups.values()).some(group => group.length !== 2)) return false;

        const values = Array.from(groups.keys()).sort((a, b) => a - b);

        if (values.some(value => value >= CardValueType.Two)) return false;

        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i - 1] + 1) return false;
        }
        return true;
    }

    private isSequenceOfTriples(cards: Card[]): boolean {
        if (cards.length < 6 || cards.length % 3 !== 0) return false;

        const groups = this.groupByValue(cards);
        if (Array.from(groups.values()).some(group => group.length !== 3)) return false;

        const values = Array.from(groups.keys()).sort((a, b) => a - b);

        if (values.some(value => value >= CardValueType.Two)) return false;

        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i - 1] + 1) return false;
        }
        return true;
    }

    private findConsecutiveBombs(cards: Card[]): { type: CombinationType, highestCard: Card } | null {
        const groups = this.groupByValue(cards);
        const bombs = Array.from(groups.entries())
            .filter(([_, group]) => group.length === 4)
            .map(([value, group]) => ({ value, rank: this.getCardRank(new Card(value, CardsSuitType.Hearts)), cards: group }))
            .sort((a, b) => a.rank - b.rank);

        if (bombs.length < 2) return null;

        for (let i = 1; i < bombs.length; i++) {
            if (bombs[i].rank !== bombs[i - 1].rank + 1) return null;
        }

        let bombType: CombinationType;
        if (bombs.length === 2) bombType = CombinationType.DoubleBomb;
        else if (bombs.length === 3) bombType = CombinationType.TripleBomb;
        else if (bombs.length === 4) bombType = CombinationType.QuadrupleBomb;
        else if (bombs.length === 5) bombType = CombinationType.MaxBomb;
        else return null;

        return {
            type: bombType,
            highestCard: bombs[bombs.length - 1].cards[0]
        };
    }

    private groupByValue(cards: Card[]): Map<CardValueType, Card[]> {
        const groups = new Map<CardValueType, Card[]>();
        for (const card of cards) {
            const value = card.getValue();
            if (!groups.has(value)) groups.set(value, []);
            groups.get(value)!.push(card);
        }
        return groups;
    }

    private isBombType(type: CombinationType): boolean {
        return type >= CombinationType.SingleBomb && type <= CombinationType.MaxBomb;
    }

    private isSequenceType(type: CombinationType): boolean {
        return type === CombinationType.Straight ||
            type === CombinationType.SequenceOfPairs ||
            type === CombinationType.SequenceOfTriples;
    }

    private compareBombs(newComb: CardCombination, existingComb: CardCombination): boolean {
        const getBombStrength = (type: CombinationType): number => {
            if (type === CombinationType.SingleBomb ||
                type === CombinationType.BombWithOne ||
                type === CombinationType.BombWithTwoPairs) return 1;
            if (type === CombinationType.DoubleBomb) return 2;
            if (type === CombinationType.TripleBomb) return 3;
            if (type === CombinationType.QuadrupleBomb) return 4;
            if (type === CombinationType.MaxBomb) return 5;
            return 0;
        };

        const newStrength = getBombStrength(newComb.type);
        const existingStrength = getBombStrength(existingComb.type);

        if (newStrength > existingStrength) return true;
        if (newStrength < existingStrength) return false;

        return newComb.rank > existingComb.rank;
    }
}

class CardTableHandle {
    private cards: Card[] = [];
    private playerInfo: PlayerInfo;

    constructor(playerInfo: PlayerInfo, cards: Card[]) {
        this.playerInfo = playerInfo;
        this.cards = cards;
    }

    public getPlayerInfo(): PlayerInfo {
        return this.playerInfo;
    }

    public getCards(): Card[] {
        return this.cards;
    }
}

export enum CombinationType {
    Single = 1,
    Pair,
    Triple,
    Straight,
    SequenceOfPairs,
    SequenceOfTriples,
    ThreeWithOne,
    ThreeWithPair,
    TwoTriplesWithTwo,
    TwoTriplesWithTwoPairs,
    SingleBomb,
    BombWithOne,
    BombWithTwoPairs,
    DoubleBomb,
    TripleBomb,
    QuadrupleBomb,
    MaxBomb,
    Rocket
}

export class CardCombination {
    constructor(
        public type: CombinationType,
        public rank: number,
        public cards: Card[]
    ) {}
}

export interface TableState {
    totalCardsOnTable: number;
    players: PlayerTableState[];
    lastUpdate: string;
}

export interface PlayerTableState {
    playerId: string;
    playerName: string;
    cards: TableCard[];
    cardCount: number;
}

export interface TableCard {
    value: CardValueType;
    suit: CardsSuitType;
    numericValue: number;
}