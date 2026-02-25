package abilities

import "citadels/internal/engine"

// Merchant (role 6): Gets 1 extra gold at start of turn.
// Collects gold for trade (green) districts. Both passive.
type Merchant struct{}

func (m Merchant) Role() engine.CharacterRole { return engine.RoleMerchant }
func (m Merchant) NeedsTarget() bool          { return false }
func (m Merchant) IsPassive() bool            { return true }

func (m Merchant) ValidTargets(g *engine.Game, playerID string) []string {
	return nil
}

func (m Merchant) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) {
	player := g.GetPlayer(playerID)
	if player == nil {
		return nil, engine.ErrPlayerNotFound
	}
	player.Gold++
	return []engine.Event{
		{Type: engine.EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
			"ability": "merchant", "bonus_gold": 1,
		}},
	}, nil
}
