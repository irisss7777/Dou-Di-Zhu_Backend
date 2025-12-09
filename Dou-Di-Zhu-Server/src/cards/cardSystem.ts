export class CardHolder
{
    private cards: Card[] = [];

    public  initHolder() {
        this.cards.push(new Card(0, 0));
        this.cards.push(new Card(0, 1));
        this.cards.push(new Card(0, 2));
        this.cards.push(new Card(0, 3));

        this.cards.push(new Card(1, 0));
        this.cards.push(new Card(1, 1));
        this.cards.push(new Card(1, 2));
        this.cards.push(new Card(1, 3));

        this.cards.push(new Card(2, 0));
        this.cards.push(new Card(2, 1));
        this.cards.push(new Card(2, 2));
        this.cards.push(new Card(2, 3));

        this.cards.push(new Card(3, 0));
        this.cards.push(new Card(3, 1));
        this.cards.push(new Card(3, 2));
        this.cards.push(new Card(3, 3));

        this.cards.push(new Card(4, 0));
        this.cards.push(new Card(4, 1));
        this.cards.push(new Card(4, 2));
        this.cards.push(new Card(4, 3));

        this.cards.push(new Card(5, 0));
        this.cards.push(new Card(5, 1));
        this.cards.push(new Card(5, 2));
        this.cards.push(new Card(5, 3));

        this.cards.push(new Card(6, 0));
        this.cards.push(new Card(6, 1));
        this.cards.push(new Card(6, 2));
        this.cards.push(new Card(6, 3));

        this.cards.push(new Card(7, 0));
        this.cards.push(new Card(7, 1));
        this.cards.push(new Card(7, 2));
        this.cards.push(new Card(7, 3));

        this.cards.push(new Card(8, 0));
        this.cards.push(new Card(8, 1));
        this.cards.push(new Card(8, 2));
        this.cards.push(new Card(8, 3));

        this.cards.push(new Card(9, 0));
        this.cards.push(new Card(9, 1));
        this.cards.push(new Card(9, 2));
        this.cards.push(new Card(9, 3));

        this.cards.push(new Card(10, 0));
        this.cards.push(new Card(10, 1));
        this.cards.push(new Card(10, 2));
        this.cards.push(new Card(10, 3));

        this.cards.push(new Card(11, 0));
        this.cards.push(new Card(11, 1));
        this.cards.push(new Card(11, 2));
        this.cards.push(new Card(11, 3));

        this.cards.push(new Card(12, 0));
        this.cards.push(new Card(12, 1));
        this.cards.push(new Card(12, 2));
        this.cards.push(new Card(12, 3));

        this.cards.push(new Card(13, 4));
        this.cards.push(new Card(13, 5));
        this.shuffle();
    }

    public getRandomCard(): Card {
        if (this.cards.length === 0) {
            throw new Error("Cards is empty");
        }

        const randomIndex = Math.floor(Math.random() * this.cards.length);
        const card = this.cards[randomIndex];

        this.cards.splice(randomIndex, 1); 

        return card;
    }

    public addCardToHolder(card: Card): void {
        this.cards.push(card);
    }

    public getRemainingCardCount(): number {
        return this.cards.length;
    }

    public getRandomCards(count: number, pairProbability: number): Card[] {
        if (count > this.cards.length) {
            count = this.cards.length;
        }

        const selectedCards: Card[] = [];
        const availableCards = [...this.cards];

        const cardsByValue = new Map<number, Card[]>();
        for (const card of availableCards) {
            if (!cardsByValue.has(card.getValue())) {
                cardsByValue.set(card.getValue(), []);
            }
            cardsByValue.get(card.getValue())!.push(card);
        }

        let i = 0;
        while (i < count && availableCards.length > 0) {
            const shouldGivePair = Math.random() < pairProbability
                && selectedCards.length > 0
                && i < count - 1;

            if (shouldGivePair) {
                const lastCard = selectedCards[selectedCards.length - 1];
                const sameValueCards = cardsByValue.get(lastCard.getValue());

                if (sameValueCards && sameValueCards.length > 0) {
                    const pairCard = sameValueCards.pop()!;
                    selectedCards.push(pairCard);
                    i += 1;

                    const pairIndex = availableCards.findIndex(c =>
                        c.getValue() === pairCard.getValue() && c.getSuit() === pairCard.getSuit());
                    if (pairIndex > -1) {
                        availableCards.splice(pairIndex, 1);
                    }
                    continue;
                }
            }

            const randomIndex = Math.floor(Math.random() * availableCards.length);
            const randomCard = availableCards.splice(randomIndex, 1)[0];
            selectedCards.push(randomCard);
            i += 1;

            const valueCards = cardsByValue.get(randomCard.getValue());
            if (valueCards) {
                const cardIndex = valueCards.findIndex(c =>
                    c.getValue() === randomCard.getValue() && c.getSuit() === randomCard.getSuit());
                if (cardIndex > -1) {
                    valueCards.splice(cardIndex, 1);
                }
            }
        }
        
        for (const card of selectedCards) {
            const index = this.cards.findIndex(c =>
                c.getValue() === card.getValue() && c.getSuit() === card.getSuit());
            if (index > -1) {
                this.cards.splice(index, 1);
            }
        }

        return selectedCards;
    }
    
    public shuffle(): void {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }
}

export class Card {
    private CardValue: CardValueType;
    private CardSuit: CardsSuitType;

    constructor(valueType: CardValueType, suit: CardsSuitType) {
        this.CardValue = valueType;
        this.CardSuit = suit;
    }

    public getValue(): CardValueType {
        return this.CardValue;
    }

    public getSuit(): CardsSuitType {
        return this.CardSuit;
    }

    public getNumericValue(): number {
        return this.CardValue;
    }

    public isJoker(): boolean {
        return this.CardValue === CardValueType.Joker;
    }

    public isTwo(): boolean {
        return this.CardValue === CardValueType.Two;
    }
}

export enum CardValueType {
    Three = 0,
    Four = 1,
    Five = 2,
    Six = 3,
    Seven = 4,
    Eight = 5,
    Nine = 6,
    Ten = 7,
    Jack = 8,
    Queen = 9,
    King = 10,
    Ace = 11,
    Two = 12,
    Joker = 13
}

export enum CardsSuitType {
    Hearts = 0,
    Diamonds = 1,
    Spades = 2,
    Clubs = 3,
    Black = 4,
    Red = 5
}