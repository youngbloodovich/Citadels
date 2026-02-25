package lobby

import (
	"fmt"
	"sync"
)

// PlayerInfo holds lobby-level player information.
type PlayerInfo struct {
	ID    string
	Name  string
	Ready bool
}

// Lobby represents a game lobby waiting for players.
type Lobby struct {
	mu      sync.Mutex
	ID      string
	Players []*PlayerInfo
	MaxPlayers int
	MinPlayers int
	Started bool
}

// NewLobby creates a new lobby.
func NewLobby(id string) *Lobby {
	return &Lobby{
		ID:         id,
		MaxPlayers: 7,
		MinPlayers: 2,
	}
}

// Join adds a player to the lobby.
func (l *Lobby) Join(id, name string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.Started {
		return fmt.Errorf("game already started")
	}
	if len(l.Players) >= l.MaxPlayers {
		return fmt.Errorf("lobby is full")
	}
	// Check for duplicate ID
	for _, p := range l.Players {
		if p.ID == id {
			p.Name = name // allow reconnect with new name
			return nil
		}
	}
	l.Players = append(l.Players, &PlayerInfo{ID: id, Name: name})
	return nil
}

// Leave removes a player from the lobby.
func (l *Lobby) Leave(id string) {
	l.mu.Lock()
	defer l.mu.Unlock()

	for i, p := range l.Players {
		if p.ID == id {
			l.Players = append(l.Players[:i], l.Players[i+1:]...)
			return
		}
	}
}

// SetReady toggles a player's ready state.
func (l *Lobby) SetReady(id string, ready bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	for _, p := range l.Players {
		if p.ID == id {
			p.Ready = ready
			return
		}
	}
}

// CanStart returns true if enough players are ready.
func (l *Lobby) CanStart() bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	if len(l.Players) < l.MinPlayers {
		return false
	}
	for _, p := range l.Players {
		if !p.Ready {
			return false
		}
	}
	return true
}

// Start marks the lobby as started.
func (l *Lobby) Start() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.Started {
		return fmt.Errorf("already started")
	}
	if len(l.Players) < l.MinPlayers {
		return fmt.Errorf("not enough players")
	}
	l.Started = true
	return nil
}

// GetPlayers returns a copy of the player list.
func (l *Lobby) GetPlayers() []PlayerInfo {
	l.mu.Lock()
	defer l.mu.Unlock()

	out := make([]PlayerInfo, len(l.Players))
	for i, p := range l.Players {
		out[i] = *p
	}
	return out
}
