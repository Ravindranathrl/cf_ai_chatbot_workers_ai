/**
 * Cloudflare AI Chatbot with Realtime
 * 
 * This module implements WebSocket support for real-time communication
 * between the client and the AI chatbot.
 */

// Handle WebSocket connections
export async function handleWebSocket(webSocket: WebSocket, env: any) {
  // Store active connections to the Durable Object
  const sessions = new Map();
  
  // Handle messages from the client
  webSocket.addEventListener("message", async (event) => {
    try {
      const message = JSON.parse(event.data as string);
      
      switch (message.type) {
        case "connect":
          // Initialize connection with user ID
          const userId = message.userId || crypto.randomUUID();
          
          // Get Durable Object for this user
          const id = env.CHAT_SESSION.idFromName(userId);
          const chatSession = env.CHAT_SESSION.get(id);
          
          // Store the session
          sessions.set(userId, chatSession);
          
          // Send confirmation
          webSocket.send(JSON.stringify({
            type: "connected",
            userId: userId
          }));
          break;
          
        case "chat":
          // Handle chat message
          if (!message.userId || !sessions.has(message.userId)) {
            webSocket.send(JSON.stringify({
              type: "error",
              error: "Not connected. Send a connect message first."
            }));
            return;
          }
          
          // Get the chat session
          const session = sessions.get(message.userId);
          
          // Forward the message to the Durable Object
          const response = await session.fetch(new Request("https://chat-session.internal/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              message: message.content,
              userId: message.userId
            })
          }));
          
          // Get the response data
          const responseData = await response.json();
          
          // Save to KV as backup
          if (responseData.history) {
            await env.CHAT_HISTORY.put(
              `chat:${message.userId}`, 
              JSON.stringify(responseData.history)
            );
          }
          
          // Prepare messages for AI (now with updated history)
          // Truncate conversation history to prevent context window overflow
          const maxMessages = 15; // Keep only recent messages to stay under 4096 token limit
          const recentHistory = (responseData.history || []).slice(-maxMessages);
          
          const aiMessages = [
            { role: "system", content: "You are a helpful AI assistant running on Cloudflare Workers. You have access to previous conversation history and can remember what users tell you." },
            ...recentHistory
          ];
          
          // Send "thinking" status
          webSocket.send(JSON.stringify({
            type: "status",
            status: "thinking"
          }));
          
          try {
            console.log(`Calling AI with streaming - ${aiMessages.length} messages (truncated from ${(responseData.history || []).length} total messages)`);
            console.log("WebSocket AI messages:", JSON.stringify(aiMessages));
            
            // Stream the AI response
            const stream = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", {
              messages: aiMessages,
              stream: true
            });
            
            console.log("AI stream created successfully");
            
            // Process the stream
            const reader = stream.getReader();
            const decoder = new TextDecoder();
            let aiResponse = "";
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              console.log("Stream value:", JSON.stringify(value));
              
              // Normalize chunk to text (SSE lines)
              let chunkText = "";
              if (typeof value === 'string') {
                chunkText = value;
              } else if (value instanceof Uint8Array) {
                chunkText = decoder.decode(value);
              } else if (typeof value === 'object' && value !== null) {
                // Likely a Uint8Array-like object {"0":100, ...}
                try {
                  const bytes = Uint8Array.from(Object.values(value) as number[]);
                  chunkText = decoder.decode(bytes);
                } catch {
                  chunkText = String(value);
                }
              } else {
                chunkText = String(value);
              }
              
              // Parse SSE: lines beginning with "data: "
              let responseText = "";
              const lines = chunkText.split("\n");
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;
                
                try {
                  const json = JSON.parse(payload);
                  if (typeof json === 'object' && json !== null) {
                    if (typeof json.response === 'string' && json.response.length > 0) {
                      responseText += json.response;
                    } else if (typeof json.text === 'string' && json.text.length > 0) {
                      responseText += json.text;
                    }
                    // Ignore usage/metadata-only chunks
                  }
                } catch {
                  // Not JSON, append as-is if it's plain text
                  if (payload && payload !== "[DONE]") {
                    responseText += payload;
                  }
                }
              }
              
              if (!responseText) {
                // Nothing to emit for this chunk
                continue;
              }
              
              // Append to the full response
              aiResponse += responseText;
              
              // Send the chunk to the client (plain text only)
              webSocket.send(JSON.stringify({
                type: "chunk",
                content: responseText
              }));
            }
            
            // Update the Durable Object with the complete response
            await session.fetch(new Request("https://chat-session.internal/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                response: aiResponse,
                userId: message.userId
              })
            }));
            
            // Send completion message
            webSocket.send(JSON.stringify({
              type: "complete",
              messageId: message.messageId
            }));
          } catch (aiError) {
            console.error("AI Error:", aiError);
            webSocket.send(JSON.stringify({
              type: "error",
              error: "Failed to generate AI response",
              details: aiError.message
            }));
          }
          break;
          
        case "history":
          // Get chat history
          if (!message.userId) {
            webSocket.send(JSON.stringify({
              type: "error",
              error: "User ID is required"
            }));
            return;
          }
          
          // Get Durable Object for this user if not already connected
          const historyId = env.CHAT_SESSION.idFromName(message.userId);
          const historySession = sessions.get(message.userId) || env.CHAT_SESSION.get(historyId);
          
          // Get history from the Durable Object
          const historyResponse = await historySession.fetch(new Request("https://chat-session.internal/history", {
            method: "GET"
          }));
          
          const historyData = await historyResponse.json();
          
          // Send history to the client
          webSocket.send(JSON.stringify({
            type: "history",
            messages: historyData.messages || []
          }));
          break;
          
        case "clear":
          // Clear chat history
          if (!message.userId || !sessions.has(message.userId)) {
            webSocket.send(JSON.stringify({
              type: "error",
              error: "Not connected. Send a connect message first."
            }));
            return;
          }
          
          // Get the chat session
          const clearSession = sessions.get(message.userId);
          
          // Clear history in the Durable Object
          await clearSession.fetch(new Request("https://chat-session.internal/clear", {
            method: "POST"
          }));
          
          // Clear from KV as well
          await env.CHAT_HISTORY.delete(`chat:${message.userId}`);
          
          // Send confirmation
          webSocket.send(JSON.stringify({
            type: "cleared"
          }));
          break;
          
        default:
          webSocket.send(JSON.stringify({
            type: "error",
            error: "Unknown message type"
          }));
      }
    } catch (error) {
      console.error("WebSocket error:", error);
      console.error("Error details:", error.message);
      console.error("Error stack:", error.stack);
      console.error("Message that caused error:", JSON.stringify(message));
      webSocket.send(JSON.stringify({
        type: "error",
        error: "Failed to process message",
        details: error.message
      }));
    }
  });
  
  // Handle connection close
  webSocket.addEventListener("close", () => {
    // Clean up resources
    sessions.clear();
  });
  
  // Handle errors
  webSocket.addEventListener("error", (error) => {
    console.error("WebSocket error:", error);
  });
}
