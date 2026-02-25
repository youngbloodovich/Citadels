package engine

import "math/rand/v2"

// Deck is a stack of district cards.
type Deck struct {
	cards []District
}

// NewDeck creates a shuffled deck from the given cards.
func NewDeck(cards []District) *Deck {
	d := &Deck{cards: make([]District, len(cards))}
	copy(d.cards, cards)
	d.Shuffle()
	return d
}

func (d *Deck) Shuffle() {
	rand.Shuffle(len(d.cards), func(i, j int) {
		d.cards[i], d.cards[j] = d.cards[j], d.cards[i]
	})
}

// Draw removes and returns the top n cards. Returns fewer if deck is short.
func (d *Deck) Draw(n int) []District {
	if n > len(d.cards) {
		n = len(d.cards)
	}
	drawn := make([]District, n)
	copy(drawn, d.cards[:n])
	d.cards = d.cards[n:]
	return drawn
}

// Return puts cards back at the bottom of the deck.
func (d *Deck) Return(cards []District) {
	d.cards = append(d.cards, cards...)
}

// Len returns the number of cards remaining.
func (d *Deck) Len() int {
	return len(d.cards)
}

// Peek returns top n cards without removing them.
func (d *Deck) Peek(n int) []District {
	if n > len(d.cards) {
		n = len(d.cards)
	}
	out := make([]District, n)
	copy(out, d.cards[:n])
	return out
}
