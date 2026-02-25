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

func generateID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
