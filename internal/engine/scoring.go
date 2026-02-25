package engine

// ScoreEntry holds scoring breakdown for one player.
type ScoreEntry struct {
	PlayerID      string `json:"player_id"`
	PlayerName    string `json:"player_name"`
	DistrictScore int    `json:"district_score"`
	ColorBonus    int    `json:"color_bonus"`
	FirstComplete int    `json:"first_complete"`
	OtherComplete int    `json:"other_complete"`
	SpecialBonus  int    `json:"special_bonus"`
	Total         int    `json:"total"`
}

// CalculateScores computes final scores for all players.
func (g *Game) CalculateScores() []ScoreEntry {
	entries := make([]ScoreEntry, len(g.Players))

	for i, p := range g.Players {
		e := ScoreEntry{
			PlayerID:   p.ID,
			PlayerName: p.Name,
		}

		// Sum district costs
		for _, d := range p.City {
			e.DistrictScore += d.Cost
		}

		// All 5 colors bonus
		if p.HasAllColors() {
			e.ColorBonus = 3
		}

		// First to complete city
		if p.ID == g.FirstToComplete {
			e.FirstComplete = 4
		} else if len(p.City) >= g.Config.EndCitySize {
			e.OtherComplete = 2
		}

		// Special district bonuses
		for _, d := range p.City {
			switch d.Name {
			case "University":
				e.SpecialBonus += 2 // worth 8 instead of 6
			case "Dragon Gate":
				e.SpecialBonus += 2 // worth 8 instead of 6
			}
		}

		e.Total = e.DistrictScore + e.ColorBonus + e.FirstComplete + e.OtherComplete + e.SpecialBonus
		entries[i] = e
	}

	return entries
}
