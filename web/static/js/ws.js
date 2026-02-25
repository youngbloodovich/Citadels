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
        this.connect();
    }

    connect() {
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
            setTimeout(() => this.connect(), this.reconnectDelay);
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
        };
        this.ws.onerror = () => {};
    }

    send(type, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }
}
