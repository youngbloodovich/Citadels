package abilities

import "citadels/internal/engine"

// Assassin (role 1): Choose a character to murder. That character skips their turn.
type Assassin struct{}

func (a Assassin) Role() engine.CharacterRole { return engine.RoleAssassin }
func (a Assassin) NeedsTarget() bool          { return true }
func (a Assassin) IsPassive() bool            { return false }

func (a Assassin) ValidTargets(g *engine.Game, playerID string) []string {
	var targets []string
	for _, r := range engine.AllRoles() {
		if r == engine.RoleAssassin {
			continue // can't kill self
		}
		targets = append(targets, r.String())
	}
	return targets
}

func (a Assassin) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) {
	targetRole := action.Character
	if targetRole == engine.RoleAssassin || targetRole < 2 || targetRole > 8 {
		return nil, engine.ErrInvalidTarget
	}
	g.MurderedRole = targetRole
	return []engine.Event{
		{Type: engine.EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
			"ability": "assassin", "target_role": targetRole.String(),
		}},
	}, nil
}
