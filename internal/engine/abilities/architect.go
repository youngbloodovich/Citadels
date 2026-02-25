package abilities

import "citadels/internal/engine"

// Architect (role 7): Draws 2 extra cards. Can build up to 3 districts this turn.
type Architect struct{}

func (a Architect) Role() engine.CharacterRole { return engine.RoleArchitect }
func (a Architect) NeedsTarget() bool          { return false }
func (a Architect) IsPassive() bool            { return true }

func (a Architect) ValidTargets(g *engine.Game, playerID string) []string {
	return nil
}

func (a Architect) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) {
	player := g.GetPlayer(playerID)
	if player == nil {
		return nil, engine.ErrPlayerNotFound
	}
	// Draw 2 extra cards
	drawn := g.Deck.Draw(2)
	player.Hand = append(player.Hand, drawn...)
	// Build limit is checked in Game logic (3 for architect)
	return []engine.Event{
		{Type: engine.EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
			"ability": "architect", "extra_cards": len(drawn),
		}},
	}, nil
}
