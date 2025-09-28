// Chat Sessions Management for Cloudflare AI Chatbot

// Session management functions to be included in app.js
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
  // Don't delete if it's the only session
  if (Object.keys(sessions).length <= 1) {
    alert('Cannot delete the only chat session');
    return;
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
  
  // Clear attachments
  clearAttachments();
  
  // Scroll to bottom
  scrollToBottom();
}

function saveSessionsToStorage() {
  localStorage.setItem('chatSessions', JSON.stringify(sessions));
}
