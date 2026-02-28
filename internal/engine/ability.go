package engine

import "fmt"

// ActionType identifies player actions sent to Game.Apply.
type ActionType string

const (
	ActionDraftPick   ActionType = "draft_pick"
	ActionTakeGold    ActionType = "take_gold"
	ActionDrawCards   ActionType = "draw_cards"
	ActionKeepCard    ActionType = "keep_card"
	ActionBuild       ActionType = "build"
	ActionAbility     ActionType = "ability"
	ActionEndTurn     ActionType = "end_turn"
	ActionLabDiscard        ActionType = "lab_discard"        // Laboratory: discard card for 1 gold
	ActionSmithyDraw        ActionType = "smithy_draw"        // Smithy: pay 2 gold, draw 3 cards
	ActionGraveyardRespond  ActionType = "graveyard_respond"  // Graveyard: accept/decline destroyed district
)

// Action is a player's action input.
type Action struct {
	Type   ActionType `json:"type"`
	// Params depend on Type:
	// draft_pick: Character (CharacterRole)
	// build: DistrictName
	// ability: Target (playerID or role), ExtraData
	// keep_card: Index
	// lab_discard: DistrictName
	Character    CharacterRole `json:"character,omitempty"`
	DistrictName string        `json:"district_name,omitempty"`
	Target       string        `json:"target,omitempty"`
	Index        int           `json:"index,omitempty"`
	// Magician swap mode: "swap_hand" or "discard_draw"
	ExtraData    string        `json:"extra_data,omitempty"`
	// Magician: which card indices to discard
	Indices      []int         `json:"indices,omitempty"`
}

// EventType identifies events emitted by the engine.
type EventType string

const (
	EventDraftStart     EventType = "draft_start"
	EventDraftPick      EventType = "draft_pick"
	EventDraftDone      EventType = "draft_done"
	EventCharacterCall  EventType = "character_call"
	EventMurdered       EventType = "murdered"
	EventRobbed         EventType = "robbed"
	EventGoldTaken      EventType = "gold_taken"
	EventCardsDrawn     EventType = "cards_drawn"
	EventCardKept       EventType = "card_kept"
	EventDistrictBuilt  EventType = "district_built"
	EventAbilityUsed    EventType = "ability_used"
	EventTurnEnd        EventType = "turn_end"
	EventRoundEnd       EventType = "round_end"
	EventCrownPassed    EventType = "crown_passed"
	EventGameOver       EventType = "game_over"
	EventPhaseChange    EventType = "phase_change"
	EventDrawChoice     EventType = "draw_choice"
	EventGoldCollected  EventType = "gold_collected"
)

// Event is emitted by the engine after state changes.
type Event struct {
	Type     EventType   `json:"type"`
	Player   string      `json:"player,omitempty"`
	Data     interface{} `json:"data,omitempty"`
}

// Ability defines a character's special ability.
type Ability interface {
	Role() CharacterRole
	// NeedsTarget returns true if the ability requires choosing a target.
	NeedsTarget() bool
	// IsPassive returns true if the ability triggers automatically.
	IsPassive() bool
	// ValidTargets returns valid target identifiers, given game state.
	ValidTargets(g *Game, playerID string) []string
	// Apply executes the ability. Returns events and error.
	Apply(g *Game, playerID string, action Action) ([]Event, error)
}

// AbilityRegistry maps roles to their abilities.
type AbilityRegistry struct {
	abilities map[CharacterRole]Ability
}

func NewAbilityRegistry() *AbilityRegistry {
	return &AbilityRegistry{abilities: make(map[CharacterRole]Ability)}
}

func (r *AbilityRegistry) Register(a Ability) {
	r.abilities[a.Role()] = a
}

func (r *AbilityRegistry) Get(role CharacterRole) (Ability, error) {
	a, ok := r.abilities[role]
	if !ok {
		return nil, fmt.Errorf("no ability registered for role %d", role)
	}
	return a, nil
}
