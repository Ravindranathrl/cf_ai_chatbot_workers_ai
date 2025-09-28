// Cloudflare AI Chatbot Frontend with Realtime
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendButton = document.getElementById('send-button');
  const clearChatButton = document.getElementById('clear-chat');
  const clearAllSessionsButton = document.getElementById('clear-all-sessions');
  const sessionsList = document.getElementById('sessions-list');
  const newChatButton = document.getElementById('new-chat-button');
  const themeToggle = document.getElementById('theme-toggle');
  const modelSelector = document.getElementById('model-selector');
  const realtimeStatus = document.getElementById('realtime-status');
  const statusIndicator = realtimeStatus.querySelector('.status-indicator');
  const statusText = realtimeStatus.querySelector('.status-text');
  
  // Chat sessions state
  let sessions = {};
  let activeSessionId = 'default';
  let sessionCounter = 1;
  
  // Model selection state
  let currentModel = '@cf/meta/llama-3-8b-instruct';
  
  // API Configuration
  // Using the deployed Worker URL
  const API_URL = 'https://ai-chatbot-worker.ravindranath-ramanujamloganathan.workers.dev';
  
  // Initialize the realtime chatbot
  const chatbot = new RealtimeChatbot(API_URL);
  let currentMessageId = null;
  let currentMessageElement = null;
  
  // Connect to the WebSocket
  initializeRealtime();
  
  // Always use dark mode
  document.body.classList.add('dark-mode');
  localStorage.setItem('theme', 'dark');
  
  // Event Listeners
  sendButton.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  clearChatButton.addEventListener('click', clearChatHistory);
  clearAllSessionsButton.addEventListener('click', clearAllSessions);
  
  // Model selection only (theme toggle removed)
  modelSelector.addEventListener('change', (e) => {
    currentModel = e.target.value;
    console.log(`Model changed to: ${currentModel}`);
    
    // Add a system message about the model change
    addMessageToChat(`Model changed to: ${getModelDisplayName(currentModel)}`, 'system');
    
    // Save to session
    saveCurrentSession();
  });
  
  // Chat session listeners
  newChatButton.addEventListener('click', createNewSession);
  
  // Set up initial session
  initializeSessions();
  
  // Session management functions
  function initializeSessions() {
    // Try to load sessions from localStorage
    const savedSessions = localStorage.getItem('chatSessions');
    const activeSession = localStorage.getItem('activeSessionId');
    
    if (savedSessions) {
      sessions = JSON.parse(savedSessions);
      
      // Update session counter
      const sessionIds = Object.keys(sessions);
      if (sessionIds.length > 0) {
        const numericIds = sessionIds
          .filter(id => id !== 'default')
          .map(id => parseInt(id.replace('session_', ''), 10))
          .filter(id => !isNaN(id));
        
        if (numericIds.length > 0) {
          sessionCounter = Math.max(...numericIds) + 1;
        }
      }
    } else {
      // Initialize with default session
      sessions = {
        default: {
          name: 'Chat 1',
          messages: [],
          hasSystemMessage: true
        }
      };
      saveSessionsToStorage();
    }
    
    // Set active session
    activeSessionId = activeSession || 'default';
    
    // Render sessions
    renderSessions();
    
    // Load active session
    loadSession(activeSessionId);
    
    // Set up session event delegation
    sessionsList.addEventListener('click', handleSessionClick);
  }

  function renderSessions() {
    // Clear sessions list
    sessionsList.innerHTML = '';
    
    // Add each session
    Object.keys(sessions).forEach(sessionId => {
      const session = sessions[sessionId];
      const sessionTab = document.createElement('div');
      sessionTab.className = `session-tab ${sessionId === activeSessionId ? 'active' : ''}`;
      sessionTab.dataset.sessionId = sessionId;
      
      sessionTab.innerHTML = `
        <span class="session-name">${session.name}</span>
        <button class="delete-session" data-session-id="${sessionId}" title="Delete chat">
          <i class="fas fa-times"></i>
        </button>
      `;
      
      sessionsList.appendChild(sessionTab);
    });
  }

  function createNewSession() {
    // Generate new session ID
    const newSessionId = `session_${sessionCounter++}`;
    
    // Create new session
    sessions[newSessionId] = {
      name: `Chat ${sessionCounter}`,
      messages: [],
      hasSystemMessage: true
    };
    
    // Save sessions
    saveSessionsToStorage();
    
    // Render sessions
    renderSessions();
    
    // Switch to new session
    switchSession(newSessionId);
  }

  function switchSession(sessionId) {
    // Save current session messages
    saveCurrentSession();
    
    // Set new active session
    activeSessionId = sessionId;
    localStorage.setItem('activeSessionId', activeSessionId);
    
    // Update UI
    renderSessions();
    
    // Load session messages
    loadSession(sessionId);
  }

  function deleteSession(sessionId) {
    // If it's the only session, create a new one first
    if (Object.keys(sessions).length <= 1) {
      // Create a new empty session
      const newSessionId = `session_${sessionCounter++}`;
      sessions[newSessionId] = {
        name: `Chat ${sessionCounter}`,
        messages: [{
          role: 'system',
          content: 'Hello! I\'m your AI assistant. I can remember our conversation even if you refresh the page or come back later. How can I help you today?'
        }],
        hasSystemMessage: true
      };
      
      // Set as active before deleting the old one
      activeSessionId = newSessionId;
      
      // Save sessions
      saveSessionsToStorage();
      
      // Now we can delete the old session
    }
    
    // Delete the session
    delete sessions[sessionId];
    
    // If active session was deleted, switch to first available
    if (sessionId === activeSessionId) {
      activeSessionId = Object.keys(sessions)[0];
    }
    
    // Save sessions
    saveSessionsToStorage();
    
    // Render sessions
    renderSessions();
    
    // Load active session
    loadSession(activeSessionId);
  }

  function handleSessionClick(event) {
    // Check if delete button was clicked
    if (event.target.closest('.delete-session')) {
      const deleteButton = event.target.closest('.delete-session');
      const sessionId = deleteButton.dataset.sessionId;
      deleteSession(sessionId);
      event.stopPropagation();
      return;
    }
    
    // Check if session tab was clicked
    const sessionTab = event.target.closest('.session-tab');
    if (sessionTab) {
      const sessionId = sessionTab.dataset.sessionId;
      if (sessionId !== activeSessionId) {
        switchSession(sessionId);
      }
    }
  }

  function saveCurrentSession() {
    // Get all messages from the chat
    const messageElements = chatMessages.querySelectorAll('.message');
    const messages = [];
    
    messageElements.forEach(element => {
      const role = element.classList.contains('user') ? 'user' : 
                   element.classList.contains('ai') ? 'assistant' : 
                   'system';
      
      const contentElement = element.querySelector('.message-content p');
      if (contentElement) {
        messages.push({
          role: role,
          content: contentElement.textContent
        });
      }
    });
    
    // Save messages to session
    if (sessions[activeSessionId]) {
      sessions[activeSessionId].messages = messages;
      sessions[activeSessionId].hasSystemMessage = messages.some(m => m.role === 'system');
      saveSessionsToStorage();
    }
  }

  function loadSession(sessionId) {
    // Clear chat messages
    chatMessages.innerHTML = '';
    
    // Get session
    const session = sessions[sessionId];
    if (!session) return;
    
    // Add system message if needed
    if (!session.hasSystemMessage || session.messages.length === 0) {
      addMessageToChat('Hello! I\'m your AI assistant. I can remember our conversation even if you refresh the page or come back later. How can I help you today?', 'system');
    } else {
      // Add all messages
      session.messages.forEach(message => {
        addMessageToChat(message.content, message.role);
      });
    }
    
    // No attachments to clear
    
    // Scroll to bottom
    scrollToBottom();
  }

  function saveSessionsToStorage() {
    localStorage.setItem('chatSessions', JSON.stringify(sessions));
  }
  
  // Auto-resize textarea as user types
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
  });
  
  // No file handling functions needed
  
  // Functions
  
  // Initialize the realtime connection
  async function initializeRealtime() {
    try {
      // Set up message handlers
      chatbot.on('message', handleMessage);
      chatbot.on('status', handleStatus);
      chatbot.on('error', handleError);
      chatbot.on('history', handleHistory);
      chatbot.on('cleared', handleCleared);
      
      // Connect to WebSocket
      await chatbot.connect();
      console.log('Connected to realtime chatbot');
      
      // Update status indicator
      statusIndicator.classList.add('connected');
      statusIndicator.classList.remove('disconnected');
      statusText.textContent = 'Connected';
      
      // Load chat history
      chatbot.requestHistory();
    } catch (error) {
      console.error('Failed to initialize realtime:', error);
      showError('Failed to connect to the realtime chatbot. Falling back to REST API.');
      
      // Update status indicator
      statusIndicator.classList.add('disconnected');
      statusIndicator.classList.remove('connected');
      statusText.textContent = 'Disconnected';
      
      // Fall back to REST API
      loadChatHistoryFallback();
    }
  }
  
  // Handle incoming messages
  function handleMessage(data) {
    if (data.isChunk) {
      // This is a chunk of a streaming response
      console.log("Received chunk:", data.content);
      
      // Process the content to handle potential binary data or special formats
      let content = data.content;
      
      // Debug: Log the raw content to see exactly what we're receiving
      console.log("Raw content:", JSON.stringify(content));
      
      // Simple and robust content extraction
      if (typeof content === 'string') {
        console.log("Processing content type: string");
        
        // Check if this looks like the problematic data format
        if (content.includes('data:') && content.includes('"response"')) {
          console.log("Detected streaming data format");
          
          // Extract all text between "response":" and the next quote
          // This approach avoids JSON parsing completely
          let extractedText = '';
          let currentIndex = 0;
          
          while (currentIndex < content.length) {
            const responseIndex = content.indexOf('"response":"', currentIndex);
            if (responseIndex === -1) break;
            
            const startIndex = responseIndex + 12; // Length of '"response":"'
            let endIndex = startIndex;
            
            // Find the closing quote, handling escaped quotes
            while (endIndex < content.length) {
              if (content[endIndex] === '"' && content[endIndex - 1] !== '\\') {
                break;
              }
              endIndex++;
            }
            
            if (endIndex < content.length) {
              const textChunk = content.substring(startIndex, endIndex);
              // Unescape any escaped characters
              const unescapedText = textChunk.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
              extractedText += unescapedText;
              console.log("Extracted chunk:", unescapedText);
            }
            
            currentIndex = endIndex + 1;
          }
          
          if (extractedText) {
            content = extractedText;
            console.log("Final extracted content:", content);
          } else {
            console.log("No content extracted, using original");
          }
        }
        // Handle binary-like data format
        else if (content.startsWith('{"0":')) {
          console.log("Detected binary-like data format");
          try {
            const parsed = JSON.parse(content);
            const chars = Object.values(parsed).map(code => String.fromCharCode(code));
            content = chars.join('');
            console.log("Converted binary data to text:", content);
          } catch (e) {
            console.log("Could not parse binary data, using original content");
          }
        }
      }
      
      if (!currentMessageElement) {
        // Create a new message element for the AI response
        currentMessageElement = document.createElement('div');
        currentMessageElement.className = 'message ai';
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const messageParagraph = document.createElement('p');
        messageParagraph.textContent = content;
        
        messageContent.appendChild(messageParagraph);
        currentMessageElement.appendChild(messageContent);
        chatMessages.appendChild(currentMessageElement);
      } else {
        // Update the existing message with the new chunk
        const messageParagraph = currentMessageElement.querySelector('p');
        messageParagraph.textContent += content;
      }
      
      // Scroll to bottom of chat
      scrollToBottom();
    } else if (data.isComplete) {
      // The message is complete
      currentMessageId = null;
      
      // Save to current session
      if (currentMessageElement) {
        saveCurrentSession();
        currentMessageElement = null;
      }
    }
  }
  
  // Handle status updates
  function handleStatus(data) {
    if (data.status === 'thinking') {
      // Show typing indicator
      addTypingIndicator();
    }
  }
  
  // Handle errors
  function handleError(data) {
    removeTypingIndicator();
    
    // Show more specific error message
    let errorMessage = data.error || 'Unknown error occurred';
    if (data.details) {
      errorMessage += `: ${data.details}`;
    }
    
    showError(`WebSocket Error: ${errorMessage}`);
    console.error('Chatbot error:', data.error, data.details);
    
    // If it's a connection error, fall back to REST API
    if (data.error && data.error.includes('process message')) {
      console.log('Falling back to REST API due to WebSocket error');
      chatbot.connected = false;
    }
  }
  
  // Handle history data
  function handleHistory(data) {
    if (data.messages && data.messages.length > 0) {
      // Clear default system message if we have history
      chatMessages.innerHTML = '';
      
      // Display each message in the chat
      data.messages.forEach(message => {
        addMessageToChat(message.content, message.role);
      });
      
      // Scroll to bottom of chat
      scrollToBottom();
    }
  }
  
  // Handle cleared confirmation
  function handleCleared() {
    // Clear chat UI
    chatMessages.innerHTML = '';
    
    // Add default system message
    addMessageToChat('Hello! I\'m your AI assistant. I can remember our conversation even if you refresh the page or come back later. How can I help you today?', 'system');
    
    // Scroll to bottom of chat
    scrollToBottom();
  }
  
  // Load chat history from the server (fallback)
  async function loadChatHistoryFallback() {
    try {
      const response = await fetch(`${API_URL}/api/history?userId=${chatbot.userId}_${activeSessionId}`);
      const data = await response.json();
      
      if (data.messages && data.messages.length > 0) {
        // Clear default system message if we have history
        chatMessages.innerHTML = '';
        
        // Display each message in the chat
        data.messages.forEach(message => {
          addMessageToChat(message.content, message.role);
        });
        
        // Save to session
        saveCurrentSession();
        
        // Scroll to bottom of chat
        scrollToBottom();
      } else {
        // Try to load from sessions
        loadSession(activeSessionId);
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
      // Try to load from sessions
      loadSession(activeSessionId);
    }
  }
  
  // Send a message to the AI
  async function sendMessage() {
    const message = chatInput.value.trim();
    const hasAttachments = false; // No attachments feature
    
    // Check if there's a message or attachments
    if (!message && !hasAttachments) return;
    
    try {
      // Create message content with attachments
      let messageContent = message;
      let attachmentElements = '';
      let attachmentData = [];
      
      // No attachment processing needed
      
      // Add user message to chat
      addMessageToChat(message, 'user');
      
      // Save to current session
      saveCurrentSession();
      
      // Clear input
      chatInput.value = '';
      chatInput.style.height = 'auto';
      
      // Send message with metadata
      const messageData = {
        message: messageContent,
        attachments: [], // No attachments
        model: currentModel
      };
      
      // Add session ID to the message data
      messageData.sessionId = activeSessionId;
      
      if (chatbot.connected) {
        // Use WebSocket for realtime communication
        console.log('Sending message via WebSocket:', messageData);
        currentMessageId = chatbot.sendMessage(JSON.stringify(messageData));
      } else {
        // Fallback to REST API
        console.log('Falling back to REST API');
        sendMessageFallback(messageData);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      showError(`Failed to send message: ${error.message}`);
    }
    
    // Scroll to bottom of chat
    scrollToBottom();
  }
  
  // No file handling helper functions needed
  
  // Send a message via REST API (fallback)
  async function sendMessageFallback(message) {
    // Show typing indicator
    addTypingIndicator();
    
    try {
      console.log('Sending message to API:', message);
      console.log('API URL:', `${API_URL}/api/chat`);
      
      // Send message to API
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: typeof message === 'object' ? message.message : message,
          attachments: [], // No attachments
          userId: `${chatbot.userId}_${activeSessionId}`
        })
      });
      
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      
      // Remove typing indicator
      removeTypingIndicator();
      
      if (data.error) {
        showError(`Error: ${data.error}`);
      } else {
        // Add AI response to chat
        addMessageToChat(data.response, 'ai');
      }
    } catch (error) {
      // Remove typing indicator
      removeTypingIndicator();
      showError(`Failed to connect to the chatbot: ${error.message}`);
      console.error('Error sending message:', error);
    }
  }
  
  // Clear chat history
  async function clearChatHistory() {
    if (confirm('Are you sure you want to clear the chat history? This cannot be undone.')) {
      try {
        if (chatbot.connected) {
          // Use WebSocket
          chatbot.clearHistory();
        } else {
          // Fallback to REST API
          await fetch(`${API_URL}/api/clear`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: `${chatbot.userId}_${activeSessionId}`
            })
          });
        }
        
        // Clear chat UI
        chatMessages.innerHTML = '';
        
        // Add default system message
        addMessageToChat('Hello! I\'m your AI assistant. I can remember our conversation even if you refresh the page or come back later. How can I help you today?', 'system');
        
        // Update session
        if (sessions[activeSessionId]) {
          sessions[activeSessionId].messages = [{
            role: 'system',
            content: 'Hello! I\'m your AI assistant. I can remember our conversation even if you refresh the page or come back later. How can I help you today?'
          }];
          sessions[activeSessionId].hasSystemMessage = true;
          saveSessionsToStorage();
        }
      } catch (error) {
        showError('Failed to clear chat history. Please try again later.');
        console.error('Error clearing chat history:', error);
      }
    }
  }
  
  // Clear all sessions and reset everything
  async function clearAllSessions() {
    if (confirm('Are you sure you want to clear ALL chat sessions? This will delete everything and cannot be undone.')) {
      try {
        // Clear all sessions from storage
        localStorage.removeItem('chatSessions');
        
        // Clear current session from backend
        if (chatbot.connected) {
          chatbot.clearHistory();
        } else {
          await fetch(`${API_URL}/api/clear`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: `${chatbot.userId}_${activeSessionId}`
            })
          });
        }
        
        // Reset sessions state
        sessions = {};
        activeSessionId = 'default';
        sessionCounter = 1;
        
        // Initialize with default session
        initializeSessions();
        
        // Clear the UI and add fresh message
        chatMessages.innerHTML = '';
        addMessageToChat('Hello! I\'m your AI assistant. All previous conversations have been cleared. How can I help you today?', 'system');
        
        console.log('All sessions cleared successfully');
      } catch (error) {
        console.error('Error clearing all sessions:', error);
        showError('Failed to clear all sessions. Please try again later.');
      }
    }
  }
  
  // Add a message to the chat UI
  function addMessageToChat(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    // Add text content if provided
    if (content) {
      const messageParagraph = document.createElement('p');
      messageParagraph.textContent = content;
      messageContent.appendChild(messageParagraph);
    }
    
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    
    scrollToBottom();
    
    return messageDiv;
  }
  
  // Add typing indicator
  function addTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai typing-indicator-container';
    typingDiv.id = 'typing-indicator';
    
    const typingContent = document.createElement('div');
    typingContent.className = 'typing-indicator';
    
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      typingContent.appendChild(dot);
    }
    
    typingDiv.appendChild(typingContent);
    chatMessages.appendChild(typingDiv);
    
    scrollToBottom();
  }
  
  // Remove typing indicator
  function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }
  
  // Show error message
  function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    
    // Insert at top of chat container
    chatMessages.insertBefore(errorDiv, chatMessages.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
  
  // Scroll to bottom of chat
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
  
  // Theme functions
  function initializeTheme() {
    // Check if theme is stored in localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
      themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
      document.body.classList.remove('dark-mode');
      themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    }
  }
  
  function toggleTheme() {
    if (document.body.classList.contains('dark-mode')) {
      // Switch to light mode
      document.body.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
      themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
      // Switch to dark mode
      document.body.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
      themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
  }
  
  // Model selection functions
  function getModelDisplayName(modelId) {
    const modelMap = {
      '@cf/meta/llama-3-8b-instruct': 'Llama 3 (8B)',
      '@cf/meta/llama-2-7b-chat-int8': 'Llama 2 (7B)',
      '@hf/thebloke/mistral-7b-instruct-v0.1-awq': 'Mistral (7B)'
    };
    
    return modelMap[modelId] || modelId;
  }
});
