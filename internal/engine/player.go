package engine

// Player holds one player's state.
type Player struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	Gold       int           `json:"gold"`
	Hand       []District    `json:"hand"`
	City       []District    `json:"city"`
	Characters []CharacterRole `json:"characters"` // assigned this round (usually 1, 2 for 2-3 players)
	HasCrown   bool          `json:"has_crown"`

	// Per-turn state (reset each character turn)
	Murdered   bool `json:"-"` // killed by assassin this round
	Robbed     bool `json:"-"` // robbed by thief this round
	BuiltCount  int  `json:"-"` // districts built this turn
	TookAction  bool `json:"-"` // took gold/drew cards this turn
	UsedAbility bool `json:"-"` // used character ability this turn
	UsedLab     bool `json:"-"` // used Laboratory this turn
	UsedSmithy  bool `json:"-"` // used Smithy this turn
}

func NewPlayer(id, name string) *Player {
	return &Player{
		ID:   id,
		Name: name,
		Gold: 2,
	}
}

// CityHas returns true if the player has built a district with the given name.
func (p *Player) CityHas(name string) bool {
	for _, d := range p.City {
		if d.Name == name {
			return true
		}
	}
	return false
}

// CityColorCount counts districts of a given color in the city.
func (p *Player) CityColorCount(color DistrictColor) int {
	n := 0
	for _, d := range p.City {
		if d.Color == color {
			n++
		}
		// School of Magic counts as any color
		if d.Name == "School of Magic" && color != ColorSpecial && color != ColorNone {
			n++
		}
	}
	return n
}

// HasAllColors returns true if the player's city contains all 5 district colors.
// School of Magic and Haunted City each count as any color of your choice.
func (p *Player) HasAllColors() bool {
	colors := map[DistrictColor]bool{}
	wildcards := 0
	for _, d := range p.City {
		if d.Name == "School of Magic" || d.Name == "Haunted City" {
			wildcards++
			continue // don't count their natural Special color; they fill any missing
		}
		colors[d.Color] = true
	}
	missing := 0
	for _, c := range []DistrictColor{ColorNoble, ColorReligious, ColorTrade, ColorMilitary, ColorSpecial} {
		if !colors[c] {
			missing++
		}
	}
	return missing <= wildcards
}

// RemoveFromHand removes the first card with the given name from hand, returns true if found.
func (p *Player) RemoveFromHand(name string) (District, bool) {
	for i, d := range p.Hand {
		if d.Name == name {
			p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)
			return d, true
		}
	}
	return District{}, false
}
