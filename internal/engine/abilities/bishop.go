package abilities

import "citadels/internal/engine"

// Bishop (role 5): Collects gold for religious (blue) districts.
// Protected from Warlord destruction. Both effects are passive.
type Bishop struct{}

func (b Bishop) Role() engine.CharacterRole { return engine.RoleBishop }
func (b Bishop) NeedsTarget() bool          { return false }
func (b Bishop) IsPassive() bool            { return true }

func (b Bishop) ValidTargets(g *engine.Game, playerID string) []string {
	return nil
}

func (b Bishop) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) {
	// Gold collection for religious districts is handled in resolve phase.
	// Bishop protection from Warlord is checked in Warlord ability.
	return nil, nil
}
