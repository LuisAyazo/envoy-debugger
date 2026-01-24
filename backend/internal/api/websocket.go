package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

type WSManager struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan interface{}
	mu         sync.RWMutex
}

type Client struct {
	conn *websocket.Conn
	send chan interface{}
	done chan struct{}
}

func NewWSManager() *WSManager {
	return &WSManager{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan interface{}),
	}
}

func (m *WSManager) Start(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case client := <-m.register:
			m.mu.Lock()
			m.clients[client] = true
			m.mu.Unlock()
			log.Println("Client registered")
		case client := <-m.unregister:
			m.mu.Lock()
			if _, ok := m.clients[client]; ok {
				delete(m.clients, client)
				close(client.send)
			}
			m.mu.Unlock()
			log.Println("Client unregistered")
		case message := <-m.broadcast:
			m.mu.RLock()
			for client := range m.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(m.clients, client)
				}
			}
			m.mu.RUnlock()
		}
	}
}

func (m *WSManager) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	client := &Client{
		conn: conn,
		send: make(chan interface{}, 256),
		done: make(chan struct{}),
	}

	m.register <- client

	go client.Write()
	go client.Read()
}

func (c *Client) Read() {
	defer func() {
		close(c.done)
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	for {
		var msg map[string]interface{}
		if err := c.conn.ReadJSON(&msg); err != nil {
			log.Println("WebSocket read error:", err)
			return
		}
		log.Println("Received message:", msg)
	}
}

func (c *Client) Write() {
	defer c.conn.Close()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(60 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			data, err := json.Marshal(msg)
			if err != nil {
				log.Println("JSON marshal error:", err)
				continue
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Println("WebSocket write error:", err)
				return
			}
		case <-c.done:
			return
		}
	}
}

func (m *WSManager) Broadcast(message interface{}) {
	m.broadcast <- message
}
