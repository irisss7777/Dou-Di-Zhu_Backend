import { Card } from "../cards/cardSystem";
import { PlayerInfo } from "../lobby/lobby";
import { logger } from "../utils/logger";

export class CardTable{
    private cardsTableHandles : CardTableHandle[] = [];

    public canAddCardHandle(playerInfo: PlayerInfo, cards: any[]): boolean {
        const cardInstances = cards.map(cardData =>
            new Card(cardData.CardValue, cardData.CardSuit)
        );
        
        const newCombination = this.getCombination(cardInstances);

        if (!newCombination) {
            return false;
        }
        

        if (this.cardsTableHandles.length > 0) {
            for (const handle of this.cardsTableHandles) {
                if (handle.getPlayerInfo().getId() === playerInfo.getId()) {
                    continue;
                }
                
                const existingCombination = this.getCombination(handle.getCards());
                if (existingCombination && !this.isStronger(newCombination, existingCombination)) {
                    return false;
                }
            }
        }
        
        return true;
    }

    public addCard(playerInfo: PlayerInfo, cards: any[]) : void{
        const cardInstances = cards.map(cardData =>
            new Card(cardData.CardValue, cardData.CardSuit)
        );
        
        const newHandle = new CardTableHandle(playerInfo, cardInstances);
        this.cardsTableHandles.push(newHandle);
    }
    
    public clearHandlers() : void {
        this.cardsTableHandles = [];
    }
    
    public getCardCount(playerInfo : PlayerInfo) : number{
        if(this.cardsTableHandles.length != 0) {
            var cardCount = this.cardsTableHandles.find(cardHandler => cardHandler.getPlayerInfo() == playerInfo)?.getCards().length;
            
            if(cardCount != undefined)
                return cardCount;
        }
        
        return 0;
    }
    
    public clearHandle(playerInfo : PlayerInfo) : void{
        if(this.cardsTableHandles.length != 0) {
            this.cardsTableHandles = this.cardsTableHandles.filter(cardHandler => cardHandler.getPlayerInfo() == playerInfo);
        }
    }
    
    public hasCard(playerInfo : PlayerInfo) : boolean {
        var player =  this.cardsTableHandles.find(player => player.getPlayerInfo() === playerInfo);
        
        if(player == undefined)
            return false;
        
        return true;
    }
    
    public getCards(playerInfo : PlayerInfo) : {cards? : Card[]} {
        return {
            cards: this.cardsTableHandles.find(player => player.getPlayerInfo() === playerInfo)?.getCards()
        };
    }

    private getCombination(cards: Card[]): CardCombination | null {
        if (cards.length === 0) return null;

        const sortedCards = [...cards].sort((a, b) => a.getValue() - b.getValue());
        
        if (this.isRocket(sortedCards)) {
            return new CardCombination(CombinationType.Rocket, 13, sortedCards);
        }

        const bomb = this.isBomb(sortedCards);
        if (bomb) {
            return new CardCombination(CombinationType.Bomb, bomb.rank, sortedCards);
        }

        const combinations = [
            this.isFourWithTwo(sortedCards),
            this.isThreeWithPair(sortedCards),
            this.isThreeWithOne(sortedCards),
            this.isSequenceOfTriples(sortedCards),
            this.isSequenceOfPairs(sortedCards),
            this.isStraight(sortedCards),
            this.isTriple(sortedCards),
            this.isPair(sortedCards),
            this.isSingle(sortedCards)
        ];

        return combinations.find(comb => comb !== null) || null;
    }

    private isStronger(newComb: CardCombination, existingComb: CardCombination): boolean {
        if (newComb.type === CombinationType.Rocket) return true;
        if (existingComb.type === CombinationType.Rocket) return false;

        if (newComb.type === CombinationType.Bomb && existingComb.type !== CombinationType.Bomb) return true;
        if (existingComb.type === CombinationType.Bomb && newComb.type !== CombinationType.Bomb) return false;

        if (newComb.type === CombinationType.Bomb && existingComb.type === CombinationType.Bomb) {
            return newComb.rank > existingComb.rank;
        }

        if (newComb.type !== existingComb.type) return false;

        if (this.isSequenceType(newComb.type)) {
            if (newComb.cards.length !== existingComb.cards.length) return false;
            return newComb.rank > existingComb.rank;
        }

        return newComb.rank > existingComb.rank;
    }

    private isSequenceType(type: CombinationType): boolean {
        return [
            CombinationType.Straight,
            CombinationType.SequenceOfPairs,
            CombinationType.SequenceOfTriples
        ].includes(type);
    }

    private isRocket(cards: Card[]): boolean {
        return cards.length === 2 &&
            cards[0].getValue() === 13 && cards[1].getValue() === 13 &&
            cards[0].getSuit() !== cards[1].getSuit();
    }

    private isBomb(cards: Card[]): { rank: number } | null {
        if (cards.length !== 4) return null;
        const values = cards.map(c => c.getValue());
        if (new Set(values).size === 1) {
            return { rank: values[0] };
        }
        return null;
    }

    private isSingle(cards: Card[]): CardCombination | null {
        return cards.length === 1 ?
            new CardCombination(CombinationType.Single, cards[0].getValue(), cards) : null;
    }

    private isPair(cards: Card[]): CardCombination | null {
        if (cards.length !== 2) return null;
        const values = cards.map(c => c.getValue());
        return values[0] === values[1] ?
            new CardCombination(CombinationType.Pair, values[0], cards) : null;
    }

    private isTriple(cards: Card[]): CardCombination | null {
        if (cards.length !== 3) return null;
        const values = cards.map(c => c.getValue());
        return new Set(values).size === 1 ?
            new CardCombination(CombinationType.Triple, values[0], cards) : null;
    }

    private isStraight(cards: Card[]): CardCombination | null {
        if (cards.length < 5) return null;

        const values = cards.map(c => c.getValue()).sort((a, b) => a - b);
        
        for (let i = 1; i < values.length; i++) {
            if (values[i] !== values[i - 1] + 1) return null;
        }

        return new CardCombination(CombinationType.Straight, values[values.length - 1], cards);
    }

    private isSequenceOfPairs(cards: Card[]): CardCombination | null {
        if (cards.length < 6 || cards.length % 2 !== 0) return null;

        const pairs: number[] = [];
        const values = cards.map(c => c.getValue()).sort((a, b) => a - b);

        for (let i = 0; i < values.length; i += 2) {
            if (values[i] !== values[i + 1]) return null;
            pairs.push(values[i]);
        }

        for (let i = 1; i < pairs.length; i++) {
            if (pairs[i] !== pairs[i - 1] + 1) return null;
        }

        return new CardCombination(CombinationType.SequenceOfPairs, pairs[pairs.length - 1], cards);
    }

    private isSequenceOfTriples(cards: Card[]): CardCombination | null {
        if (cards.length < 6 || cards.length % 3 !== 0) return null;

        const triples: number[] = [];
        const values = cards.map(c => c.getValue()).sort((a, b) => a - b);

        for (let i = 0; i < values.length; i += 3) {
            if (values[i] !== values[i + 1] || values[i] !== values[i + 2]) return null;
            triples.push(values[i]);
        }

        for (let i = 1; i < triples.length; i++) {
            if (triples[i] !== triples[i - 1] + 1) return null;
        }

        return new CardCombination(CombinationType.SequenceOfTriples, triples[triples.length - 1], cards);
    }

    private isThreeWithOne(cards: Card[]): CardCombination | null {
        if (cards.length !== 4) return null;

        const values = cards.map(c => c.getValue()).sort((a, b) => a - b);
        const valueCount = new Map<number, number>();

        values.forEach(v => valueCount.set(v, (valueCount.get(v) || 0) + 1));

        const tripleValue = Array.from(valueCount.entries()).find(([_, count]) => count === 3);
        if (tripleValue) {
            return new CardCombination(CombinationType.ThreeWithOne, tripleValue[0], cards);
        }

        return null;
    }

    private isThreeWithPair(cards: Card[]): CardCombination | null {
        if (cards.length !== 5) return null;

        const values = cards.map(c => c.getValue()).sort((a, b) => a - b);
        const valueCount = new Map<number, number>();

        values.forEach(v => valueCount.set(v, (valueCount.get(v) || 0) + 1));

        const tripleValue = Array.from(valueCount.entries()).find(([_, count]) => count === 3);
        const pairValues = Array.from(valueCount.entries()).filter(([_, count]) => count === 2);

        if (tripleValue && pairValues.length === 1) {
            return new CardCombination(CombinationType.ThreeWithPair, tripleValue[0], cards);
        }

        return null;
    }

    private isFourWithTwo(cards: Card[]): CardCombination | null {
        if (cards.length !== 6) return null;

        const values = cards.map(c => c.getValue()).sort((a, b) => a - b);
        const valueCount = new Map<number, number>();

        values.forEach(v => valueCount.set(v, (valueCount.get(v) || 0) + 1));

        const fourValue = Array.from(valueCount.entries()).find(([_, count]) => count === 4);
        if (fourValue) {
            return new CardCombination(CombinationType.FourWithTwo, fourValue[0], cards);
        }

        return null;
    }
}

class CardTableHandle{
    private cards: Card[] = [];
    private playerInfo : PlayerInfo;
    
    constructor(playerInfo : PlayerInfo, cards: Card[]) {
        this.playerInfo = playerInfo;
        this.cards = cards;
    }
    
    public getPlayerInfo() : PlayerInfo {
        return this.playerInfo;
    }
    
    public getCards() : Card[] {
        return this.cards;
    }
}

export enum CombinationType {
    Single = 1,      // Одиночная карта
    Pair,            // Пара
    Triple,          // Тройка
    Straight,        // Последовательность (5+ карт)
    SequenceOfPairs, // Последовательность пар (3+ пар)
    SequenceOfTriples, // Последовательность троек (2+ троек)
    ThreeWithOne,    // Тройка с одной
    ThreeWithPair,   // Тройка с парой
    FourWithTwo,     // Четверка с двумя
    Bomb,            // Бомба (4 одинаковые)
    Rocket           // Ракета (2 джокера)
}

export class CardCombination {
    constructor(
        public type: CombinationType,
        public rank: number,
        public cards: Card[]
    ) {}
}
