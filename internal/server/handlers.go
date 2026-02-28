package server

import (
	"citadels/internal/lobby"
	qr "citadels/internal/qrcode"
	"fmt"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Handlers holds HTTP handler dependencies.
type Handlers struct {
	LobbyMgr *lobby.Manager
	Hubs     map[string]*Hub
	Port     int
}

func NewHandlers(port int) *Handlers {
	return &Handlers{
		LobbyMgr: lobby.NewManager(),
		Hubs:     make(map[string]*Hub),
		Port:     port,
	}
}

// HandleCreateGame creates a new game lobby and returns its ID.
func (h *Handlers) HandleCreateGame(w http.ResponseWriter, r *http.Request) {
	gameID := h.LobbyMgr.Create()
	lob := h.LobbyMgr.Get(gameID)
	hub := NewHub(gameID, lob)
	h.Hubs[gameID] = hub
	go hub.Run()

	http.Redirect(w, r, fmt.Sprintf("/tv.html?game=%s", gameID), http.StatusSeeOther)
}

// HandleQR generates a QR code PNG for joining the game.
func (h *Handlers) HandleQR(w http.ResponseWriter, r *http.Request) {
	gameID := r.URL.Query().Get("game")
	if gameID == "" {
		http.Error(w, "missing game parameter", http.StatusBadRequest)
		return
	}
	host := r.Host
	url := fmt.Sprintf("http://%s/lobby.html?game=%s", host, gameID)
	png, err := qr.Generate(url)
	if err != nil {
		http.Error(w, "QR generation failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Write(png)
}

// HandleWS handles WebSocket connections.
func (h *Handlers) HandleWS(w http.ResponseWriter, r *http.Request) {
	gameID := r.URL.Query().Get("game")
	playerID := r.URL.Query().Get("player")
	clientType := r.URL.Query().Get("type") // "tv" or "player"

	if gameID == "" {
		http.Error(w, "missing game parameter", http.StatusBadRequest)
		return
	}
	hub, ok := h.Hubs[gameID]
	if !ok {
		http.Error(w, "game not found", http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	ct := ClientPlayer
	if clientType == "tv" {
		ct = ClientTV
	}

	client := NewClient(hub, conn, playerID, ct)
	hub.register <- client

	go client.WritePump()
	go client.ReadPump()
}

// HandlePlayerID returns a new player ID.
func (h *Handlers) HandlePlayerID(w http.ResponseWriter, r *http.Request) {
	id := GeneratePlayerID()
	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(id))
}
