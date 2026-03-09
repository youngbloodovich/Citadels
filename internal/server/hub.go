package server

import (
	"citadels/internal/engine"
	"citadels/internal/engine/abilities"
	"citadels/internal/lobby"
	"citadels/internal/protocol"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"
)

const turnTimerDuration = 60 * time.Second

// Hub manages WebSocket connections and game state for one game room.
type Hub struct {
	mu         sync.Mutex
	gameID     string
	lobby      *lobby.Lobby
	game       *engine.Game
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	incoming   chan IncomingMessage
	quit       chan struct{}

	turnTimer     *time.Timer
	timerDeadline int64 // Unix milliseconds
}

func NewHub(gameID string, lob *lobby.Lobby) *Hub {
	return &Hub{
		gameID:     gameID,
		lobby:      lob,
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		incoming:   make(chan IncomingMessage, 256),
		quit:       make(chan struct{}),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			h.sendLobbyUpdate()
			if h.game != nil {
				h.sendStateToClient(client)
			}

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case msg := <-h.incoming:
			h.handleMessage(msg)

		case <-h.quit:
			return
		}
	}
}

func (h *Hub) handleMessage(msg IncomingMessage) {
	switch msg.Envelope.Type {
	case "timer_expired":
		h.handleTimerExpired()
	case protocol.MsgJoin:
		h.handleJoin(msg)
	case protocol.MsgLeave:
		h.handleLeave(msg)
	case protocol.MsgReady:
		h.handleReady(msg)
	case protocol.MsgStartGame:
		h.handleStartGame(msg)
	default:
		h.handleGameAction(msg)
	}
}

func (h *Hub) handleJoin(msg IncomingMessage) {
	var join protocol.JoinMsg
	if err := json.Unmarshal(msg.Envelope.Payload, &join); err != nil {
		h.sendError(msg.Client, "invalid join message")
		return
	}
	msg.Client.PlayerID = join.PlayerID

	// Game already in progress — just update client PlayerID, state was sent on register
	if h.lobby.Started {
		h.sendStateToClient(msg.Client)
		return
	}

	if err := h.lobby.Join(join.PlayerID, join.Name); err != nil {
		h.sendError(msg.Client, err.Error())
		return
	}
	h.sendLobbyUpdate()
}

func (h *Hub) handleLeave(msg IncomingMessage) {
	if h.lobby.Started {
		return
	}
	h.lobby.Leave(msg.Client.PlayerID)
	h.sendLobbyUpdate()
}

func (h *Hub) handleReady(msg IncomingMessage) {
	var ready protocol.ReadyMsg
	if err := json.Unmarshal(msg.Envelope.Payload, &ready); err != nil {
		h.sendError(msg.Client, "invalid ready message")
		return
	}
	h.lobby.SetReady(msg.Client.PlayerID, ready.Ready)
	h.sendLobbyUpdate()
}

func (h *Hub) handleStartGame(msg IncomingMessage) {
	if !h.lobby.CanStart() {
		h.sendError(msg.Client, "not all players ready")
		return
	}
	if err := h.lobby.Start(); err != nil {
		h.sendError(msg.Client, err.Error())
		return
	}

	// Create engine game
	lobbyPlayers := h.lobby.GetPlayers()
	players := make([]*engine.Player, len(lobbyPlayers))
	for i, lp := range lobbyPlayers {
		players[i] = engine.NewPlayer(lp.ID, lp.Name)
	}

	reg := engine.NewAbilityRegistry()
	reg.Register(abilities.Assassin{})
	reg.Register(abilities.Thief{})
	reg.Register(abilities.Magician{})
	reg.Register(abilities.King{})
	reg.Register(abilities.Bishop{})
	reg.Register(abilities.Merchant{})
	reg.Register(abilities.Architect{})
	reg.Register(abilities.Warlord{})

	h.game = engine.NewGame(players, engine.DefaultConfig(), reg)
	events := h.game.StartGame()
	h.broadcastEvents(events)
	h.broadcastState()
}

func (h *Hub) handleGameAction(msg IncomingMessage) {
	if h.game == nil {
		h.sendError(msg.Client, "game not started")
		return
	}

	action, err := h.parseAction(msg.Envelope)
	if err != nil {
		h.sendError(msg.Client, err.Error())
		return
	}

	events, err := h.game.Apply(msg.Client.PlayerID, action)
	if err != nil {
		h.sendError(msg.Client, err.Error())
		return
	}

	h.broadcastEvents(events)
	h.broadcastState()
}

func (h *Hub) parseAction(env protocol.Envelope) (engine.Action, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(env.Payload, &raw); err != nil {
		return engine.Action{}, fmt.Errorf("invalid payload")
	}

	action := engine.Action{Type: engine.ActionType(env.Type)}

	if v, ok := raw["character"]; ok {
		var c int
		json.Unmarshal(v, &c)
		action.Character = engine.CharacterRole(c)
	}
	if v, ok := raw["district_name"]; ok {
		json.Unmarshal(v, &action.DistrictName)
	}
	if v, ok := raw["target"]; ok {
		json.Unmarshal(v, &action.Target)
	}
	if v, ok := raw["index"]; ok {
		json.Unmarshal(v, &action.Index)
	}
	if v, ok := raw["extra_data"]; ok {
		json.Unmarshal(v, &action.ExtraData)
	}
	if v, ok := raw["indices"]; ok {
		json.Unmarshal(v, &action.Indices)
	}

	return action, nil
}

func (h *Hub) broadcastEvents(events []engine.Event) {
	for _, ev := range events {
		env := protocol.MustEnvelope(protocol.MsgEvent, ev)
		h.broadcastAll(env)
	}
}

func (h *Hub) broadcastState() {
	if h.game == nil {
		h.stopTimer()
		return
	}

	if h.isActionablePhase() {
		h.startTimer()
	} else {
		h.stopTimer()
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for client := range h.clients {
		h.sendStateToClient(client)
	}
}

func (h *Hub) sendStateToClient(client *Client) {
	if h.game == nil {
		return
	}
	if client.Type == ClientTV {
		pv := h.game.PublicView()
		pv.TimerDeadline = h.timerDeadline
		env := protocol.MustEnvelope(protocol.MsgGameState, pv)
		client.SendEnvelope(env)
	} else {
		view := h.game.ViewFor(client.PlayerID)
		view.TimerDeadline = h.timerDeadline
		env := protocol.MustEnvelope(protocol.MsgPlayerState, view)
		client.SendEnvelope(env)
	}
}

func (h *Hub) sendLobbyUpdate() {
	players := h.lobby.GetPlayers()
	lps := make([]protocol.LobbyPlayer, len(players))
	for i, p := range players {
		lps[i] = protocol.LobbyPlayer{ID: p.ID, Name: p.Name, Ready: p.Ready}
	}
	env := protocol.MustEnvelope(protocol.MsgLobbyUpdate, protocol.LobbyUpdate{
		GameID:  h.gameID,
		Players: lps,
		Started: h.lobby.Started,
	})
	h.broadcastAll(env)
}

func (h *Hub) broadcastAll(env protocol.Envelope) {
	h.mu.Lock()
	defer h.mu.Unlock()

	data, err := json.Marshal(env)
	if err != nil {
		log.Printf("broadcast marshal error: %v", err)
		return
	}
	for client := range h.clients {
		select {
		case client.send <- data:
		default:
			log.Printf("client %s buffer full", client.PlayerID)
		}
	}
}

func (h *Hub) sendError(client *Client, message string) {
	env := protocol.MustEnvelope(protocol.MsgError, protocol.ErrorMsg{Message: message})
	client.SendEnvelope(env)
}

// isActionablePhase returns true if the current game phase requires player input.
func (h *Hub) isActionablePhase() bool {
	if h.game == nil {
		return false
	}
	switch h.game.Phase {
	case engine.PhaseDraftPick, engine.PhaseDrawChoice, engine.PhasePlayerTurn:
		return true
	default:
		return h.game.PendingGraveyard != nil
	}
}

func (h *Hub) startTimer() {
	if h.turnTimer != nil {
		h.turnTimer.Stop()
	}
	h.timerDeadline = time.Now().Add(turnTimerDuration).UnixMilli()
	h.turnTimer = time.AfterFunc(turnTimerDuration, func() {
		h.incoming <- IncomingMessage{
			Envelope: protocol.Envelope{Type: "timer_expired"},
		}
	})
}

func (h *Hub) stopTimer() {
	if h.turnTimer != nil {
		h.turnTimer.Stop()
		h.turnTimer = nil
	}
	h.timerDeadline = 0
}

func (h *Hub) handleTimerExpired() {
	if h.game == nil {
		return
	}

	var events []engine.Event
	var err error

	switch {
	case h.game.PendingGraveyard != nil:
		// Auto-decline graveyard
		pid := h.game.PendingGraveyard.PlayerID
		events, err = h.game.Apply(pid, engine.Action{
			Type:      engine.ActionGraveyardRespond,
			ExtraData: "decline",
		})

	case h.game.Phase == engine.PhaseDraftPick && h.game.Draft != nil:
		// Auto-pick random available character
		pid := h.game.Draft.CurrentPickerID()
		if pid == "" {
			return
		}
		role := h.game.Draft.Available[rand.Intn(len(h.game.Draft.Available))]
		events, err = h.game.Apply(pid, engine.Action{
			Type:      engine.ActionDraftPick,
			Character: role,
		})

	case h.game.Phase == engine.PhaseDrawChoice:
		// Auto-keep first card
		pid := h.game.CurrentTurnPlayer
		events, err = h.game.Apply(pid, engine.Action{
			Type:  engine.ActionKeepCard,
			Index: 0,
		})

	case h.game.Phase == engine.PhasePlayerTurn:
		pid := h.game.CurrentTurnPlayer
		p := h.game.GetPlayer(pid)
		if p == nil {
			return
		}
		if !p.TookAction {
			// Take gold first
			events, err = h.game.Apply(pid, engine.Action{Type: engine.ActionTakeGold})
			if err != nil {
				log.Printf("timer auto take_gold error: %v", err)
				return
			}
			h.broadcastEvents(events)
		}
		// Collect gold for matching districts (free action, always beneficial)
		if !p.CollectedGold {
			collectEvents, collectErr := h.game.Apply(pid, engine.Action{Type: engine.ActionCollectGold})
			if collectErr == nil {
				h.broadcastEvents(collectEvents)
			}
		}
		// End turn
		events, err = h.game.Apply(pid, engine.Action{Type: engine.ActionEndTurn})

	default:
		return
	}

	if err != nil {
		log.Printf("timer auto-action error: %v", err)
		return
	}

	h.broadcastEvents(events)
	h.broadcastState()
}
