# PROMPTS

These are the effective prompts I used to plan, build, debug, and polish this MVP end‑to‑end on Cloudflare. They are organized in the order you could use them to create the project from scratch. Credentials and private info are intentionally omitted.

---

## 1) Discovery and Requirements

```text
Act as a senior Cloudflare full‑stack engineer. I want to build an AI chatbot on Cloudflare using Workers AI, Durable Objects, KV, Pages, and Realtime (WebSockets). Help me define a concise but complete Product Requirements Document (PRD) for an MVP:
- User goals, constraints, and success criteria
- Functional requirements (chat, multi‑session, realtime streaming, memory/state)
- Non‑functional (latency targets, reliability, security)
- Technical stack and high‑level architecture
- Milestones: v0 (hello world), v1 (MVP), v1.1 (polish)
Return a short, highly actionable PRD I can immediately implement.
```

## 2) Architecture and Data Flow

```text
Design an architecture for the MVP using:
- Workers (TypeScript) for HTTP routes and a WS endpoint
- Durable Objects for per‑user/session memory
- KV for history backup
- Workers AI for LLM inference (default to @cf/meta/llama-2-7b-chat-int8; support runtime model override)
- Pages for the frontend (vanilla HTML/CSS/JS)
Provide: request/response schemas, routes, DO class responsibilities, WebSocket message protocol, and a sequence diagram from user input to streamed output.
```

## 3) Wrangler Configuration

```text
Show a minimal but production‑ready wrangler.jsonc for:
- Durable Objects binding (class ChatSession)
- KV namespace for CHAT_HISTORY (and optional FILE_STORAGE)
- AI binding
- Compatibility flags for nodejs_compat
Include a first migration tag for the DO. Explain how to create KV namespaces and deploy.
```

## 4) Durable Object (State & Memory)

```text
Write a Durable Object class ChatSession that:
- Stores an array of messages: { role: 'user' | 'assistant', content: string, ts: number }
- Appends messages, returns recent N for context (configurable)
- Caps stored messages (e.g., 50)
- Exposes a fetch() handler with sub‑routes for add/get/clear
Ensure TypeScript types are explicit and code is clean and readable.
```

## 5) Worker HTTP Endpoints

```text
Implement Worker routes:
- POST /api/chat: body { userId, content, model? } →
  1) append user msg in DO,
  2) fetch truncated history for AI,
  3) call env.AI.run(model, { messages }),
  4) parse response variants ({response}|{text}|{content}),
  5) persist assistant msg in DO and return { response, history }
- GET /api/history?userId=...
- POST /api/clear
Add robust error handling and CORS. Log key steps for debugging.
```

## 6) Realtime WebSocket Endpoint

```text
Add /api/ws that upgrades to a WebSocket:
- Protocol: { type: 'connect'| 'chat'| 'history'| 'clear', ... }
- On 'chat': append user msg in DO, build AI messages[], call env.AI.run stream, and send {type:'chunk', content} for text tokens, finishing with {type:'complete'}
- Ignore usage/[DONE] metadata in stream
- Persist assistant final text in DO
Include context truncation (e.g., last 15 messages) to stay under model limits.
```

## 7) Streaming Parser (Workers AI → Plain Text)

```text
Workers AI streams can look like SSE lines (`data: { ... }`) and occasionally binary‑like objects. Write a parser that:
- Handles Uint8Array/object payloads
- Splits on newlines, extracts only `response` or `text` fields
- Skips `usage` and empty markers and the final [DONE]
- Produces clean text chunks for the client
Provide both server (WS) and client (browser) parsing helpers.
```

## 8) Frontend (Pages) – UI and Client Logic

```text
Create a minimal, modern, dark UI with:
- Header: model dropdown (runtime switch), subtle branding
- Sidebar: sessions list with create/switch/delete; a 'Clear All Sessions' button
- Main: chat transcript and input box; send button
Client logic:
- Connect to WS on load; fallback to REST if WS fails
- Maintain sessions in localStorage
- Append streamed tokens (only text) to the active assistant bubble
- Handle errors gracefully with user‑friendly toasts/messages
Use vanilla HTML/CSS/JS (no frameworks). Keep JS modular and readable.
```

## 9) Model Selection (Multi‑Model)

```text
Add a model <select> in the header with options (e.g., Llama 2, Llama 3, Mistral). When sending chat:
- Include selected model in the payload; backend should honor it if supported, otherwise default
- Document available model IDs and how to add more
```

## 10) Context Window Management

```text
Implement shared logic to cap history passed to the model (e.g., last 15 messages). Explain trade‑offs, how to tweak, and how to handle token overflows with a meaningful error shown to the user.
```

## 11) Robust Error Handling & Logging

```text
Add structured logs around AI calls, WS lifecycle, and DO operations. Provide user‑facing error messages:
- Connection/timeout
- Token limit exceeded
- Capacity temporarily exceeded (advise switching model)
Ensure backend never returns raw binary to clients; sanitize and stringify safely.
```

## 12) CORS and Security

```text
Configure CORS to allow the Pages domain to call the Worker, including WS. Avoid exposing secrets. Confirm that Workers AI auth is via binding and no tokens are hardcoded. Add guidance on not committing .env/.dev.vars.
```

## 13) Deployment

```text
Provide exact commands to:
- wrangler deploy (Worker)
- wrangler pages deploy public (Pages)
- Create and bind KV namespaces
- Apply DO migrations
Include tips for verifying WS in Wrangler tail logs and opening the Pages URL.
```

## 14) Troubleshooting Streaming Artifacts

```text
If UI shows raw `data: {"response":...}` lines, fix both sides:
- Server: filter metadata and only forward response/text tokens
- Client: parse SSE lines, regex‑guard against partial JSON, and append only clean text
Add examples and small tests to validate the parser.
```

## 15) UI Polish and Performance

```text
Suggest improvements to reduce visual clutter: narrower container, softer shadows, smaller controls, consistent spacing, and permanent dark theme. Optimize for first meaningful paint and reduce layout thrash during streaming.
```

## 16) Documentation (README and PROMPTS)

```text
Draft a README with: overview, compliance checklist, feature list, architecture diagram, setup/dev/deploy steps, model configuration, troubleshooting, and notes for cloners. Add an Application Preview (screenshots). Create PROMPTS.md summarizing the effective prompts used to build the MVP.
```

---

These prompts reflect the approach I used to efficiently create this MVP on Cloudflare while ensuring clarity, maintainability, and deployability.
