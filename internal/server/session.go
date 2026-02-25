package server

import (
	"crypto/rand"
	"encoding/hex"
)

// GeneratePlayerID creates a unique player ID.
func GeneratePlayerID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
