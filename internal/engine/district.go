package engine

// DistrictColor represents the five district categories.
type DistrictColor int

const (
	ColorNone      DistrictColor = 0
	ColorNoble     DistrictColor = 1 // Yellow
	ColorReligious DistrictColor = 2 // Blue
	ColorTrade     DistrictColor = 3 // Green
	ColorMilitary  DistrictColor = 4 // Red
	ColorSpecial   DistrictColor = 5 // Purple
)

var colorNames = map[DistrictColor]string{
	ColorNone:      "None",
	ColorNoble:     "Noble",
	ColorReligious: "Religious",
	ColorTrade:     "Trade",
	ColorMilitary:  "Military",
	ColorSpecial:   "Special",
}

func (c DistrictColor) String() string {
	if s, ok := colorNames[c]; ok {
		return s
	}
	return "Unknown"
}

// District represents a district card.
type District struct {
	Name  string        `json:"name"`
	Color DistrictColor `json:"color"`
	Cost  int           `json:"cost"`
}

// BaseDistricts returns the standard 65-card district deck.
func BaseDistricts() []District {
	var cards []District
	add := func(n int, name string, color DistrictColor, cost int) {
		for i := 0; i < n; i++ {
			cards = append(cards, District{Name: name, Color: color, Cost: cost})
		}
	}

	// Noble (yellow)
	add(5, "Manor", ColorNoble, 3)
	add(4, "Castle", ColorNoble, 4)
	add(3, "Palace", ColorNoble, 5)

	// Religious (blue)
	add(3, "Temple", ColorReligious, 1)
	add(3, "Church", ColorReligious, 2)
	add(3, "Monastery", ColorReligious, 3)
	add(2, "Cathedral", ColorReligious, 5)

	// Trade (green)
	add(5, "Tavern", ColorTrade, 1)
	add(3, "Trading Post", ColorTrade, 2)
	add(3, "Market", ColorTrade, 2)
	add(3, "Docks", ColorTrade, 3)
	add(2, "Harbor", ColorTrade, 4)
	add(1, "Town Hall", ColorTrade, 5)

	// Military (red)
	add(3, "Watchtower", ColorMilitary, 1)
	add(3, "Prison", ColorMilitary, 2)
	add(3, "Battlefield", ColorMilitary, 3)
	add(2, "Fortress", ColorMilitary, 5)

	// Special (purple)
	add(1, "Haunted City", ColorSpecial, 2)
	add(1, "Keep", ColorSpecial, 3)
	add(2, "Laboratory", ColorSpecial, 5)
	add(1, "Smithy", ColorSpecial, 5)
	add(1, "Observatory", ColorSpecial, 5)
	add(1, "Graveyard", ColorSpecial, 5)
	add(1, "Great Wall", ColorSpecial, 6)
	add(1, "School of Magic", ColorSpecial, 6)
	add(1, "Library", ColorSpecial, 6)
	add(1, "University", ColorSpecial, 6)
	add(1, "Dragon Gate", ColorSpecial, 6)

	return cards
}
