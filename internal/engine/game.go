package engine

import (
	"errors"
	"fmt"
)

var (
	ErrNotYourTurn    = errors.New("not your turn")
	ErrInvalidAction  = errors.New("invalid action")
	ErrInvalidTarget  = errors.New("invalid target")
	ErrPlayerNotFound = errors.New("player not found")
	ErrWrongPhase     = errors.New("wrong phase for this action")
	ErrNotEnoughGold  = errors.New("not enough gold")
	ErrAlreadyBuilt   = errors.New("already built a district with that name")
)

// GraveyardPending tracks a pending Graveyard choice.
type GraveyardPending struct {
	PlayerID string
	District District
}

// Game holds the entire game state.
type Game struct {
	Players   []*Player        `json:"players"`
	Deck      *Deck            `json:"-"`
	Config    GameConfig       `json:"-"`
	Abilities *AbilityRegistry `json:"-"`

	Phase            GamePhase    `json:"phase"`
	Round            int          `json:"round"`
	CurrentCallRole  CharacterRole `json:"current_call_role"`
	CurrentTurnPlayer string      `json:"current_turn_player"`
	CurrentTurnRole  CharacterRole `json:"current_turn_role"`

	MurderedRole CharacterRole `json:"murdered_role"`
	RobbedRole   CharacterRole `json:"robbed_role"`

	Draft *DraftState `json:"draft,omitempty"`

	// End-game tracking
	FinalRound      bool   `json:"final_round"`
	FirstToComplete string `json:"first_to_complete"`

	// Draw choice state
	DrawnCards []District `json:"-"`
	DrawCount  int        `json:"-"` // how many cards to keep

	// Graveyard pending
	PendingGraveyard *GraveyardPending `json:"-"`

	Scores []ScoreEntry `json:"scores,omitempty"`
}

// NewGame creates a new game with given players and config.
func NewGame(players []*Player, config GameConfig, abilities *AbilityRegistry) *Game {
	g := &Game{
		Players:   players,
		Deck:      NewDeck(config.Districts),
		Config:    config,
		Abilities: abilities,
		Phase:     PhaseLobby,
		Round:     0,
	}
	return g
}

// StartGame deals initial hands and begins the first draft.
func (g *Game) StartGame() []Event {
	var events []Event

	// Give each player 4 cards
	for _, p := range g.Players {
		p.Hand = g.Deck.Draw(4)
		p.Gold = 2
	}

	// First player (index 0) gets the crown
	g.Players[0].HasCrown = true

	events = append(events, g.startDraft()...)
	return events
}

func (g *Game) startDraft() []Event {
	g.Round++
	g.MurderedRole = 0
	g.RobbedRole = 0
	g.CurrentCallRole = 0
	g.CurrentTurnPlayer = ""
	g.CurrentTurnRole = 0

	// Clear per-round state
	for _, p := range g.Players {
		p.Characters = nil
		p.Murdered = false
		p.Robbed = false
		p.BuiltCount = 0
		p.TookAction = false
		p.UsedAbility = false
		p.UsedLab = false
		p.UsedSmithy = false
	}

	g.Draft = SetupDraft(g.Players)
	g.Phase = PhaseDraftPick

	return []Event{
		{Type: EventDraftStart, Data: map[string]interface{}{
			"round":    g.Round,
			"face_up":  roleStrings(g.Draft.FaceUp),
			"available_count": len(g.Draft.Available),
		}},
		{Type: EventPhaseChange, Data: map[string]interface{}{
			"phase": PhaseDraftPick.String(),
		}},
	}
}

// Apply is the single entry point for player actions.
func (g *Game) Apply(playerID string, action Action) ([]Event, error) {
	switch action.Type {
	case ActionDraftPick:
		return g.applyDraftPick(playerID, action)
	case ActionTakeGold:
		return g.applyTakeGold(playerID)
	case ActionDrawCards:
		return g.applyDrawCards(playerID)
	case ActionKeepCard:
		return g.applyKeepCard(playerID, action)
	case ActionBuild:
		return g.applyBuild(playerID, action)
	case ActionAbility:
		return g.applyAbility(playerID, action)
	case ActionEndTurn:
		return g.applyEndTurn(playerID)
	case ActionLabDiscard:
		return g.applyLabDiscard(playerID, action)
	case ActionSmithyDraw:
		return g.applySmithyDraw(playerID)
	case ActionGraveyardRespond:
		return g.applyGraveyardRespond(playerID, action)
	default:
		return nil, ErrInvalidAction
	}
}

func (g *Game) applyDraftPick(playerID string, action Action) ([]Event, error) {
	if g.Phase != PhaseDraftPick {
		return nil, ErrWrongPhase
	}
	if err := g.Draft.Pick(playerID, action.Character); err != nil {
		return nil, err
	}

	events := []Event{
		{Type: EventDraftPick, Player: playerID, Data: map[string]interface{}{
			"character": action.Character.String(),
		}},
	}

	if g.Draft.IsDone() {
		// Assign characters to players
		for _, p := range g.Players {
			p.Characters = g.Draft.Picks[p.ID]
		}
		events = append(events, Event{Type: EventDraftDone})

		// Start resolution
		g.Phase = PhaseResolution
		events = append(events, g.resolveNext()...)
	}

	return events, nil
}

func (g *Game) resolveNext() []Event {
	var events []Event
	for {
		role := g.NextCharacterToCall()
		if role == 0 {
			// All characters called — end of round
			events = append(events, g.endRound()...)
			return events
		}
		events = append(events, g.CallCharacter(role)...)
		// If a player got a turn, stop and wait for their actions
		if g.Phase == PhasePlayerTurn {
			return events
		}
		// Otherwise (nobody has this character, or murdered) — continue to next
	}
}

func (g *Game) endRound() []Event {
	events := []Event{{Type: EventRoundEnd, Data: map[string]interface{}{"round": g.Round}}}

	if g.FinalRound {
		return g.endGame(events)
	}

	// Check if anyone triggered end game
	for _, p := range g.Players {
		if len(p.City) >= g.Config.EndCitySize {
			g.FinalRound = true
			if g.FirstToComplete == "" {
				g.FirstToComplete = p.ID
			}
			break
		}
	}
	// Note: even if triggered now, the current round just finished.
	// The NEXT round will be the final one... actually in Citadels,
	// the round in which someone completes is the final round.
	// Let me re-check: when a player builds their 7th district,
	// the current round continues to completion, then the game ends.
	if g.FinalRound {
		return g.endGame(events)
	}

	// Start new draft
	events = append(events, g.startDraft()...)
	return events
}

func (g *Game) endGame(events []Event) []Event {
	g.Phase = PhaseGameOver
	g.Scores = g.CalculateScores()
	events = append(events, Event{
		Type: EventGameOver,
		Data: map[string]interface{}{"scores": g.Scores},
	})
	events = append(events, Event{
		Type: EventPhaseChange,
		Data: map[string]interface{}{"phase": PhaseGameOver.String()},
	})
	return events
}

func (g *Game) applyTakeGold(playerID string) ([]Event, error) {
	if g.Phase != PhasePlayerTurn {
		return nil, ErrWrongPhase
	}
	if g.CurrentTurnPlayer != playerID {
		return nil, ErrNotYourTurn
	}
	p := g.GetPlayer(playerID)
	if p.TookAction {
		return nil, fmt.Errorf("already took an action this turn")
	}
	p.Gold += 2
	p.TookAction = true
	return []Event{
		{Type: EventGoldTaken, Player: playerID, Data: map[string]interface{}{"gold": 2}},
	}, nil
}

func (g *Game) applyDrawCards(playerID string) ([]Event, error) {
	if g.Phase != PhasePlayerTurn {
		return nil, ErrWrongPhase
	}
	if g.CurrentTurnPlayer != playerID {
		return nil, ErrNotYourTurn
	}
	p := g.GetPlayer(playerID)
	if p.TookAction {
		return nil, fmt.Errorf("already took an action this turn")
	}

	drawCount := 2
	keepCount := 1

	// Observatory: draw 3 instead of 2
	if p.CityHas("Observatory") {
		drawCount = 3
	}
	// Library: keep all drawn cards
	if p.CityHas("Library") {
		keepCount = drawCount
	}

	drawn := g.Deck.Draw(drawCount)
	p.TookAction = true

	if keepCount >= len(drawn) {
		// Keep all
		p.Hand = append(p.Hand, drawn...)
		return []Event{
			{Type: EventCardsDrawn, Player: playerID, Data: map[string]interface{}{
				"count": len(drawn), "kept": len(drawn),
			}},
		}, nil
	}

	// Need to choose which card(s) to keep
	g.DrawnCards = drawn
	g.DrawCount = keepCount
	g.Phase = PhaseDrawChoice
	return []Event{
		{Type: EventDrawChoice, Player: playerID, Data: map[string]interface{}{
			"cards": drawn, "keep": keepCount,
		}},
	}, nil
}

func (g *Game) applyKeepCard(playerID string, action Action) ([]Event, error) {
	if g.Phase != PhaseDrawChoice {
		return nil, ErrWrongPhase
	}
	if g.CurrentTurnPlayer != playerID {
		return nil, ErrNotYourTurn
	}
	if action.Index < 0 || action.Index >= len(g.DrawnCards) {
		return nil, ErrInvalidAction
	}

	kept := g.DrawnCards[action.Index]
	p := g.GetPlayer(playerID)
	p.Hand = append(p.Hand, kept)

	// Return unkept cards to deck
	for i, d := range g.DrawnCards {
		if i != action.Index {
			g.Deck.Return([]District{d})
		}
	}

	g.DrawnCards = nil
	g.DrawCount = 0
	g.Phase = PhasePlayerTurn

	return []Event{
		{Type: EventCardKept, Player: playerID, Data: map[string]interface{}{
			"card": kept,
		}},
		{Type: EventPhaseChange, Data: map[string]interface{}{
			"phase": PhasePlayerTurn.String(),
		}},
	}, nil
}

func (g *Game) applyBuild(playerID string, action Action) ([]Event, error) {
	if g.Phase != PhasePlayerTurn {
		return nil, ErrWrongPhase
	}
	if g.CurrentTurnPlayer != playerID {
		return nil, ErrNotYourTurn
	}
	p := g.GetPlayer(playerID)

	maxBuild := 1
	if g.CurrentTurnRole == RoleArchitect {
		maxBuild = 3
	}
	if p.BuiltCount >= maxBuild {
		return nil, fmt.Errorf("already built maximum districts this turn")
	}

	// Check if district is in hand
	card, found := p.RemoveFromHand(action.DistrictName)
	if !found {
		return nil, fmt.Errorf("card %s not in hand", action.DistrictName)
	}

	// Check for duplicate in city (except Haunted City)
	if card.Name != "Haunted City" && p.CityHas(card.Name) {
		// Put card back
		p.Hand = append(p.Hand, card)
		return nil, ErrAlreadyBuilt
	}

	if card.Cost > p.Gold {
		p.Hand = append(p.Hand, card)
		return nil, ErrNotEnoughGold
	}

	p.Gold -= card.Cost
	p.City = append(p.City, card)
	p.BuiltCount++

	events := []Event{
		{Type: EventDistrictBuilt, Player: playerID, Data: map[string]interface{}{
			"district": card.Name, "cost": card.Cost, "color": card.Color.String(),
		}},
	}

	// Check end-game trigger
	if len(p.City) >= g.Config.EndCitySize && g.FirstToComplete == "" {
		g.FinalRound = true
		g.FirstToComplete = p.ID
	}

	return events, nil
}

func (g *Game) applyAbility(playerID string, action Action) ([]Event, error) {
	if g.Phase != PhasePlayerTurn && g.Phase != PhaseAbility {
		return nil, ErrWrongPhase
	}
	if g.CurrentTurnPlayer != playerID {
		return nil, ErrNotYourTurn
	}
	p := g.GetPlayer(playerID)
	if p.UsedAbility {
		return nil, fmt.Errorf("already used ability this turn")
	}

	ability, err := g.Abilities.Get(g.CurrentTurnRole)
	if err != nil {
		return nil, err
	}
	if ability.IsPassive() {
		return nil, fmt.Errorf("this character's ability is passive")
	}

	events, err := ability.Apply(g, playerID, action)
	if err != nil {
		return nil, err
	}
	p.UsedAbility = true

	// If we were in Ability phase, return to PlayerTurn
	if g.Phase == PhaseAbility {
		g.Phase = PhasePlayerTurn
		events = append(events, Event{
			Type: EventPhaseChange,
			Data: map[string]interface{}{"phase": PhasePlayerTurn.String()},
		})
	}

	return events, nil
}

func (g *Game) applyEndTurn(playerID string) ([]Event, error) {
	if g.Phase != PhasePlayerTurn {
		return nil, ErrWrongPhase
	}
	if g.CurrentTurnPlayer != playerID {
		return nil, ErrNotYourTurn
	}

	events := []Event{
		{Type: EventTurnEnd, Player: playerID, Data: map[string]interface{}{
			"role": g.CurrentTurnRole.String(),
		}},
	}

	g.CurrentTurnPlayer = ""
	g.PendingGraveyard = nil
	g.Phase = PhaseResolution

	// Resolve next character
	events = append(events, g.resolveNext()...)
	return events, nil
}

func (g *Game) applyLabDiscard(playerID string, action Action) ([]Event, error) {
	if g.Phase != PhasePlayerTurn {
		return nil, ErrWrongPhase
	}
	if g.CurrentTurnPlayer != playerID {
		return nil, ErrNotYourTurn
	}
	p := g.GetPlayer(playerID)
	if !p.CityHas("Laboratory") {
		return nil, fmt.Errorf("you don't have Laboratory")
	}
	if p.UsedLab {
		return nil, fmt.Errorf("already used Laboratory this turn")
	}
	card, found := p.RemoveFromHand(action.DistrictName)
	if !found {
		return nil, fmt.Errorf("card %s not in hand", action.DistrictName)
	}
	g.Deck.Return([]District{card})
	p.Gold++
	p.UsedLab = true
	return []Event{
		{Type: EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
			"ability": "laboratory", "discarded": card.Name,
		}},
	}, nil
}

func (g *Game) applySmithyDraw(playerID string) ([]Event, error) {
	if g.Phase != PhasePlayerTurn {
		return nil, ErrWrongPhase
	}
	if g.CurrentTurnPlayer != playerID {
		return nil, ErrNotYourTurn
	}
	p := g.GetPlayer(playerID)
	if !p.CityHas("Smithy") {
		return nil, fmt.Errorf("you don't have Smithy")
	}
	if p.UsedSmithy {
		return nil, fmt.Errorf("already used Smithy this turn")
	}
	if p.Gold < 2 {
		return nil, ErrNotEnoughGold
	}
	p.Gold -= 2
	p.UsedSmithy = true
	drawn := g.Deck.Draw(3)
	p.Hand = append(p.Hand, drawn...)
	return []Event{
		{Type: EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
			"ability": "smithy", "cards_drawn": len(drawn),
		}},
	}, nil
}

func (g *Game) applyGraveyardRespond(playerID string, action Action) ([]Event, error) {
	if g.PendingGraveyard == nil {
		return nil, fmt.Errorf("no pending graveyard choice")
	}
	if g.PendingGraveyard.PlayerID != playerID {
		return nil, fmt.Errorf("graveyard choice is not for you")
	}

	pending := g.PendingGraveyard

	if action.ExtraData == "accept" {
		p := g.GetPlayer(playerID)
		if p.Gold < 1 {
			return nil, ErrNotEnoughGold
		}
		g.PendingGraveyard = nil
		p.Gold--
		p.Hand = append(p.Hand, pending.District)
		return []Event{
			{Type: EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
				"ability": "graveyard", "district": pending.District.Name, "action": "accept",
			}},
		}, nil
	}

	// Decline
	g.PendingGraveyard = nil
	return []Event{
		{Type: EventAbilityUsed, Player: playerID, Data: map[string]interface{}{
			"ability": "graveyard", "district": pending.District.Name, "action": "decline",
		}},
	}, nil
}

// GetPlayer finds a player by ID.
func (g *Game) GetPlayer(id string) *Player {
	for _, p := range g.Players {
		if p.ID == id {
			return p
		}
	}
	return nil
}

// PublicView returns the game state visible on the TV.
type PublicViewData struct {
	Phase           string                 `json:"phase"`
	Round           int                    `json:"round"`
	Players         []PublicPlayerData     `json:"players"`
	CurrentCall     string                 `json:"current_call,omitempty"`
	CurrentTurn     string                 `json:"current_turn,omitempty"`
	CurrentRole     string                 `json:"current_role,omitempty"`
	DraftFaceUp     []string               `json:"draft_face_up,omitempty"`
	DraftPicker     string                 `json:"draft_picker,omitempty"`
	DraftAvailable  int                    `json:"draft_available,omitempty"`
	Scores          []ScoreEntry           `json:"scores,omitempty"`
	DeckSize        int                    `json:"deck_size"`
}

type PublicPlayerData struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Gold     int    `json:"gold"`
	HandSize int    `json:"hand_size"`
	City     []District `json:"city"`
	HasCrown bool   `json:"has_crown"`
	// Revealed characters (only during resolution after they act)
	RevealedRoles []string `json:"revealed_roles,omitempty"`
}

func (g *Game) PublicView() PublicViewData {
	pv := PublicViewData{
		Phase:       g.Phase.String(),
		Round:       g.Round,
		CurrentCall: g.CurrentCallRole.String(),
		CurrentRole: g.CurrentTurnRole.String(),
		Scores:      g.Scores,
		DeckSize:    g.Deck.Len(),
	}

	if g.CurrentTurnPlayer != "" {
		if p := g.GetPlayer(g.CurrentTurnPlayer); p != nil {
			pv.CurrentTurn = p.Name
		}
	}

	if g.Draft != nil {
		pv.DraftFaceUp = roleStrings(g.Draft.FaceUp)
		pv.DraftAvailable = len(g.Draft.Available)
		if pid := g.Draft.CurrentPickerID(); pid != "" {
			if p := g.GetPlayer(pid); p != nil {
				pv.DraftPicker = p.Name
			}
		}
	}

	for _, p := range g.Players {
		ppd := PublicPlayerData{
			ID:       p.ID,
			Name:     p.Name,
			Gold:     p.Gold,
			HandSize: len(p.Hand),
			City:     p.City,
			HasCrown: p.HasCrown,
		}
		// Show revealed roles for characters that have already been called
		for _, c := range p.Characters {
			if c <= g.CurrentCallRole {
				ppd.RevealedRoles = append(ppd.RevealedRoles, c.String())
			}
		}
		pv.Players = append(pv.Players, ppd)
	}

	return pv
}

// PlayerView returns the game state visible to a specific player.
type PlayerViewData struct {
	PublicViewData
	Hand        []District      `json:"hand"`
	Characters  []string        `json:"characters"`
	IsMyTurn    bool            `json:"is_my_turn"`
	CanBuild    bool            `json:"can_build"`
	CanUseAbility bool          `json:"can_use_ability"`
	CanTakeAction bool          `json:"can_take_action"`
	DraftChoices []string       `json:"draft_choices,omitempty"`
	DrawnCards      []District          `json:"drawn_cards,omitempty"`
	KeepCount       int                 `json:"keep_count,omitempty"`
	ValidTargets    []string            `json:"valid_targets,omitempty"`
	CanUseLab       bool                `json:"can_use_lab,omitempty"`
	CanUseSmithy    bool                `json:"can_use_smithy,omitempty"`
	GraveyardChoice *GraveyardChoiceView `json:"graveyard_choice,omitempty"`
}

// GraveyardChoiceView is sent to the player who can use Graveyard.
type GraveyardChoiceView struct {
	DistrictName string `json:"district_name"`
	DistrictCost int    `json:"district_cost"`
}

func (g *Game) ViewFor(playerID string) PlayerViewData {
	pv := PlayerViewData{
		PublicViewData: g.PublicView(),
	}

	p := g.GetPlayer(playerID)
	if p == nil {
		return pv
	}

	pv.Hand = p.Hand
	for _, c := range p.Characters {
		pv.Characters = append(pv.Characters, c.String())
	}

	pv.IsMyTurn = g.CurrentTurnPlayer == playerID

	if pv.IsMyTurn && g.Phase == PhasePlayerTurn {
		pv.CanTakeAction = !p.TookAction
		maxBuild := 1
		if g.CurrentTurnRole == RoleArchitect {
			maxBuild = 3
		}
		pv.CanBuild = p.BuiltCount < maxBuild && p.TookAction

		ability, err := g.Abilities.Get(g.CurrentTurnRole)
		if err == nil && !ability.IsPassive() && !p.UsedAbility {
			pv.CanUseAbility = true
			pv.ValidTargets = ability.ValidTargets(g, playerID)
		}
	}

	// Draft choices
	if g.Phase == PhaseDraftPick && g.Draft != nil && g.Draft.CurrentPickerID() == playerID {
		for _, r := range g.Draft.Available {
			pv.DraftChoices = append(pv.DraftChoices, r.String())
		}
	}

	// Draw choice
	if g.Phase == PhaseDrawChoice && g.CurrentTurnPlayer == playerID {
		pv.DrawnCards = g.DrawnCards
		pv.KeepCount = g.DrawCount
	}

	// Laboratory / Smithy (available during own turn)
	if pv.IsMyTurn && g.Phase == PhasePlayerTurn {
		if p.CityHas("Laboratory") && !p.UsedLab && len(p.Hand) > 0 {
			pv.CanUseLab = true
		}
		if p.CityHas("Smithy") && !p.UsedSmithy && p.Gold >= 2 {
			pv.CanUseSmithy = true
		}
	}

	// Graveyard choice (shown regardless of whose turn it is)
	if g.PendingGraveyard != nil && g.PendingGraveyard.PlayerID == playerID {
		pv.GraveyardChoice = &GraveyardChoiceView{
			DistrictName: g.PendingGraveyard.District.Name,
			DistrictCost: g.PendingGraveyard.District.Cost,
		}
	}

	return pv
}

func roleStrings(roles []CharacterRole) []string {
	s := make([]string, len(roles))
	for i, r := range roles {
		s[i] = r.String()
	}
	return s
}
