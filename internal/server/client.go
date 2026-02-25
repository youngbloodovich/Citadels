package server

import (
	"citadels/internal/protocol"
	"encoding/json"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

// ClientType distinguishes TV from player connections.
type ClientType int

const (
	ClientTV     ClientType = 0
	ClientPlayer ClientType = 1
)

// Client represents a single WebSocket connection.
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	PlayerID string
	Type     ClientType
}

func NewClient(hub *Hub, conn *websocket.Conn, playerID string, clientType ClientType) *Client {
	return &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan []byte, 256),
		PlayerID: playerID,
		Type:     clientType,
	}
}

// ReadPump reads messages from the WebSocket and forwards to the hub.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("ws read error: %v", err)
			}
			break
		}
		var env protocol.Envelope
		if err := json.Unmarshal(message, &env); err != nil {
			log.Printf("ws parse error: %v", err)
			continue
		}
		c.hub.incoming <- IncomingMessage{Client: c, Envelope: env}
	}
}

// WritePump writes messages from the send channel to the WebSocket.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// SendEnvelope sends a typed message to this client.
func (c *Client) SendEnvelope(env protocol.Envelope) {
	data, err := json.Marshal(env)
	if err != nil {
		log.Printf("marshal error: %v", err)
		return
	}
	select {
	case c.send <- data:
	default:
		log.Printf("client %s send buffer full, dropping message", c.PlayerID)
	}
}

// IncomingMessage pairs a message with its source client.
type IncomingMessage struct {
	Client   *Client
	Envelope protocol.Envelope
}
