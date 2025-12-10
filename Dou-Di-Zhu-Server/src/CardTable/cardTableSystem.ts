import { Card, CardValueType, CardsSuitType } from "../cards/cardSystem";
import { PlayerInfo } from "../lobby/lobby";
import { logger } from "../utils/logger";

export class CardTable {
    private cardsTableHandles: CardTableHandle[] = [];
    private combinationCache = new Map<string, CardCombination[]>();
    private playerComboState = new Map<string, number>(); // 0: минимальная, 1: тройка, 2: бомба, 3: ракета

    public getCachedCombinationsForPlayer(playerInfo: PlayerInfo, gameType: number): CardCombination[] {
        const cards = playerInfo.getAllCards();
        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));
        return this.getCachedCombinations(sortedCards, gameType);
    }

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

    public hasValidCombination(cards: Card[], playerInfo: PlayerInfo, gameType: number): Card[] | null {
        if (!cards.length) return null;

        const playerId = playerInfo.getId();
        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));

        const allCombinations = this.getCachedCombinations(sortedCards, gameType);
        if (allCombinations.length === 0) return null;

        // Получаем текущее состояние для игрока
        let comboState = this.playerComboState.get(playerId) || 0;

        // Определяем самую сильную комбинацию на столе
        let strongestTableCombination: CardCombination | null = null;
        for (const handle of this.cardsTableHandles) {
            if (handle.getPlayerInfo().getId() === playerId) continue;

            const comb = this.getCombination(handle.getCards(), gameType);
            if (!comb) continue;

            if (strongestTableCombination === null || this.isStronger(comb, strongestTableCombination)) {
                strongestTableCombination = comb;
            }
        }

        // В зависимости от состояния выбираем комбинацию
        let result: Card[] | null = null;

        // Всегда пытаемся сначала найти подходящую комбинацию текущего типа
        switch (comboState) {
            case 0: // Минимальная подходящая комбинация
                result = this.findMinimalSuitableCombination(allCombinations, strongestTableCombination);
                break;

            case 1: // Тройка
                result = this.findTripleCombination(allCombinations, strongestTableCombination);
                break;

            case 2: // Бомба
                result = this.findBombCombination(allCombinations, strongestTableCombination);
                break;

            case 3: // Ракета
                result = this.findRocketCombination(allCombinations, strongestTableCombination);
                break;
        }

        // Если для текущего состояния не нашли комбинацию, пробуем следующие типы по порядку
        if (!result) {
            for (let nextState = (comboState + 1) % 4; nextState !== comboState; nextState = (nextState + 1) % 4) {
                let nextResult: Card[] | null = null;

                switch (nextState) {
                    case 0:
                        nextResult = this.findMinimalSuitableCombination(allCombinations, strongestTableCombination);
                        break;
                    case 1:
                        nextResult = this.findTripleCombination(allCombinations, strongestTableCombination);
                        break;
                    case 2:
                        nextResult = this.findBombCombination(allCombinations, strongestTableCombination);
                        break;
                    case 3:
                        nextResult = this.findRocketCombination(allCombinations, strongestTableCombination);
                        break;
                }

                if (nextResult) {
                    result = nextResult;
                    comboState = nextState;
                    break;
                }
            }
        }

        // Если нашли комбинацию, обновляем состояние для следующего вызова
        if (result) {
            // Переходим к следующему состоянию (циклически)
            const nextComboState = (comboState + 1) % 4;
            this.playerComboState.set(playerId, nextComboState);
            return result;
        }

        return null;
    }

    private findMinimalSuitableCombination(combinations: CardCombination[], tableCombination: CardCombination | null): Card[] | null {
        // Фильтруем комбинации, которые могут быть сыграны
        const suitableCombinations = combinations.filter(comb =>
            !tableCombination || this.isStronger(comb, tableCombination)
        );

        if (suitableCombinations.length === 0) return null;

        // Находим минимальную по силе комбинацию
        return suitableCombinations.sort((a, b) => {
            // Не-бомбы приоритетнее бомб (кроме ракеты)
            const aIsBomb = this.isBombType(a.type);
            const bIsBomb = this.isBombType(b.type);

            if (!aIsBomb && bIsBomb && b.type !== CombinationType.Rocket) {
                return -1;
            }
            if (aIsBomb && a.type !== CombinationType.Rocket && !bIsBomb) {
                return 1;
            }

            // Если обе бомбы, сравниваем по силе бомбы
            if (aIsBomb && bIsBomb) {
                const aStrength = this.getBombStrength(a.type);
                const bStrength = this.getBombStrength(b.type);
                if (aStrength !== bStrength) return aStrength - bStrength;
            }

            // Сравниваем по рангу
            if (a.rank !== b.rank) {
                return a.rank - b.rank;
            }

            // Затем по количеству карт
            return a.cards.length - b.cards.length;
        })[0].cards;
    }

    private findTripleCombination(combinations: CardCombination[], tableCombination: CardCombination | null): Card[] | null {
        // Ищем тройки
        const tripleCombinations = combinations.filter(comb => {
            const isTripleType =
                comb.type === CombinationType.Triple ||
                comb.type === CombinationType.ThreeWithOne ||
                comb.type === CombinationType.ThreeWithPair ||
                comb.type === CombinationType.SequenceOfTriples ||
                comb.type === CombinationType.TwoTriplesWithTwo ||
                comb.type === CombinationType.TwoTriplesWithTwoPairs;

            return isTripleType && (!tableCombination || this.isStronger(comb, tableCombination));
        });

        if (tripleCombinations.length === 0) return null;

        // Находим минимальную тройку
        return tripleCombinations.sort((a, b) => a.rank - b.rank)[0].cards;
    }

    private findBombCombination(combinations: CardCombination[], tableCombination: CardCombination | null): Card[] | null {
        // Ищем бомбы (все типы бомб кроме ракеты)
        const bombCombinations = combinations.filter(comb =>
            this.isBombType(comb.type) &&
            comb.type !== CombinationType.Rocket &&
            (!tableCombination || this.isStronger(comb, tableCombination))
        );

        if (bombCombinations.length === 0) return null;

        // Находим минимальную бомбу
        return bombCombinations.sort((a, b) => {
            const aStrength = this.getBombStrength(a.type);
            const bStrength = this.getBombStrength(b.type);
            if (aStrength !== bStrength) return aStrength - bStrength;
            return a.rank - b.rank;
        })[0].cards;
    }

    private findRocketCombination(combinations: CardCombination[], tableCombination: CardCombination | null): Card[] | null {
        // Ищем ракету
        const rocketCombinations = combinations.filter(comb =>
            comb.type === CombinationType.Rocket &&
            (!tableCombination || this.isStronger(comb, tableCombination))
        );

        if (rocketCombinations.length === 0) return null;

        return rocketCombinations[0].cards;
    }

    // Сброс состояния для игрока
    public resetPlayerComboState(playerId: string): void {
        this.playerComboState.delete(playerId);
    }

    private getCachedCombinations(cards: Card[], gameType: number): CardCombination[] {
        // Создаем уникальный ключ для кэша
        const key = cards
            .map(c => `${this.getCardRank(c)}-${c.getValue()}-${c.getSuit()}`)
            .sort()
            .join('|') + `|${gameType}`;

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
            this.addSimpleCombinations(cards, combinations);
            this.addAdvancedCombinations(cards, combinations);
        }

        return combinations;
    }

    private addSimpleCombinations(cards: Card[], combinations: CardCombination[]): void {
        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));
        const groups = this.groupByValue(sortedCards);

        // Одиночные карты
        for (const card of sortedCards) {
            combinations.push(new CardCombination(
                CombinationType.Single,
                this.getCardRank(card),
                [card]
            ));
        }

        // Пары
        for (const group of groups.values()) {
            if (group.length >= 2) {
                for (let i = 0; i < group.length; i++) {
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

        // Тройки
        for (const group of groups.values()) {
            if (group.length >= 3) {
                for (let i = 0; i < group.length; i++) {
                    for (let j = i + 1; j < group.length; j++) {
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

        // Бомбы из 4 карт
        for (const group of groups.values()) {
            if (group.length >= 4) {
                for (let i = 0; i <= group.length - 4; i++) {
                    const bombCards = group.slice(i, i + 4);
                    combinations.push(new CardCombination(
                        CombinationType.SingleBomb,
                        this.getCardRank(bombCards[0]),
                        bombCards
                    ));
                }
            }
        }

        // Ракета
        const jokers = sortedCards.filter(card => card.isJoker());
        if (jokers.length >= 2) {
            const blackJoker = jokers.find(j => j.getSuit() === CardsSuitType.Black);
            const redJoker = jokers.find(j => j.getSuit() === CardsSuitType.Red);
            if (blackJoker && redJoker) {
                combinations.push(new CardCombination(
                    CombinationType.Rocket,
                    16,
                    [blackJoker, redJoker]
                ));
            }
        }
    }

    private addAdvancedCombinations(cards: Card[], combinations: CardCombination[]): void {
        this.addStraightCombinations(cards, combinations);
        this.addSequenceOfPairs(cards, combinations);
        this.addSequenceOfTriples(cards, combinations);
        this.addThreeWithOneCombinations(cards, combinations);
        this.addThreeWithPairCombinations(cards, combinations);
        this.addBombWithAttachments(cards, combinations);
        this.addConsecutiveBombs(cards, combinations);
    }

    private addStraightCombinations(cards: Card[], combinations: CardCombination[]): void {
        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));

        // Фильтруем карты, которые не могут быть в стрите (джокеры и 2)
        const validStraightCards = sortedCards.filter(card =>
            !card.isJoker() && this.getCardRank(card) < 13
        );

        // Убираем дубликаты по рангу
        const uniqueByRank = new Map<number, Card>();
        for (const card of validStraightCards) {
            const rank = this.getCardRank(card);
            if (!uniqueByRank.has(rank)) {
                uniqueByRank.set(rank, card);
            }
        }

        const uniqueCards = Array.from(uniqueByRank.values())
            .sort((a, b) => this.getCardRank(a) - this.getCardRank(b));

        // Ищем последовательности от 5 карт и более
        for (let i = 0; i < uniqueCards.length; i++) {
            for (let j = i + 4; j <= uniqueCards.length; j++) {
                const sequence = uniqueCards.slice(i, j);
                const ranks = sequence.map(c => this.getCardRank(c));

                // Проверяем, что последовательность непрерывна
                let isValid = true;
                for (let k = 1; k < ranks.length; k++) {
                    if (ranks[k] !== ranks[k-1] + 1) {
                        isValid = false;
                        break;
                    }
                }

                if (isValid) {
                    combinations.push(new CardCombination(
                        CombinationType.Straight,
                        ranks[ranks.length - 1],
                        sequence
                    ));
                }
            }
        }
    }

    private addSequenceOfPairs(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);

        // Ищем значения, которые имеют хотя бы 2 карты
        const pairValues: number[] = [];
        for (const [value, group] of groups) {
            if (group.length >= 2 && !this.isJokerValue(value)) {
                const rank = this.getCardRank(group[0]);
                if (rank < 13) { // Исключаем 2 и джокеров
                    pairValues.push(rank);
                }
            }
        }

        pairValues.sort((a, b) => a - b);

        // Ищем последовательности пар
        for (let i = 0; i < pairValues.length - 2; i++) { // Минимум 3 пары
            for (let j = i + 3; j <= pairValues.length; j++) {
                const sequence = pairValues.slice(i, j);

                // Проверяем непрерывность
                let isValid = true;
                for (let k = 1; k < sequence.length; k++) {
                    if (sequence[k] !== sequence[k-1] + 1) {
                        isValid = false;
                        break;
                    }
                }

                if (!isValid) continue;

                // Собираем карты для комбинации
                const sequenceCards: Card[] = [];
                for (const rank of sequence) {
                    const cardsForRank = cards.filter(c => this.getCardRank(c) === rank);
                    if (cardsForRank.length >= 2) {
                        // Берем первые 2 карты этого значения
                        sequenceCards.push(cardsForRank[0], cardsForRank[1]);
                    } else {
                        isValid = false;
                        break;
                    }
                }

                if (isValid && sequenceCards.length === sequence.length * 2) {
                    combinations.push(new CardCombination(
                        CombinationType.SequenceOfPairs,
                        sequence[sequence.length - 1],
                        sequenceCards
                    ));
                }
            }
        }
    }

    private addSequenceOfTriples(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);

        // Ищем значения, которые имеют хотя бы 3 карты
        const tripleValues: number[] = [];
        for (const [value, group] of groups) {
            if (group.length >= 3 && !this.isJokerValue(value)) {
                const rank = this.getCardRank(group[0]);
                if (rank < 13) { // Исключаем 2 и джокеров
                    tripleValues.push(rank);
                }
            }
        }

        tripleValues.sort((a, b) => a - b);

        // Ищем последовательности троек (минимум 2 тройки)
        for (let i = 0; i < tripleValues.length - 1; i++) {
            for (let j = i + 2; j <= tripleValues.length; j++) {
                const sequence = tripleValues.slice(i, j);

                // Проверяем непрерывность
                let isValid = true;
                for (let k = 1; k < sequence.length; k++) {
                    if (sequence[k] !== sequence[k-1] + 1) {
                        isValid = false;
                        break;
                    }
                }

                if (!isValid) continue;

                // Собираем карты для комбинации
                const sequenceCards: Card[] = [];
                for (const rank of sequence) {
                    const cardsForRank = cards.filter(c => this.getCardRank(c) === rank);
                    if (cardsForRank.length >= 3) {
                        // Берем первые 3 карты этого значения
                        sequenceCards.push(cardsForRank[0], cardsForRank[1], cardsForRank[2]);
                    } else {
                        isValid = false;
                        break;
                    }
                }

                if (isValid && sequenceCards.length === sequence.length * 3) {
                    combinations.push(new CardCombination(
                        CombinationType.SequenceOfTriples,
                        sequence[sequence.length - 1],
                        sequenceCards
                    ));
                }
            }
        }
    }

    private addThreeWithOneCombinations(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);
        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));

        // Ищем тройки
        const triples: Card[][] = [];
        for (const group of groups.values()) {
            if (group.length >= 3) {
                // Генерируем все возможные тройки из этой группы
                for (let i = 0; i < group.length - 2; i++) {
                    for (let j = i + 1; j < group.length - 1; j++) {
                        for (let k = j + 1; k < group.length; k++) {
                            triples.push([group[i], group[j], group[k]]);
                        }
                    }
                }
            }
        }

        // Комбинируем каждую тройку с каждой одиночной картой другого значения
        for (const triple of triples) {
            const tripleRank = this.getCardRank(triple[0]);
            const tripleValue = triple[0].getValue();

            for (const card of sortedCards) {
                if (card.getValue() !== tripleValue) {
                    combinations.push(new CardCombination(
                        CombinationType.ThreeWithOne,
                        tripleRank,
                        [...triple, card]
                    ));
                }
            }
        }
    }

    private addThreeWithPairCombinations(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);

        // Ищем тройки
        const triples: Card[][] = [];
        for (const group of groups.values()) {
            if (group.length >= 3) {
                for (let i = 0; i < group.length - 2; i++) {
                    for (let j = i + 1; j < group.length - 1; j++) {
                        for (let k = j + 1; k < group.length; k++) {
                            triples.push([group[i], group[j], group[k]]);
                        }
                    }
                }
            }
        }

        // Ищем пары
        const pairs: Card[][] = [];
        for (const group of groups.values()) {
            if (group.length >= 2) {
                for (let i = 0; i < group.length - 1; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        pairs.push([group[i], group[j]]);
                    }
                }
            }
        }

        // Комбинируем тройки с парами другого значения
        for (const triple of triples) {
            const tripleValue = triple[0].getValue();
            const tripleRank = this.getCardRank(triple[0]);

            for (const pair of pairs) {
                if (pair[0].getValue() !== tripleValue) {
                    combinations.push(new CardCombination(
                        CombinationType.ThreeWithPair,
                        tripleRank,
                        [...triple, ...pair]
                    ));
                }
            }
        }
    }

    private addBombWithAttachments(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);

        // Ищем бомбы (4 карты одного значения)
        const bombs: Card[][] = [];
        for (const group of groups.values()) {
            if (group.length >= 4) {
                for (let i = 0; i <= group.length - 4; i++) {
                    bombs.push(group.slice(i, i + 4));
                }
            }
        }

        // Для каждой бомбы ищем дополнения
        for (const bomb of bombs) {
            const bombValue = bomb[0].getValue();
            const bombRank = this.getCardRank(bomb[0]);

            // Ищем одиночные карты для BombWithOne
            for (const card of cards) {
                if (card.getValue() !== bombValue) {
                    combinations.push(new CardCombination(
                        CombinationType.BombWithOne,
                        bombRank,
                        [...bomb, card]
                    ));
                }
            }

            // Ищем две пары для BombWithTwoPairs
            const pairs = this.findAllPairs(cards);
            for (let i = 0; i < pairs.length; i++) {
                const pair1 = pairs[i];
                if (pair1[0].getValue() === bombValue) continue;

                for (let j = i + 1; j < pairs.length; j++) {
                    const pair2 = pairs[j];
                    if (pair2[0].getValue() === bombValue ||
                        pair2[0].getValue() === pair1[0].getValue()) continue;

                    // Проверяем, что все карты уникальны
                    const allCards = [...bomb, ...pair1, ...pair2];
                    const cardIds = new Set(allCards.map(c => `${c.getValue()}-${c.getSuit()}`));
                    if (cardIds.size === 8) {
                        combinations.push(new CardCombination(
                            CombinationType.BombWithTwoPairs,
                            bombRank,
                            allCards
                        ));
                    }
                }
            }
        }
    }

    private findAllPairs(cards: Card[]): Card[][] {
        const pairs: Card[][] = [];
        const groups = this.groupByValue(cards);

        for (const group of groups.values()) {
            if (group.length >= 2) {
                for (let i = 0; i < group.length - 1; i++) {
                    for (let j = i + 1; j < group.length; j++) {
                        pairs.push([group[i], group[j]]);
                    }
                }
            }
        }

        return pairs;
    }

    private addConsecutiveBombs(cards: Card[], combinations: CardCombination[]): void {
        const groups = this.groupByValue(cards);

        // Ищем значения, которые имеют хотя бы 4 карты
        const bombValues: number[] = [];
        const bombCardsByRank = new Map<number, Card[]>();

        for (const [value, group] of groups) {
            if (group.length >= 4 && !this.isJokerValue(value)) {
                const rank = this.getCardRank(group[0]);
                if (rank < 13) { // Исключаем 2
                    bombValues.push(rank);
                    bombCardsByRank.set(rank, group.slice(0, 4)); // Берем первые 4 карты
                }
            }
        }

        bombValues.sort((a, b) => a - b);

        // Ищем последовательные бомбы (от 2 до 5 подряд)
        for (let length = 2; length <= 5; length++) {
            for (let i = 0; i <= bombValues.length - length; i++) {
                const sequence = bombValues.slice(i, i + length);

                // Проверяем, что последовательность непрерывна
                let isValid = true;
                for (let j = 1; j < sequence.length; j++) {
                    if (sequence[j] !== sequence[j-1] + 1) {
                        isValid = false;
                        break;
                    }
                }

                if (!isValid) continue;

                // Собираем карты для комбинации
                const bombCards: Card[] = [];
                for (const rank of sequence) {
                    const cardsForBomb = bombCardsByRank.get(rank);
                    if (cardsForBomb) {
                        bombCards.push(...cardsForBomb);
                    } else {
                        isValid = false;
                        break;
                    }
                }

                if (isValid) {
                    const bombType = this.getConsecutiveBombType(length);
                    combinations.push(new CardCombination(
                        bombType,
                        sequence[sequence.length - 1],
                        bombCards
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

    private isJokerValue(value: CardValueType): boolean {
        return value === CardValueType.BlackJoker || value === CardValueType.RedJoker;
    }

    public getCombination(cards: Card[], gameType: number): CardCombination | null {
        if (cards.length === 0) return null;

        const sortedCards = [...cards].sort((a, b) => this.getCardRank(a) - this.getCardRank(b));

        // Проверяем ракету
        if (this.isRocket(sortedCards)) {
            return new CardCombination(CombinationType.Rocket, 16, sortedCards);
        }

        // Проверяем бомбы
        const bomb = this.checkBombCombinations(sortedCards, gameType);
        if (bomb) return bomb;

        // Проверяем обычные комбинации
        return this.checkNormalCombinations(sortedCards, gameType);
    }

    public getCombinationFromTableCards(tableCards: TableCard[], gameType: number): CardCombination | null {
        const cards = tableCards.map(cardData =>
            new Card(cardData.value, cardData.suit)
        );
        return this.getCombination(cards, gameType);
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
        this.playerComboState.clear();
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

    public isStronger(newComb: CardCombination, existingComb: CardCombination): boolean {
        // Ракета бьет всё
        if (newComb.type === CombinationType.Rocket) return true;
        if (existingComb.type === CombinationType.Rocket) return false;

        // Бомба бьет не-бомбу
        const newIsBomb = this.isBombType(newComb.type);
        const existingIsBomb = this.isBombType(existingComb.type);

        if (newIsBomb && !existingIsBomb) return true;
        if (!newIsBomb && existingIsBomb) return false;

        // Если обе бомбы
        if (newIsBomb && existingIsBomb) {
            return this.compareBombs(newComb, existingComb);
        }

        // Обычные комбинации должны быть одного типа
        if (newComb.type !== existingComb.type) return false;

        // Для последовательностей проверяем одинаковую длину
        if (this.isSequenceType(newComb.type)) {
            if (newComb.cards.length !== existingComb.cards.length) return false;
        }

        // Сравниваем по рангу
        return newComb.rank > existingComb.rank;
    }

    private getCardRank(card: Card): number {
        if (card.isJoker()) {
            return card.getSuit() === CardsSuitType.Black ? 15 : 16;
        }

        const numericValue = card.getNumericValue();
        // Преобразуем значение: 3=1, 4=2, ..., K=11, A=12, 2=13
        if (numericValue >= 3 && numericValue <= 13) {
            return numericValue - 2;
        } else if (numericValue === 1) { // A
            return 12;
        } else if (numericValue === 2) { // 2
            return 13;
        }

        return 0;
    }

    private isRocket(cards: Card[]): boolean {
        if (cards.length !== 2) return false;

        const hasBlackJoker = cards.some(c =>
            c.isJoker() && c.getSuit() === CardsSuitType.Black
        );
        const hasRedJoker = cards.some(c =>
            c.isJoker() && c.getSuit() === CardsSuitType.Red
        );

        return hasBlackJoker && hasRedJoker;
    }

    private checkBombCombinations(cards: Card[], gameType: number): CardCombination | null {
        if (cards.length === 4 && this.allSameValue(cards)) {
            return new CardCombination(CombinationType.SingleBomb, this.getCardRank(cards[0]), cards);
        }

        if (gameType === 1) {
            // BombWithOne (5 карт: 4 одинаковых + 1 любая)
            if (cards.length === 5) {
                const groups = this.groupByValue(cards);
                for (const group of groups.values()) {
                    if (group.length === 4) {
                        return new CardCombination(
                            CombinationType.BombWithOne,
                            this.getCardRank(group[0]),
                            cards
                        );
                    }
                }
            }

            // BombWithTwoPairs (8 карт: 4 одинаковых + 2 пары разных значений)
            if (cards.length === 8) {
                const groups = this.groupByValue(cards);
                let bombGroup: Card[] | null = null;
                const pairs: Card[][] = [];

                for (const group of groups.values()) {
                    if (group.length === 4) {
                        bombGroup = group;
                    } else if (group.length === 2) {
                        pairs.push(group);
                    }
                }

                if (bombGroup && pairs.length === 2) {
                    return new CardCombination(
                        CombinationType.BombWithTwoPairs,
                        this.getCardRank(bombGroup[0]),
                        cards
                    );
                }
            }

            // Последовательные бомбы
            if (cards.length % 4 === 0 && cards.length >= 8) {
                const groups = this.groupByValue(cards);
                const bombRanks: number[] = [];

                // Проверяем, что все группы по 4 карты
                for (const group of groups.values()) {
                    if (group.length !== 4) return null;
                    bombRanks.push(this.getCardRank(group[0]));
                }

                bombRanks.sort((a, b) => a - b);

                // Проверяем, что ранги идут последовательно
                for (let i = 1; i < bombRanks.length; i++) {
                    if (bombRanks[i] !== bombRanks[i-1] + 1) {
                        return null;
                    }
                }

                const bombType = this.getConsecutiveBombType(bombRanks.length);
                return new CardCombination(
                    bombType,
                    bombRanks[bombRanks.length - 1],
                    cards
                );
            }
        }

        return null;
    }

    private checkNormalCombinations(cards: Card[], gameType: number): CardCombination | null {
        // Одиночная карта
        if (cards.length === 1) {
            return new CardCombination(CombinationType.Single, this.getCardRank(cards[0]), cards);
        }

        // Пара
        if (cards.length === 2 && this.allSameValue(cards)) {
            return new CardCombination(CombinationType.Pair, this.getCardRank(cards[0]), cards);
        }

        // Тройка
        if (cards.length === 3 && this.allSameValue(cards)) {
            return new CardCombination(CombinationType.Triple, this.getCardRank(cards[0]), cards);
        }

        if (gameType === 1) {
            // ThreeWithOne
            if (cards.length === 4) {
                const groups = this.groupByValue(cards);
                let tripleGroup: Card[] | null = null;
                let singleCard: Card | null = null;

                for (const group of groups.values()) {
                    if (group.length === 3) {
                        tripleGroup = group;
                    } else if (group.length === 1) {
                        singleCard = group[0];
                    }
                }

                if (tripleGroup && singleCard) {
                    return new CardCombination(
                        CombinationType.ThreeWithOne,
                        this.getCardRank(tripleGroup[0]),
                        cards
                    );
                }
            }

            // ThreeWithPair
            if (cards.length === 5) {
                const groups = this.groupByValue(cards);
                let tripleGroup: Card[] | null = null;
                let pairGroup: Card[] | null = null;

                for (const group of groups.values()) {
                    if (group.length === 3) {
                        tripleGroup = group;
                    } else if (group.length === 2) {
                        pairGroup = group;
                    }
                }

                if (tripleGroup && pairGroup) {
                    return new CardCombination(
                        CombinationType.ThreeWithPair,
                        this.getCardRank(tripleGroup[0]),
                        cards
                    );
                }
            }

            // Straight
            if (cards.length >= 5) {
                if (this.isStraight(cards)) {
                    return new CardCombination(
                        CombinationType.Straight,
                        this.getCardRank(cards[cards.length - 1]),
                        cards
                    );
                }
            }

            // SequenceOfPairs
            if (cards.length >= 6 && cards.length % 2 === 0) {
                if (this.isSequenceOfPairs(cards)) {
                    return new CardCombination(
                        CombinationType.SequenceOfPairs,
                        this.getCardRank(cards[cards.length - 1]),
                        cards
                    );
                }
            }

            // SequenceOfTriples
            if (cards.length >= 6 && cards.length % 3 === 0) {
                if (this.isSequenceOfTriples(cards)) {
                    return new CardCombination(
                        CombinationType.SequenceOfTriples,
                        this.getCardRank(cards[cards.length - 1]),
                        cards
                    );
                }
            }

            // TwoTriplesWithTwo
            if (cards.length === 8) {
                const groups = this.groupByValue(cards);
                const triples: Card[][] = [];
                const singles: Card[] = [];

                for (const group of groups.values()) {
                    if (group.length === 3) {
                        triples.push(group);
                    } else if (group.length === 1) {
                        singles.push(group[0]);
                    }
                }

                if (triples.length === 2 && singles.length === 2) {
                    return new CardCombination(
                        CombinationType.TwoTriplesWithTwo,
                        Math.max(...triples.map(t => this.getCardRank(t[0]))),
                        cards
                    );
                }
            }

            // TwoTriplesWithTwoPairs
            if (cards.length === 10) {
                const groups = this.groupByValue(cards);
                const triples: Card[][] = [];
                const pairs: Card[][] = [];

                for (const group of groups.values()) {
                    if (group.length === 3) {
                        triples.push(group);
                    } else if (group.length === 2) {
                        pairs.push(group);
                    }
                }

                if (triples.length === 2 && pairs.length === 2) {
                    return new CardCombination(
                        CombinationType.TwoTriplesWithTwoPairs,
                        Math.max(...triples.map(t => this.getCardRank(t[0]))),
                        cards
                    );
                }
            }
        }

        return null;
    }

    private allSameValue(cards: Card[]): boolean {
        if (cards.length === 0) return false;
        const firstValue = cards[0].getValue();
        return cards.every(card => card.getValue() === firstValue);
    }

    private isStraight(cards: Card[]): boolean {
        if (cards.length < 5) return false;

        const ranks = cards.map(c => this.getCardRank(c));

        // Проверяем, что нет дубликатов
        const uniqueRanks = new Set(ranks);
        if (uniqueRanks.size !== cards.length) return false;

        // Проверяем, что все карты не являются джокерами или двойками
        if (cards.some(c => c.isJoker() || this.getCardRank(c) >= 13)) {
            return false;
        }

        // Сортируем ранги
        ranks.sort((a, b) => a - b);

        // Проверяем непрерывность
        for (let i = 1; i < ranks.length; i++) {
            if (ranks[i] !== ranks[i-1] + 1) {
                return false;
            }
        }

        return true;
    }

    private isSequenceOfPairs(cards: Card[]): boolean {
        if (cards.length < 6 || cards.length % 2 !== 0) return false;

        const groups = this.groupByValue(cards);

        // Проверяем, что все группы по 2 карты
        if (Array.from(groups.values()).some(group => group.length !== 2)) {
            return false;
        }

        // Получаем ранги пар
        const pairRanks = Array.from(groups.keys())
            .map(value => {
                const card = groups.get(value)![0];
                return this.getCardRank(card);
            })
            .sort((a, b) => a - b);

        // Проверяем, что нет джокеров и двоек
        if (pairRanks.some(rank => rank >= 13)) {
            return false;
        }

        // Проверяем непрерывность
        for (let i = 1; i < pairRanks.length; i++) {
            if (pairRanks[i] !== pairRanks[i-1] + 1) {
                return false;
            }
        }

        return true;
    }

    private isSequenceOfTriples(cards: Card[]): boolean {
        if (cards.length < 6 || cards.length % 3 !== 0) return false;

        const groups = this.groupByValue(cards);

        // Проверяем, что все группы по 3 карты
        if (Array.from(groups.values()).some(group => group.length !== 3)) {
            return false;
        }

        // Получаем ранги троек
        const tripleRanks = Array.from(groups.keys())
            .map(value => {
                const card = groups.get(value)![0];
                return this.getCardRank(card);
            })
            .sort((a, b) => a - b);

        // Проверяем, что нет джокеров и двоек
        if (tripleRanks.some(rank => rank >= 13)) {
            return false;
        }

        // Проверяем непрерывность
        for (let i = 1; i < tripleRanks.length; i++) {
            if (tripleRanks[i] !== tripleRanks[i-1] + 1) {
                return false;
            }
        }

        return true;
    }

    private groupByValue(cards: Card[]): Map<CardValueType, Card[]> {
        const groups = new Map<CardValueType, Card[]>();
        for (const card of cards) {
            const value = card.getValue();
            if (!groups.has(value)) {
                groups.set(value, []);
            }
            groups.get(value)!.push(card);
        }
        return groups;
    }

    private isBombType(type: CombinationType): boolean {
        return [
            CombinationType.SingleBomb,
            CombinationType.BombWithOne,
            CombinationType.BombWithTwoPairs,
            CombinationType.DoubleBomb,
            CombinationType.TripleBomb,
            CombinationType.QuadrupleBomb,
            CombinationType.MaxBomb
        ].includes(type);
    }

    private isSequenceType(type: CombinationType): boolean {
        return [
            CombinationType.Straight,
            CombinationType.SequenceOfPairs,
            CombinationType.SequenceOfTriples
        ].includes(type);
    }

    private compareBombs(newComb: CardCombination, existingComb: CardCombination): boolean {
        const newStrength = this.getBombStrength(newComb.type);
        const existingStrength = this.getBombStrength(existingComb.type);

        if (newStrength > existingStrength) return true;
        if (newStrength < existingStrength) return false;

        // При равной силе сравниваем по рангу
        return newComb.rank > existingComb.rank;
    }

    private getBombStrength(type: CombinationType): number {
        switch(type) {
            case CombinationType.SingleBomb:
            case CombinationType.BombWithOne:
            case CombinationType.BombWithTwoPairs:
                return 1;
            case CombinationType.DoubleBomb:
                return 2;
            case CombinationType.TripleBomb:
                return 3;
            case CombinationType.QuadrupleBomb:
                return 4;
            case CombinationType.MaxBomb:
                return 5;
            case CombinationType.Rocket:
                return 6;
            default:
                return 0;
        }
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