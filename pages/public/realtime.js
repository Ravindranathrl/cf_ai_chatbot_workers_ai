// Cloudflare AI Chatbot Realtime Frontend
class RealtimeChatbot {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
    this.wsUrl = apiUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    this.socket = null;
    this.userId = localStorage.getItem('chatUserId') || null;
    this.connected = false;
    this.messageCallbacks = {
      message: [],
      status: [],
      error: [],
      history: [],
      cleared: []
    };
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  // Connect to WebSocket
  connect() {
    return new Promise((resolve, reject) => {
      try {
        // Convert http/https to ws/wss
        const wsUrl = this.apiUrl.replace('http://', 'ws://').replace('https://', 'wss://');
        console.log('Connecting to WebSocket:', wsUrl);
        
        // Create WebSocket connection to the /api/ws endpoint
        this.socket = new WebSocket(`${wsUrl}/api/ws`);
        
        this.socket.onopen = () => {
          console.log('WebSocket connection established');
          this.reconnectAttempts = 0;
          
          // Send connect message
          this.socket.send(JSON.stringify({
            type: 'connect',
            userId: this.userId
          }));
        };
        
        this.socket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          switch (data.type) {
            case 'connected':
              this.connected = true;
              this.userId = data.userId;
              localStorage.setItem('chatUserId', this.userId);
              resolve(data.userId);
              break;
              
            case 'chunk':
              this._triggerCallbacks('message', {
                content: data.content,
                isChunk: true
              });
              break;
              
            case 'complete':
              this._triggerCallbacks('message', {
                messageId: data.messageId,
                isComplete: true
              });
              break;
              
            case 'status':
              this._triggerCallbacks('status', {
                status: data.status
              });
              break;
              
            case 'history':
              this._triggerCallbacks('history', {
                messages: data.messages
              });
              break;
              
            case 'cleared':
              this._triggerCallbacks('cleared', {});
              break;
              
            case 'error':
              console.error('WebSocket error:', data.error, data.details);
              this._triggerCallbacks('error', {
                error: data.error,
                details: data.details
              });
              break;
              
            default:
              console.warn('Unknown message type:', data.type);
          }
        };
        
        this.socket.onclose = (event) => {
          console.log('WebSocket connection closed', event);
          this.connected = false;
          
          // Attempt to reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Reconnecting (attempt ${this.reconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
          } else {
            console.error('Max reconnect attempts reached');
            reject(new Error('Failed to maintain WebSocket connection'));
          }
        };
        
        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error);
        reject(error);
      }
    });
  }
  
  // Send a chat message
  sendMessage(message, messageId = crypto.randomUUID()) {
    if (!this.connected) {
      throw new Error('Not connected to WebSocket');
    }
    
    this.socket.send(JSON.stringify({
      type: 'chat',
      userId: this.userId,
      content: message,
      messageId: messageId
    }));
    
    return messageId;
  }
  
  // Request chat history
  requestHistory() {
    if (!this.connected) {
      throw new Error('Not connected to WebSocket');
    }
    
    this.socket.send(JSON.stringify({
      type: 'history',
      userId: this.userId
    }));
  }
  
  // Clear chat history
  clearHistory() {
    if (!this.connected) {
      throw new Error('Not connected to WebSocket');
    }
    
    this.socket.send(JSON.stringify({
      type: 'clear',
      userId: this.userId
    }));
  }
  
  // Register event callbacks
  on(event, callback) {
    if (this.messageCallbacks[event]) {
      this.messageCallbacks[event].push(callback);
    }
    return this;
  }
  
  // Trigger callbacks for an event
  _triggerCallbacks(event, data) {
    if (this.messageCallbacks[event]) {
      this.messageCallbacks[event].forEach(callback => callback(data));
    }
  }
  
  // Close the WebSocket connection
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.connected = false;
    }
  }
}

// Export the class
window.RealtimeChatbot = RealtimeChatbot;
