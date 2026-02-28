package protocol

// Message types: Server → Client
const (
	MsgLobbyUpdate     = "lobby_update"
	MsgGameState       = "game_state"
	MsgPlayerState     = "player_state"
	MsgDraftUpdate     = "draft_update"
	MsgDraftPick       = "draft_pick"
	MsgYourTurn        = "your_turn"
	MsgCharacterCalled = "character_called"
	MsgDistrictBuilt   = "district_built"
	MsgAbilityPrompt   = "ability_prompt"
	MsgDrawChoice      = "draw_choice"
	MsgGameOver        = "game_over"
	MsgError           = "error"
	MsgEvent           = "event"
)

// Message types: Client → Server
const (
	MsgJoin      = "join"
	MsgReady     = "ready"
	MsgStartGame = "start_game"
	// In-game actions use the same names as engine ActionType
	MsgDraftPickAction = "draft_pick"
	MsgTakeGold        = "take_gold"
	MsgDrawCards       = "draw_cards"
	MsgKeepCard        = "keep_card"
	MsgBuild           = "build"
	MsgAbility         = "ability"
	MsgEndTurn         = "end_turn"
	MsgLabDiscard        = "lab_discard"
	MsgSmithyDraw        = "smithy_draw"
	MsgGraveyardRespond  = "graveyard_respond"
)

// LobbyUpdate is sent to all clients when lobby state changes.
type LobbyUpdate struct {
	GameID  string       `json:"game_id"`
	Players []LobbyPlayer `json:"players"`
	Started bool         `json:"started"`
}

type LobbyPlayer struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Ready bool   `json:"ready"`
}

// JoinMsg is sent by a player to join the game.
type JoinMsg struct {
	PlayerID string `json:"player_id"`
	Name     string `json:"name"`
}

// ReadyMsg is sent by a player to toggle ready state.
type ReadyMsg struct {
	Ready bool `json:"ready"`
}

// ErrorMsg is sent to a client on error.
type ErrorMsg struct {
	Message string `json:"message"`
}
