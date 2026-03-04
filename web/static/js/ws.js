// Shared WebSocket manager with reconnect
class WS {
    constructor(url, onMessage, onOpen, onClose) {
        this.url = url;
        this.onMessage = onMessage;
        this.onOpen = onOpen || (() => {});
        this.onClose = onClose || (() => {});
        this.ws = null;
        this.reconnectDelay = 1000;
        this.maxReconnectDelay = 10000;
        this.reconnectTimer = null;
        this.connect();

        // Force reconnect when page becomes visible (iOS screen lock fix)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                    this.reconnectDelay = 1000;
                    this.connect();
                }
            }
        });
    }

    connect() {
        // Detach old WebSocket handlers to prevent stale onclose from cascading
        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            try { this.ws.close(); } catch (e) {}
        }

        // Clear any pending reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.ws = new WebSocket(this.url);
        this.ws.onopen = () => {
            this.reconnectDelay = 1000;
            this.onOpen();
        };
        this.ws.onmessage = (e) => {
            try {
                const env = JSON.parse(e.data);
                this.onMessage(env);
            } catch (err) {
                console.error('WS parse error:', err);
            }
        };
        this.ws.onclose = () => {
            this.onClose();
            this.scheduleReconnect();
        };
        this.ws.onerror = () => {};
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }

    send(type, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }
}
