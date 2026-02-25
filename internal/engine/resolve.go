package engine

// Resolve handles calling characters 1-8 in order during the resolution phase.

// NextCharacterToCall returns the next character role to call (1-8),
// or 0 if all have been called.
func (g *Game) NextCharacterToCall() CharacterRole {
	for _, role := range AllRoles() {
		if role > g.CurrentCallRole {
			return role
		}
	}
	return 0
}

// CallCharacter resolves the effects of calling a character.
// Returns events generated and advances to the player's turn or next character.
func (g *Game) CallCharacter(role CharacterRole) []Event {
	g.CurrentCallRole = role
	var events []Event

	events = append(events, Event{
		Type: EventCharacterCall,
		Data: map[string]interface{}{"role": role.String(), "number": int(role)},
	})

	// Find who has this character
	ownerID := g.FindCharacterOwner(role)
	if ownerID == "" {
		// Nobody picked this character
		return events
	}

	owner := g.GetPlayer(ownerID)

	// Check if murdered
	if role == g.MurderedRole {
		owner.Murdered = true
		events = append(events, Event{
			Type:   EventMurdered,
			Player: ownerID,
			Data:   map[string]interface{}{"role": role.String()},
		})
		return events
	}

	// Check if robbed
	if role == g.RobbedRole {
		thiefID := g.FindCharacterOwner(RoleThief)
		if thiefID != "" {
			thief := g.GetPlayer(thiefID)
			stolen := owner.Gold
			owner.Gold = 0
			thief.Gold += stolen
			owner.Robbed = true
			events = append(events, Event{
				Type:   EventRobbed,
				Player: ownerID,
				Data: map[string]interface{}{
					"role": role.String(), "stolen": stolen, "thief": thief.Name,
				},
			})
		}
	}

	// Apply passive abilities
	ability, err := g.Abilities.Get(role)
	if err == nil && ability.IsPassive() {
		abilityEvents, _ := ability.Apply(g, ownerID, Action{Type: ActionAbility})
		events = append(events, abilityEvents...)
	}

	// Collect gold for matching districts
	if color := role.Color(); color != ColorNone {
		count := owner.CityColorCount(color)
		if count > 0 {
			owner.Gold += count
			events = append(events, Event{
				Type:   EventGoldCollected,
				Player: ownerID,
				Data: map[string]interface{}{
					"color": color.String(), "count": count,
				},
			})
		}
	}

	// Set up player turn
	g.CurrentTurnPlayer = ownerID
	g.CurrentTurnRole = role
	owner.BuiltCount = 0
	owner.TookAction = false
	owner.UsedAbility = false
	g.Phase = PhasePlayerTurn

	events = append(events, Event{
		Type:   EventPhaseChange,
		Player: ownerID,
		Data:   map[string]interface{}{"phase": PhasePlayerTurn.String(), "role": role.String()},
	})

	return events
}

// FindCharacterOwner returns the player ID who has the given character, or "".
func (g *Game) FindCharacterOwner(role CharacterRole) string {
	for _, p := range g.Players {
		for _, c := range p.Characters {
			if c == role {
				return p.ID
			}
		}
	}
	return ""
}

// PlayerHasActiveRole returns true if the player has the given role
// and is not murdered this round.
func (g *Game) PlayerHasActiveRole(playerID string, role CharacterRole) bool {
	p := g.GetPlayer(playerID)
	if p == nil || p.Murdered {
		return false
	}
	for _, c := range p.Characters {
		if c == role {
			return true
		}
	}
	return false
}
