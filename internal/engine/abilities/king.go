package abilities

import "citadels/internal/engine"

// King (role 4): Receives the crown. Collects gold for noble (yellow) districts.
// Gold collection is passive (handled in resolve). Crown is also passive.
type King struct{}

func (k King) Role() engine.CharacterRole { return engine.RoleKing }
func (k King) NeedsTarget() bool          { return false }
func (k King) IsPassive() bool            { return true }

func (k King) ValidTargets(g *engine.Game, playerID string) []string {
	return nil
}

func (k King) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) {
	player := g.GetPlayer(playerID)
	if player == nil {
		return nil, engine.ErrPlayerNotFound
	}
	// Crown transfer
	for _, p := range g.Players {
		p.HasCrown = false
	}
	player.HasCrown = true

	events := []engine.Event{
		{Type: engine.EventCrownPassed, Player: playerID},
	}
	return events, nil
}
