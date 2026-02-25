package abilities

import "citadels/internal/engine"

// Thief (role 2): Choose a character to rob. When that character is called,
// the thief takes all their gold.
type Thief struct{}

func (t Thief) Role() engine.CharacterRole { return engine.RoleThief }
func (t Thief) NeedsTarget() bool          { return true }
func (t Thief) IsPassive() bool            { return false }

func (t Thief) ValidTargets(g *engine.Game, playerID string) []string {
	var targets []string
	for _, r := range engine.AllRoles() {
		if r == engine.RoleAssassin || r == engine.RoleThief {
			continue
		}
		if r == g.MurderedRole {
			continue // can't rob murdered character
		}
		targets = append(targets, r.String())
	}
	return targets
}

func (t Thief) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) {
	targetRole := action.Character
	if targetRole == engine.RoleAssassin || targetRole == engine.RoleThief || targetRole == g.MurderedRole {
		return nil, engine.ErrInvalidTarget
	}
	if targetRole < 1 || targetRole > 8 {
		return nil, engine.ErrInvalidTarget
	}
	g.RobbedRole = targetRole
	return []engine.Event{
		{Type: engine.EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
			"ability": "thief", "target_role": targetRole.String(),
		}},
	}, nil
}
