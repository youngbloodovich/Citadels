package lobby

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
)

// Manager manages multiple lobbies.
type Manager struct {
	mu      sync.Mutex
	lobbies map[string]*Lobby
}

func NewManager() *Manager {
	return &Manager{lobbies: make(map[string]*Lobby)}
}

// Create creates a new lobby and returns its ID.
func (m *Manager) Create() string {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := generateID()
	m.lobbies[id] = NewLobby(id)
	return id
}

// Get returns a lobby by ID.
func (m *Manager) Get(id string) *Lobby {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lobbies[id]
}

// LobbyInfo holds summary info about a lobby for listing.
type LobbyInfo struct {
	ID          string   `json:"id"`
	Players     int      `json:"players"`
	MaxPlayers  int      `json:"max_players"`
	PlayerNames []string `json:"player_names"`
}

// ListActive returns lobbies that are not started and not full.
func (m *Manager) ListActive() []LobbyInfo {
	m.mu.Lock()
	defer m.mu.Unlock()

	var result []LobbyInfo
	for _, lob := range m.lobbies {
		lob.mu.Lock()
		if !lob.Started && len(lob.Players) < lob.MaxPlayers {
			names := make([]string, len(lob.Players))
			for i, p := range lob.Players {
				names[i] = p.Name
			}
			result = append(result, LobbyInfo{
				ID:          lob.ID,
				Players:     len(lob.Players),
				MaxPlayers:  lob.MaxPlayers,
				PlayerNames: names,
			})
		}
		lob.mu.Unlock()
	}
	return result
}

func generateID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
