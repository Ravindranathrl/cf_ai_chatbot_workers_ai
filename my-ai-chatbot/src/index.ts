/**
 * Cloudflare AI Chatbot with Memory, Realtime, and File Attachments
 * 
 * This worker handles chat interactions using Workers AI (Llama 3)
 * and stores conversation history in Durable Objects and KV.
 * It also supports real-time communication via WebSockets and file attachments.
 */

import { handleWebSocket } from './realtime';

// Define the ChatSession Durable Object for maintaining conversation state
export class ChatSession {
  private state: DurableObjectState;
  private messages: Array<{ role: string; content: string }> = [];
  private userId: string | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
    // Try to load existing conversation from storage
    this.state.blockConcurrencyWhile(async () => {
      const storedMessages = await this.state.storage.get("messages");
      const storedUserId = await this.state.storage.get("userId");
      
      if (storedMessages) {
        this.messages = storedMessages;
      }
      
      if (storedUserId) {
        this.userId = storedUserId;
      }
    });
  }

  // Handle requests to this Durable Object
  async fetch(request: Request, env?: any) {
    const url = new URL(request.url);
    
    // Handle different endpoints
    switch (url.pathname) {
      case "/chat":
        if (request.method === "POST") {
          const data = await request.json();
          return await this.handleChat(data, env);
        }
        break;
      
      case "/update":
        if (request.method === "POST") {
          const data = await request.json();
          return await this.updateChat(data);
        }
        break;
      
      case "/history":
        if (request.method === "GET") {
          return new Response(JSON.stringify({ messages: this.messages }), {
            headers: { "Content-Type": "application/json" }
          });
        }
        break;
      
      case "/clear":
        if (request.method === "POST") {
          this.messages = [];
          await this.state.storage.put("messages", this.messages);
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" }
          });
        }
        break;
    }

    return new Response("Not found", { status: 404 });
  }

  // Process chat messages using Workers AI
  async handleChat(data: any, env: any) {
    try {
      // Extract user message and ID
      let userMessage = data.message || '';
      
      if (data.userId) {
        this.userId = data.userId;
        await this.state.storage.put("userId", this.userId);
      }
      
      // If the message is a JSON string (from WebSocket), parse it
      if (typeof userMessage === 'string' && userMessage.startsWith('{') && userMessage.endsWith('}')) {
        try {
          const parsedData = JSON.parse(userMessage);
          userMessage = parsedData.message || '';
        } catch (e) {
          // If parsing fails, use the message as-is
          console.error('Error parsing message JSON:', e);
        }
      }

      // Add user message to conversation history
      this.messages.push({ role: "user", content: userMessage });
      
      // Truncate conversation history if it gets too long to prevent context window issues
      const maxStoredMessages = 50; // Keep more in storage, but we'll truncate when sending to AI
      if (this.messages.length > maxStoredMessages) {
        // Keep the most recent messages
        this.messages = this.messages.slice(-maxStoredMessages);
      }
      
      // Save updated conversation to storage
      await this.state.storage.put("messages", this.messages);
      
      // Return the conversation history (AI response will be generated in main worker)
      return new Response(JSON.stringify({ 
        history: this.messages
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  
  // Update chat with AI response (used for WebSocket streaming)
  async updateChat(data: any) {
    try {
      // Extract data
      const { response, userId } = data;
      
      if (userId) {
        this.userId = userId;
        await this.state.storage.put("userId", this.userId);
      }
      
      // Add AI response to conversation history
      this.messages.push({ role: "assistant", content: response });
      
      // Truncate conversation history if it gets too long
      const maxStoredMessages = 50;
      if (this.messages.length > maxStoredMessages) {
        this.messages = this.messages.slice(-maxStoredMessages);
      }
      
      // Save updated conversation to storage
      await this.state.storage.put("messages", this.messages);
      
      // Return success response
      return new Response(JSON.stringify({ 
        success: true,
        history: this.messages
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
}

// Main Worker code
export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS for frontend requests
    if (request.method === "OPTIONS") {
      return handleCORS(request);
    }

    // Add CORS headers to all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Check for WebSocket upgrade
      if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
        // Handle WebSocket connection
        if (path === "/api/ws") {
          console.log("WebSocket connection requested");
          
          try {
            // Create a new WebSocket pair
            const pair = new WebSocketPair();
            const [client, server] = [pair[0], pair[1]];
            
            // Accept the WebSocket connection
            server.accept();
            
            // Handle the WebSocket connection
            handleWebSocket(server, env);
            
            // Return the client end of the WebSocket to the client
            return new Response(null, {
              status: 101,
              webSocket: client,
            });
          } catch (wsError) {
            console.error("WebSocket error:", wsError);
            return new Response(JSON.stringify({ error: "Failed to establish WebSocket connection", details: wsError.message }), {
              status: 500,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            });
          }
        }
      }
      
      // Route HTTP requests to the appropriate handler
      if (path.startsWith("/api/chat")) {
        return await handleChatRequest(request, env, ctx, corsHeaders);
      } else if (path === "/api/history") {
        return await handleHistoryRequest(request, env, ctx, corsHeaders);
      } else if (path === "/api/clear") {
        return await handleClearRequest(request, env, ctx, corsHeaders);
      }

      // Return 404 for unknown endpoints
      return new Response("Not found", { 
        status: 404,
        headers: corsHeaders
      });
    } catch (error) {
      // Return error response
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  }
};

// Handle CORS preflight requests
function handleCORS(request: Request) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    }
  });
}

// Handle chat requests
async function handleChatRequest(request: Request, env: any, ctx: ExecutionContext, corsHeaders: any) {
  // Only allow POST requests for chat
  if (request.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    // Parse request body
    const data = await request.json();
    const { message, userId } = data;

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // Create a unique ID for the user if not provided
    const chatUserId = userId || crypto.randomUUID();
    
    // Get Durable Object stub for this user's chat session
    // Use Cloudflare's name-based ID generation
    const id = env.CHAT_SESSION.idFromName(chatUserId);
    const chatSession = env.CHAT_SESSION.get(id);
    
    // Forward the request to the Durable Object (just to store the message)
    const response = await chatSession.fetch(new Request("https://chat-session.internal/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, userId: chatUserId })
    }));

    // Get the response from the Durable Object
    const responseData = await response.json();
    
    // Generate AI response using Workers AI (from main worker where env.AI is available)
    if (responseData.history && responseData.history.length > 0) {
      // Truncate conversation history to prevent context window overflow
      // Keep only the most recent messages (roughly estimate 100 tokens per message)
      const maxMessages = 15; // This should keep us well under 4096 tokens
      const recentHistory = responseData.history.slice(-maxMessages);
      
      const aiMessages = [
        { role: "system", content: "You are a helpful AI assistant running on Cloudflare Workers. You have access to previous conversation history and can remember what users tell you." },
        ...recentHistory
      ];

      try {
        console.log(`Calling AI from main worker with ${aiMessages.length} messages (truncated from ${responseData.history.length} total messages)`);
        console.log("AI messages:", JSON.stringify(aiMessages));
        
        const aiResult = await env.AI.run("@cf/meta/llama-2-7b-chat-int8", {
          messages: aiMessages
        });

        console.log("AI result from main worker:", JSON.stringify(aiResult));
        
        // Handle different response formats
        let aiResponse = "";
        if (typeof aiResult === 'object' && aiResult !== null) {
          if (aiResult.response) {
            aiResponse = aiResult.response;
          } else if (aiResult.text) {
            aiResponse = aiResult.text;
          } else if (aiResult.content) {
            aiResponse = aiResult.content;
          } else {
            console.log("Unexpected AI result format:", JSON.stringify(aiResult));
            aiResponse = JSON.stringify(aiResult);
          }
        } else {
          aiResponse = String(aiResult);
        }

        // Update the Durable Object with the AI response
        await chatSession.fetch(new Request("https://chat-session.internal/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            response: aiResponse,
            userId: chatUserId
          })
        }));

        // Update the response data
        responseData.response = aiResponse;
        responseData.history.push({ role: "assistant", content: aiResponse });

      } catch (aiError) {
        console.error("AI Error in main worker:", aiError);
        responseData.response = "I'm having trouble connecting to my AI brain right now. Please try again later.";
        responseData.error = aiError.message;
      }
    }
    
    // Also save to KV as backup
    if (responseData.history) {
      await env.CHAT_HISTORY.put(
        `chat:${chatUserId}`, 
        JSON.stringify(responseData.history)
      );
    }

    // Return the response with CORS headers
    return new Response(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

// Handle history requests
async function handleHistoryRequest(request: Request, env: any, ctx: ExecutionContext, corsHeaders: any) {
  // Only allow GET requests for history
  if (request.method !== "GET") {
    return new Response("Method not allowed", { 
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    // Get user ID from query parameter
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // Get Durable Object stub for this user's chat session
    const id = env.CHAT_SESSION.idFromName(userId);
    const chatSession = env.CHAT_SESSION.get(id);
    
    // Forward the request to the Durable Object
    const response = await chatSession.fetch(new Request("https://chat-session.internal/history", {
      method: "GET"
    }));

    // Return the response with CORS headers
    const responseData = await response.json();
    return new Response(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}

// Handle clear history requests
async function handleClearRequest(request: Request, env: any, ctx: ExecutionContext, corsHeaders: any) {
  // Only allow POST requests for clearing history
  if (request.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    // Parse request body
    const data = await request.json();
    const { userId } = data;

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // Get Durable Object stub for this user's chat session
    const id = env.CHAT_SESSION.idFromName(userId);
    const chatSession = env.CHAT_SESSION.get(id);
    
    // Forward the request to the Durable Object
    const response = await chatSession.fetch(new Request("https://chat-session.internal/clear", {
      method: "POST"
    }));

    // Also clear from KV
    await env.CHAT_HISTORY.delete(`chat:${userId}`);

    // Return the response with CORS headers
    const responseData = await response.json();
    return new Response(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
}
