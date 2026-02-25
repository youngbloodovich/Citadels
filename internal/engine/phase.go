package engine

// GamePhase represents the current phase of the game state machine.
type GamePhase int

const (
	PhaseLobby      GamePhase = iota // waiting for players
	PhaseDraftSetup                  // setting up draft (face-down/face-up cards)
	PhaseDraftPick                   // players picking characters
	PhaseResolution                  // calling characters 1-8
	PhasePlayerTurn                  // active player taking actions
	PhaseAbility                     // resolving an ability that needs input
	PhaseDrawChoice                  // player choosing which drawn card to keep
	PhaseGameOver                    // game finished
)

var phaseNames = map[GamePhase]string{
	PhaseLobby:      "Lobby",
	PhaseDraftSetup: "DraftSetup",
	PhaseDraftPick:  "DraftPick",
	PhaseResolution: "Resolution",
	PhasePlayerTurn: "PlayerTurn",
	PhaseAbility:    "Ability",
	PhaseDrawChoice: "DrawChoice",
	PhaseGameOver:   "GameOver",
}

func (p GamePhase) String() string {
	if s, ok := phaseNames[p]; ok {
		return s
	}
	return "Unknown"
}
