package abilities

import (
	"citadels/internal/engine"
	"sort"
)

// Magician (role 3): Either swap hand with another player,
// or discard any number of cards and draw that many.
type Magician struct{}

func (m Magician) Role() engine.CharacterRole { return engine.RoleMagician }
func (m Magician) NeedsTarget() bool          { return true }
func (m Magician) IsPassive() bool            { return false }

func (m Magician) ValidTargets(g *engine.Game, playerID string) []string {
	targets := []string{"swap_hand", "discard_draw"}
	return targets
}

func (m Magician) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) {
	player := g.GetPlayer(playerID)
	if player == nil {
		return nil, engine.ErrPlayerNotFound
	}

	switch action.ExtraData {
	case "swap_hand":
		target := g.GetPlayer(action.Target)
		if target == nil || target.ID == playerID {
			return nil, engine.ErrInvalidTarget
		}
		player.Hand, target.Hand = target.Hand, player.Hand
		return []engine.Event{
			{Type: engine.EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
				"ability": "magician", "mode": "swap_hand", "target": target.Name,
			}},
		}, nil

	case "discard_draw":
		if len(action.Indices) == 0 {
			return nil, engine.ErrInvalidAction
		}
		// Validate indices
		for _, idx := range action.Indices {
			if idx < 0 || idx >= len(player.Hand) {
				return nil, engine.ErrInvalidAction
			}
		}
		// Sort indices descending to remove correctly
		sorted := make([]int, len(action.Indices))
		copy(sorted, action.Indices)
		sort.Sort(sort.Reverse(sort.IntSlice(sorted)))
		// Remove duplicates
		seen := map[int]bool{}
		var discarded []engine.District
		for _, idx := range sorted {
			if seen[idx] {
				continue
			}
			seen[idx] = true
			discarded = append(discarded, player.Hand[idx])
			player.Hand = append(player.Hand[:idx], player.Hand[idx+1:]...)
		}
		// Return discarded to deck bottom
		g.Deck.Return(discarded)
		// Draw same number
		drawn := g.Deck.Draw(len(discarded))
		player.Hand = append(player.Hand, drawn...)
		return []engine.Event{
			{Type: engine.EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
				"ability": "magician", "mode": "discard_draw", "count": len(discarded),
			}},
		}, nil

	default:
		return nil, engine.ErrInvalidAction
	}
}
