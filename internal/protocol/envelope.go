package protocol

import "encoding/json"

// Envelope is the standard WebSocket message wrapper.
type Envelope struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// NewEnvelope creates an envelope with a JSON-encoded payload.
func NewEnvelope(typ string, payload interface{}) (Envelope, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return Envelope{}, err
	}
	return Envelope{Type: typ, Payload: data}, nil
}

// MustEnvelope is like NewEnvelope but panics on error.
func MustEnvelope(typ string, payload interface{}) Envelope {
	e, err := NewEnvelope(typ, payload)
	if err != nil {
		panic(err)
	}
	return e
}
