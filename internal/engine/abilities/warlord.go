package abilities

import (
	"citadels/internal/engine"
	"fmt"
)

// Warlord (role 8): Collects gold for military (red) districts.
// Can destroy one district in another player's city by paying (cost - 1) gold.
type Warlord struct{}

func (w Warlord) Role() engine.CharacterRole { return engine.RoleWarlord }
func (w Warlord) NeedsTarget() bool          { return true }
func (w Warlord) IsPassive() bool            { return false }

func (w Warlord) ValidTargets(g *engine.Game, playerID string) []string {
	player := g.GetPlayer(playerID)
	if player == nil {
		return nil
	}
	var targets []string
	for _, p := range g.Players {
		if p.ID == playerID {
			continue
		}
		// Can't target Bishop's city
		if g.PlayerHasActiveRole(p.ID, engine.RoleBishop) {
			continue
		}
		// Can't target player with completed city (7+)
		if len(p.City) >= g.Config.EndCitySize {
			continue
		}
		for _, d := range p.City {
			if d.Name == "Keep" {
				continue // Keep can't be destroyed
			}
			cost := d.Cost - 1
			if cost <= player.Gold {
				targets = append(targets, fmt.Sprintf("%s:%s", p.ID, d.Name))
			}
		}
	}
	return targets
}

func (w Warlord) Apply(g *engine.Game, playerID string, action engine.Action) ([]engine.Event, error) {
	player := g.GetPlayer(playerID)
	if player == nil {
		return nil, engine.ErrPlayerNotFound
	}
	target := g.GetPlayer(action.Target)
	if target == nil || target.ID == playerID {
		return nil, engine.ErrInvalidTarget
	}
	// Check Bishop protection
	if g.PlayerHasActiveRole(target.ID, engine.RoleBishop) {
		return nil, fmt.Errorf("cannot target Bishop's city")
	}
	// Check completed city
	if len(target.City) >= g.Config.EndCitySize {
		return nil, fmt.Errorf("cannot target completed city")
	}

	// Find district
	idx := -1
	for i, d := range target.City {
		if d.Name == action.DistrictName {
			idx = i
			break
		}
	}
	if idx == -1 {
		return nil, engine.ErrInvalidTarget
	}
	d := target.City[idx]
	if d.Name == "Keep" {
		return nil, fmt.Errorf("Keep cannot be destroyed")
	}

	cost := d.Cost - 1
	if cost > player.Gold {
		return nil, fmt.Errorf("not enough gold to destroy %s (need %d, have %d)", d.Name, cost, player.Gold)
	}

	player.Gold -= cost
	target.City = append(target.City[:idx], target.City[idx+1:]...)

	events := []engine.Event{
		{Type: engine.EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
			"ability":  "warlord",
			"target":   target.Name,
			"district": d.Name,
			"cost":     cost,
		}},
	}

	// Graveyard: owner can pay 1 gold to take destroyed district into hand
	// This is handled as a separate prompt if the target has Graveyard
	if target.CityHas("Graveyard") && target.Gold >= 1 {
		g.PendingGraveyard = &engine.GraveyardPending{
			PlayerID: target.ID,
			District: d,
		}
	}

	return events, nil
}
