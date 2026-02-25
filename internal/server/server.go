package server

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
)

// Server ties together HTTP serving and WebSocket handling.
type Server struct {
	handlers *Handlers
	port     int
	static   embed.FS
}

func New(port int, static embed.FS) *Server {
	return &Server{
		handlers: NewHandlers(port),
		port:     port,
		static:   static,
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Static files from embedded FS
	sub, err := fs.Sub(s.static, "web/static")
	if err != nil {
		return fmt.Errorf("static fs: %w", err)
	}
	mux.Handle("/", http.FileServer(http.FS(sub)))

	// API routes
	mux.HandleFunc("/api/create", s.handlers.HandleCreateGame)
	mux.HandleFunc("/api/qr", s.handlers.HandleQR)
	mux.HandleFunc("/api/player-id", s.handlers.HandlePlayerID)
	mux.HandleFunc("/ws", s.handlers.HandleWS)

	addr := fmt.Sprintf(":%d", s.port)
	log.Printf("Citadels server starting on http://localhost%s", addr)
	log.Printf("Open http://localhost%s/api/create to create a new game", addr)
	return http.ListenAndServe(addr, mux)
}
