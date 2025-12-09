import { Card, CardValueType, CardsSuitType } from "../cards/cardSystem";
import { PlayerInfo } from "../lobby/lobby";
import { logger } from "../utils/logger";

export class CardTable {
    private cardsTableHandles: CardTableHandle[] = [];
    private combinationCache = new Map<string, CardCombination[]>();
    private playerComboLevel = new Map<string, number>();
    private playerComboRound = new Map<string, number>();

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

    public canAddCardHandle(playerInfo: PlayerInfo, cards: any[], gameType: number): boolean {
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

    //

    public hasValidCombination(cards: Card[], playerInfo: PlayerInfo, gameType: number): Card[] | null {
        if (!cards.length) return null;

        const playerId = playerInfo.getId();
        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));

        const allCombinations = this.getCachedCombinations(sortedCards, gameType);

        if (this.cardsTableHandles.length === 0) {
            return this.getNextLevelCombination(playerId, allCombinations, null);
        }

        let strongestTableCombination: CardCombination | null = null;

        for (const handle of this.cardsTableHandles) {
            if (handle.getPlayerInfo().getId() === playerId) {
                continue;
            }

            const comb = this.getCombination(handle.getCards(), gameType);
            if (!comb) continue;

            if (strongestTableCombination === null ||
                this.isStronger(comb, strongestTableCombination)) {
                strongestTableCombination = comb;
            }
        }

        if (!strongestTableCombination) {
            return this.getNextLevelCombination(playerId, allCombinations, null);
        }

        return this.getNextLevelBeatingCombination(playerId, allCombinations, strongestTableCombination);
    }

    private getNextLevelCombination(playerId: string, allCombinations: CardCombination[], tableCombination: CardCombination | null): Card[] | null {
        if (allCombinations.length === 0) return null;

        const sortedCombinations = [...allCombinations].sort((a, b) => {
            if (!this.isBombType(a.type) && this.isBombType(b.type) && b.type !== CombinationType.Rocket) {
                return -1;
            }
            if (this.isBombType(a.type) && a.type !== CombinationType.Rocket && !this.isBombType(b.type)) {
                return 1;
            }

            if (a.rank !== b.rank) {
                return a.rank - b.rank;
            }

            return a.cards.length - b.cards.length;
        });

        let currentLevel = this.playerComboLevel.get(playerId) || 0;
        let round = this.playerComboRound.get(playerId) || 0;

        if (currentLevel >= sortedCombinations.length) {
            currentLevel = 0;
            round++;
            if (round > 10) round = 0; 
        }

        const selectedCombination = sortedCombinations[currentLevel];

        currentLevel++;
        if (currentLevel >= sortedCombinations.length) {
            currentLevel = 0;
        }

        this.playerComboLevel.set(playerId, currentLevel);
        this.playerComboRound.set(playerId, round);

        return selectedCombination.cards;
    }

    private getNextLevelBeatingCombination(playerId: string, allCombinations: CardCombination[], tableCombination: CardCombination): Card[] | null {
        const beatingCombinations = allCombinations.filter(comb =>
            this.isStronger(comb, tableCombination)
        );

        if (beatingCombinations.length === 0) return null;

        const sortedBeatingCombinations = [...beatingCombinations].sort((a, b) => {
            if (a.type === tableCombination.type && b.type !== tableCombination.type) {
                return -1;
            }
            if (a.type !== tableCombination.type && b.type === tableCombination.type) {
                return 1;
            }

            if (a.type === tableCombination.type && b.type === tableCombination.type) {
                return a.rank - b.rank;
            }

            const aStrength = this.getBombStrength(a.type);
            const bStrength = this.getBombStrength(b.type);
            if (aStrength !== bStrength) {
                return aStrength - bStrength;
            }

            return a.rank - b.rank;
        });

        let currentLevel = this.playerComboLevel.get(playerId) || 0;
        let round = this.playerComboRound.get(playerId) || 0;

        if (currentLevel >= sortedBeatingCombinations.length) {
            currentLevel = 0;
            round++;
            if (round > 10) round = 0;
        }

        const selectedCombination = sortedBeatingCombinations[currentLevel];

        currentLevel++;
        if (currentLevel >= sortedBeatingCombinations.length) {
            currentLevel = 0;
        }

        this.playerComboLevel.set(playerId, currentLevel);
        this.playerComboRound.set(playerId, round);

        return selectedCombination.cards;
    }

    public resetPlayerComboState(playerId: string): void {
        this.playerComboLevel.delete(playerId);
        this.playerComboRound.delete(playerId);
    }

    private getCachedCombinations(cards: Card[], gameType: number): CardCombination[] {
        const key = cards.map(c => `${c.getValue()}-${c.getSuit()}`).sort().join('|') + `|${gameType}`;

        if (this.combinationCache.has(key)) {
            return this.combinationCache.get(key)!;
        }

        const combinations = this.getAllPossibleCombinations(cards, gameType);
        this.combinationCache.set(key, combinations);
        return combinations;
    }

    private getAllPossibleCombinations(cards: Card[], gameType: number): CardCombination[] {
        const combinations: CardCombination[] = [];

        if (gameType === 0) {
            this.addSimpleCombinations(cards, combinations);
        } else if (gameType === 1) {
            this.addAdvancedCombinations(cards, combinations);
        }

        return combinations;
    }

    private addSimpleCombinations(cards: Card[], combinations: CardCombination[]): void {
        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));
        const groups = this.groupByValue(sortedCards);

        for (const card of sortedCards) {
            combinations.push(new CardCombination(
                CombinationType.Single,
                this.getCardRank(card),
                [card]
            ));
        }

        for (const [value, group] of groups) {
            if (group.length >= 2) {
                for (let i = 0; i < group.length - 1; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        combinations.push(new CardCombination(
                            CombinationType.Pair,
                            this.getCardRank(group[i]),
                            [group[i], group[j]]
                        ));
                    }
                }
            }
        }

        for (const [value, group] of groups) {
            if (group.length >= 3) {
                for (let i = 0; i < group.length - 2; i++) {
                    for (let j = i + 1; j < group.length - 1; j++) {
                        for (let k = j + 1; k < group.length; k++) {
                            combinations.push(new CardCombination(
                                CombinationType.Triple,
                                this.getCardRank(group[i]),
                                [group[i], group[j], group[k]]
                            ));
                        }
                    }
                }
            }
        }

        for (const [value, group] of groups) {
            if (group.length >= 4) {
                combinations.push(new CardCombination(
                    CombinationType.SingleBomb,
                    this.getCardRank(group[0]),
                    group.slice(0, 4)
                ));
            }
        }

        const jokers = sortedCards.filter(card => card.isJoker());
        if (jokers.length >= 2 &&
            jokers[0].getSuit() !== jokers[1].getSuit()) {
            combinations.push(new CardCombination(
                CombinationType.Rocket,
                16,
                [jokers[0], jokers[1]]
            ));
        }
    }

    private addAdvancedCombinations(cards: Card[], combinations: CardCombination[]): void {
        this.addSimpleCombinations(cards, combinations);
        this.addStraightCombinations(cards, combinations);
        this.addSequenceOfPairs(cards, combinations);
        this.addSequenceOfTriples(cards, combinations);
        this.addThreeWithOneCombinations(cards, combinations);
        this.addThreeWithPairCombinations(cards, combinations);
        this.addBombWithAttachments(cards, combinations);
        this.addConsecutiveBombs(cards, combinations);
    }

    private addStraightCombinations(cards: Card[], combinations: CardCombination[]): void {
        const straightCards = cards.filter(card =>
            !card.isJoker() && this.getCardRank(card) < 13
        );

        const uniqueValues = Array.from(new Set(straightCards.map(c => this.getCardRank(c))))
            .sort((a, b) => a - b);

        for (let start = 0; start < uniqueValues.length; start++) {
            for (let end = start + 4; end <= uniqueValues.length; end++) {
                const sequence = uniqueValues.slice(start, end);

                let isValid = true;
                for (let i = 1; i < sequence.length; i++) {
                    if (sequence[i] !== sequence[i - 1] + 1) {
                        isValid = false;
                        break;
                    }
                }

                if (isValid) {
                    const sequenceCards: Card[] = [];
                    for (const value of sequence) {
                        const card = straightCards.find(c => this.getCardRank(c) === value);
                        if (card) sequenceCards.push(card);
                    }

                    if (sequenceCards.length === sequence.length) {
                        combinations.push(new CardCombination(
                            CombinationType.Straight,
                            sequence[sequence.length - 1],
                            sequenceCards
                        ));
                    }
                }
            }
        }
    }

    private addSequenceOfPairs(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);
        const pairValues = Array.from(groups.entries())
            .filter(([_, group]) => group.length >= 2)
            .map(([value]) => this.getCardRank(new Card(value, CardsSuitType.Hearts)))
            .filter(rank => rank < 13)
            .sort((a, b) => a - b);

        for (let start = 0; start < pairValues.length - 2; start++) {
            for (let end = start + 3; end <= pairValues.length; end++) {
                const sequence = pairValues.slice(start, end);

                let isValid = true;
                for (let i = 1; i < sequence.length; i++) {
                    if (sequence[i] !== sequence[i - 1] + 1) {
                        isValid = false;
                        break;
                    }
                }

                if (isValid) {
                    const sequenceCards: Card[] = [];
                    for (const rank of sequence) {
                        const cardsForRank = cards.filter(c => this.getCardRank(c) === rank);
                        if (cardsForRank.length >= 2) {
                            sequenceCards.push(cardsForRank[0], cardsForRank[1]);
                        }
                    }

                    if (sequenceCards.length === sequence.length * 2) {
                        combinations.push(new CardCombination(
                            CombinationType.SequenceOfPairs,
                            sequence[sequence.length - 1],
                            sequenceCards
                        ));
                    }
                }
            }
        }
    }

    private addSequenceOfTriples(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);

        const tripleValues = Array.from(groups.entries())
            .filter(([_, group]) => group.length >= 3)
            .map(([value]) => this.getCardRank(new Card(value, CardsSuitType.Hearts)))
            .filter(rank => rank < 13)
            .sort((a, b) => a - b);

        if (tripleValues.length < 2) return;

        for (let start = 0; start < tripleValues.length - 1; start++) {
            for (let end = start + 2; end <= tripleValues.length; end++) {
                const sequence = tripleValues.slice(start, end);

                let isValid = true;
                for (let i = 1; i < sequence.length; i++) {
                    if (sequence[i] !== sequence[i - 1] + 1) {
                        isValid = false;
                        break;
                    }
                }

                if (!isValid) continue;

                const sequenceCombinations: Card[][][] = [];

                for (const rank of sequence) {
                    const matchingCards = cards.filter(c => this.getCardRank(c) === rank);
                    if (matchingCards.length < 3) {
                        isValid = false;
                        break;
                    }

                    const value = matchingCards[0].getValue();
                    const group = groups.get(value);
                    if (!group || group.length < 3) {
                        isValid = false;
                        break;
                    }

                    const triplesForValue: Card[][] = [];
                    for (let i = 0; i < group.length - 2; i++) {
                        for (let j = i + 1; j < group.length - 1; j++) {
                            for (let k = j + 1; k < group.length; k++) {
                                triplesForValue.push([group[i], group[j], group[k]]);
                            }
                        }
                    }

                    sequenceCombinations.push(triplesForValue);
                }

                if (!isValid || sequenceCombinations.length !== sequence.length) continue;

                this.generateSequenceTripleCombinations(sequenceCombinations, 0, [], combinations, sequence[sequence.length - 1]);
            }
        }
    }

    private generateSequenceTripleCombinations(
        valueTriples: Card[][][],
        index: number,
        current: Card[],
        combinations: CardCombination[],
        highestRank: number
    ): void {
        if (index === valueTriples.length) {
            const cardIds = new Set(current.map(c => `${c.getValue()}-${c.getSuit()}`));
            if (cardIds.size === current.length) {
                combinations.push(new CardCombination(
                    CombinationType.SequenceOfTriples,
                    highestRank,
                    [...current]
                ));
            }
            return;
        }

        for (const triple of valueTriples[index]) {
            const tripleIds = new Set(triple.map(c => `${c.getValue()}-${c.getSuit()}`));
            const currentIds = new Set(current.map(c => `${c.getValue()}-${c.getSuit()}`));

            const hasOverlap = [...tripleIds].some(id => currentIds.has(id));
            if (hasOverlap) continue;

            this.generateSequenceTripleCombinations(
                valueTriples,
                index + 1,
                [...current, ...triple],
                combinations,
                highestRank
            );
        }
    }

    private addThreeWithPairCombinations(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);
        const triples: Array<{value: CardValueType, cards: Card[]}> = [];
        const pairsByValue = new Map<CardValueType, Card[][]>();

        for (const [value, group] of groups) {
            if (group.length >= 3) {
                for (let i = 0; i < group.length - 2; i++) {
                    for (let j = i + 1; j < group.length - 1; j++) {
                        for (let k = j + 1; k < group.length; k++) {
                            triples.push({
                                value: value,
                                cards: [group[i], group[j], group[k]]
                            });
                        }
                    }
                }
            }

            if (group.length >= 2) {
                const valuePairs: Card[][] = [];
                for (let i = 0; i < group.length - 1; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        valuePairs.push([group[i], group[j]]);
                    }
                }
                pairsByValue.set(value, valuePairs);
            }
        }

        for (const triple of triples) {
            for (const [pairValue, pairList] of pairsByValue) {
                if (pairValue === triple.value) continue;

                for (const pair of pairList) {
                    const combinationCards = [...triple.cards, ...pair];
                    combinations.push(new CardCombination(
                        CombinationType.ThreeWithPair,
                        this.getCardRank(triple.cards[0]),
                        combinationCards
                    ));
                }
            }
        }
    }

    private addThreeWithOneCombinations(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);

        for (const [value, group] of groups) {
            if (group.length >= 3) {
                for (let i = 0; i < group.length - 2; i++) {
                    for (let j = i + 1; j < group.length - 1; j++) {
                        for (let k = j + 1; k < group.length; k++) {
                            const triple = [group[i], group[j], group[k]];

                            for (const card of cards) {
                                if (card.getValue() !== value) {
                                    combinations.push(new CardCombination(
                                        CombinationType.ThreeWithOne,
                                        this.getCardRank(group[i]),
                                        [...triple, card]
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private addBombWithAttachments(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);

        for (const [bombValue, bombGroup] of groups) {
            if (bombGroup.length >= 4) {
                for (let i = 0; i < bombGroup.length - 3; i++) {
                    for (let j = i + 1; j < bombGroup.length - 2; j++) {
                        for (let k = j + 1; k < bombGroup.length - 1; k++) {
                            for (let l = k + 1; l < bombGroup.length; l++) {
                                const bomb = [bombGroup[i], bombGroup[j], bombGroup[k], bombGroup[l]];
                                const bombCardIds = new Set(bomb.map(c => `${c.getValue()}-${c.getSuit()}`));

                                const remainingCards = cards.filter(card =>
                                    !bombCardIds.has(`${card.getValue()}-${card.getSuit()}`)
                                );

                                for (const singleCard of remainingCards) {
                                    if (singleCard.getValue() !== bombValue) {
                                        combinations.push(new CardCombination(
                                            CombinationType.BombWithOne,
                                            this.getCardRank(bomb[0]),
                                            [...bomb, singleCard]
                                        ));
                                    }
                                }

                                const remainingGroups = this.groupByValue(remainingCards);
                                const pairValues: CardValueType[] = [];

                                for (const [value, group] of remainingGroups) {
                                    if (value === bombValue) continue;
                                    if (group.length >= 2) {
                                        pairValues.push(value);
                                    }
                                }

                                for (let m = 0; m < pairValues.length - 1; m++) {
                                    for (let n = m + 1; n < pairValues.length; n++) {
                                        const firstValue = pairValues[m];
                                        const secondValue = pairValues[n];

                                        const firstGroup = remainingGroups.get(firstValue)!;
                                        const secondGroup = remainingGroups.get(secondValue)!;

                                        for (let p1 = 0; p1 < firstGroup.length - 1; p1++) {
                                            for (let p2 = p1 + 1; p2 < firstGroup.length; p2++) {
                                                const firstPair = [firstGroup[p1], firstGroup[p2]];

                                                for (let q1 = 0; q1 < secondGroup.length - 1; q1++) {
                                                    for (let q2 = q1 + 1; q2 < secondGroup.length; q2++) {
                                                        const secondPair = [secondGroup[q1], secondGroup[q2]];

                                                        const allCards = [...bomb, ...firstPair, ...secondPair];
                                                        const cardIds = allCards.map(c => `${c.getValue()}-${c.getSuit()}`);
                                                        const uniqueIds = new Set(cardIds);

                                                        if (uniqueIds.size === 8) {
                                                            combinations.push(new CardCombination(
                                                                CombinationType.BombWithTwoPairs,
                                                                this.getCardRank(bomb[0]),
                                                                allCards
                                                            ));
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private addConsecutiveBombs(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);
        const bombs = Array.from(groups.entries())
            .filter(([_, group]) => group.length >= 4)
            .map(([value, group]) => ({
                value,
                rank: this.getCardRank(new Card(value, CardsSuitType.Hearts)),
                cards: group.slice(0, 4)
            }))
            .sort((a, b) => a.rank - b.rank);

        if (bombs.length < 2) return;

        for (let start = 0; start < bombs.length; start++) {
            for (let length = 2; length <= 5; length++) {
                const end = start + length;
                if (end > bombs.length) break;

                const sequence = bombs.slice(start, end);

                let isValid = true;
                for (let i = 1; i < sequence.length; i++) {
                    if (sequence[i].rank !== sequence[i-1].rank + 1) {
                        isValid = false;
                        break;
                    }
                }

                if (isValid) {
                    const bombType = this.getConsecutiveBombType(length);
                    const allCards = sequence.flatMap(b => b.cards);

                    combinations.push(new CardCombination(
                        bombType,
                        sequence[sequence.length - 1].rank,
                        allCards
                    ));
                }
            }
        }
    }

    private getConsecutiveBombType(length: number): CombinationType {
        switch(length) {
            case 2: return CombinationType.DoubleBomb;
            case 3: return CombinationType.TripleBomb;
            case 4: return CombinationType.QuadrupleBomb;
            case 5: return CombinationType.MaxBomb;
            default: return CombinationType.SingleBomb;
        }
    }

    private getSmallestCombination(combinations: CardCombination[]): Card[] | null {
        if (combinations.length === 0) return null;

        const sorted = [...combinations].sort((a, b) => {
            if (!this.isBombType(a.type) && this.isBombType(b.type) && b.type !== CombinationType.Rocket) {
                return -1;
            }
            if (this.isBombType(a.type) && a.type !== CombinationType.Rocket && !this.isBombType(b.type)) {
                return 1;
            }

            if (a.rank !== b.rank) {
                return a.rank - b.rank;
            }

            return a.cards.length - b.cards.length;
        });

        return sorted[0].cards;
    }

    private findSmallestBeatingCombination(
        playerCombinations: CardCombination[],
        tableCombination: CardCombination
    ): Card[] | null {
        const beatingCombinations = playerCombinations.filter(comb =>
            this.isStronger(comb, tableCombination)
        );

        if (beatingCombinations.length === 0) return null;

        const sameType = beatingCombinations.filter(comb => comb.type === tableCombination.type);
        if (sameType.length > 0) {
            return sameType.sort((a, b) => a.rank - b.rank)[0].cards;
        }

        const bombs = beatingCombinations.filter(comb => this.isBombType(comb.type));
        if (bombs.length > 0) {
            return bombs.sort((a, b) => {
                const aStrength = this.getBombStrength(a.type);
                const bStrength = this.getBombStrength(b.type);
                if (aStrength !== bStrength) return aStrength - bStrength;
                return a.rank - b.rank;
            })[0].cards;
        }

        return null;
    }

    private getBombStrength(type: CombinationType): number {
        const strengths: { [key: number]: number } = {
            [CombinationType.SingleBomb]: 1,
            [CombinationType.BombWithOne]: 1,
            [CombinationType.BombWithTwoPairs]: 1,
            [CombinationType.DoubleBomb]: 2,
            [CombinationType.TripleBomb]: 3,
            [CombinationType.QuadrupleBomb]: 4,
            [CombinationType.MaxBomb]: 5,
            [CombinationType.Rocket]: 6,
        };
        return strengths[type] || 0;
    }

    //

    private getCombination(cards: Card[], gameType: number): CardCombination | null {
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

        this.resetPlayerComboState(playerInfo.getId());
    }

    public clearHandlers(): void {
        this.cardsTableHandles = [];
        this.playerComboLevel.clear();
        this.playerComboRound.clear();
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

        this.resetPlayerComboState(playerInfo.getId());
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

    private checkBombCombinations(cards: Card[], gameType: number): CardCombination | null {
        if (gameType == 0) {
            if (cards.length === 4 && this.allSameValue(cards)) {
                return new CardCombination(CombinationType.SingleBomb, this.getCardRank(cards[0]), cards);
            }
        }
        else if (gameType == 1) {
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

    private checkNormalCombinations(cards: Card[], gameType: number): CardCombination | null {
        if (gameType == 0) {
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
        if (gameType == 1) {
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