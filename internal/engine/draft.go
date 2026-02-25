package engine

import "math/rand/v2"

// DraftState holds the state of the character draft phase.
type DraftState struct {
	Available    []CharacterRole `json:"available"`     // characters still pickable
	FaceUp       []CharacterRole `json:"face_up"`       // revealed (not pickable)
	FaceDown     []CharacterRole `json:"face_down"`     // hidden (not pickable), count only known
	CurrentPicker int            `json:"current_picker"` // index into pick order
	PickOrder    []string        `json:"pick_order"`     // player IDs in draft order (crown holder first)
	PicksPerPlayer int           `json:"picks_per_player"`
	Picks        map[string][]CharacterRole `json:"-"` // accumulated picks per player
	Round        int            `json:"round"`          // for 2-3 player multi-pick tracking
}

// DraftConfig returns (faceDown, faceUp, picksPerPlayer) for a given player count.
func DraftConfig(numPlayers int) (faceDown int, faceUp int, picksPerPlayer int) {
	switch numPlayers {
	case 2:
		return 1, 0, 2
	case 3:
		return 1, 0, 2
	case 4:
		return 1, 2, 1
	case 5:
		return 1, 1, 1
	case 6:
		return 1, 0, 1
	case 7:
		return 1, 0, 1
	default:
		return 1, 0, 1
	}
}

// SetupDraft initializes a new draft round.
func SetupDraft(players []*Player) *DraftState {
	numPlayers := len(players)
	faceDown, faceUp, picksPerPlayer := DraftConfig(numPlayers)

	roles := AllRoles()
	// Shuffle for random face-down/face-up
	rand.Shuffle(len(roles), func(i, j int) {
		roles[i], roles[j] = roles[j], roles[i]
	})

	ds := &DraftState{
		Picks:          make(map[string][]CharacterRole),
		PicksPerPlayer: picksPerPlayer,
	}

	// Take face-down cards (hidden from everyone)
	ds.FaceDown = roles[:faceDown]
	roles = roles[faceDown:]

	// Take face-up cards (visible to everyone)
	ds.FaceUp = roles[:faceUp]
	roles = roles[faceUp:]

	// Rest are available for picking
	ds.Available = roles

	// Determine pick order: crown holder first
	crownIdx := 0
	for i, p := range players {
		if p.HasCrown {
			crownIdx = i
			break
		}
	}
	ds.PickOrder = make([]string, numPlayers)
	for i := 0; i < numPlayers; i++ {
		ds.PickOrder[i] = players[(crownIdx+i)%numPlayers].ID
	}

	// For 2-3 players: interleaved picks (each player picks picksPerPlayer times)
	if picksPerPlayer > 1 {
		expanded := make([]string, 0, numPlayers*picksPerPlayer)
		for round := 0; round < picksPerPlayer; round++ {
			for _, pid := range ds.PickOrder {
				expanded = append(expanded, pid)
			}
		}
		ds.PickOrder = expanded
	}

	// For 7 players: the 7th player can pick the face-down card as their option
	// This is handled in the pick logic

	ds.CurrentPicker = 0
	return ds
}

// CurrentPickerID returns who should pick now.
func (ds *DraftState) CurrentPickerID() string {
	if ds.CurrentPicker >= len(ds.PickOrder) {
		return ""
	}
	return ds.PickOrder[ds.CurrentPicker]
}

// Pick lets the current picker choose a character.
func (ds *DraftState) Pick(playerID string, role CharacterRole) error {
	if ds.CurrentPickerID() != playerID {
		return ErrNotYourTurn
	}

	// Check if role is available
	found := false
	for i, r := range ds.Available {
		if r == role {
			ds.Available = append(ds.Available[:i], ds.Available[i+1:]...)
			found = true
			break
		}
	}
	if !found {
		return ErrInvalidAction
	}

	ds.Picks[playerID] = append(ds.Picks[playerID], role)
	ds.CurrentPicker++

	return nil
}

// IsDone returns true when all picks are made.
func (ds *DraftState) IsDone() bool {
	return ds.CurrentPicker >= len(ds.PickOrder)
}
