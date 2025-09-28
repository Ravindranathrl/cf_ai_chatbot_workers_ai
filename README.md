# Author Note

I used AI tools to accelerate this build because I had no prior experience with this stack:
- ChatGPT and Anthropic Claude for bootstrapping, debugging, and iterating on code and architecture.
- Perplexity (AI search) to gather and navigate Cloudflare documentation for Workers, Workers AI (models), Realtime (WebSockets/streaming), and KV storage, and to learn how to integrate them.
- Cursor (AI‑assisted IDE) to iterate quickly in‑editor; it felt like pair‑programming and boosted productivity. The MVP was built in ~45 minutes with Cursor’s help; the expanded deliverable took ~1 hour 30 minutes in total. AI did make occasional mistakes, so documentation reading and human judgment were essential.

Time spent: about 1 hour 30 minutes for this deliverable. I’m eager to take it further. If given an opportunity to intern at Cloudflare (Winter/Spring 2026), I’ll continue polishing features and expand the product.

Portfolio & contact:
- Website: https://ravindranathrl.netlify.app/
- LinkedIn: https://www.linkedin.com/in/ravindranath-rl/

---

# Cloudflare AI Chatbot (Workers AI + Durable Objects + Pages + KV + Realtime)

Live demo: https://main.ai-chatbot-project.pages.dev

Backend (worker): https://ai-chatbot-worker.ravindranath-ramanujamloganathan.workers.dev

Important: Per assignment rules, the repository name should be prefixed with `cf_ai_`. If this repo is not yet renamed, please rename it before submitting (e.g., `cf_ai_chatbot_workers_ai`).

## Overview
A production‑ready AI chat application built entirely on Cloudflare:
- Workers AI for inference (default: `@cf/meta/llama-2-7b-chat-int8`) and also used Llama 3 
- Durable Objects for per‑user/session conversational memory
- Workers KV for chat history backup
- WebSocket (Realtime) for low‑latency streaming tokens with live typing
- Cloudflare Pages for a fast, modern frontend (permanent dark theme)

The app supports multi‑session chat, persistent memory, graceful fallback from WebSocket to REST, and robust parsing of Workers AI streaming output.

## Assignment Compliance (Checklist)
- LLM: Uses Workers AI (default Llama 2 7B) with multi‑model options including Llama 3 variants.
- Workflow/coordination: Durable Objects coordinate stateful sessions; KV provides backup.
- User input: Chat UI on Cloudflare Pages; Realtime via WebSockets (streaming) + REST fallback.
- Memory/state: Durable Objects persist conversation history; capped and backed up in KV.
- README with clear instructions: Included (local/dev/deploy, architecture, model switching, deploy under own account).
- PROMPTS.md: Included with representative prompts (AI‑assisted coding disclosed in Author Note).
- Repo naming: Please rename to start with `cf_ai_` before submission (e.g., `cf_ai_chatbot_workers_ai`).

## Extra / Optional Enhancements
- Multi‑model selector in the UI; worker honors selected model.
- Realtime streaming with robust SSE parsing; skips metadata and `[DONE]`.
- Automatic history truncation to respect model context limits; DO storage capped.
- REST fallback path if WS is unavailable; consistent response handling.
- “Clear All Sessions” safety reset; multi‑session sidebar with create/switch/delete.
- Permanent dark theme with refined, less‑cluttered layout.
- Optional `deploy.sh` to guide first‑time deploy (Wrangler login, KV create, worker/pages deploy).
- Clean repo: unnecessary reference and doc files removed for a minimal public footprint.

## Tech Stack
- Cloudflare Workers (TypeScript) — API, orchestration, CORS
- Cloudflare Durable Objects — per‑user/session memory
- Cloudflare Workers KV — chat history backup
- Cloudflare Workers AI — LLM inference (Llama 2 by default; Mistral/Llama 3 optional)
- Cloudflare Pages — static hosting for frontend
- Realtime WebSocket + SSE parsing — token streaming to UI
- Frontend: Vanilla JS, HTML, CSS (dark themed); localStorage for sessions

## Architecture

```
+---------------------------+            +------------------------------------+
|        Cloudflare Pages   |  WebSocket |     Cloudflare Worker (API/WS)     |
|  (index.html / app.js)    +----------->+  /api/ws  (Realtime streaming)     |
|  Model selector, sessions |            |  /api/chat (REST fallback)         |
+-------------+-------------+            +----------------+--------------------+
              ^                                           | 
              |  REST (JSON)                              | invokes
              |                                           v
              |                              +----------------------------+
              |                              |      Workers AI (LLM)      |
              |                              |  @cf/meta/llama-2-7b-chat  |
              |                              +-------------+--------------+
              |                                            |
              |     persists & retrieves history          |
              |                                            v
              |                              +----------------------------+
              |                              |   Durable Object (state)   |
              +------------------------------+  Per-user conversation log  |
                                             +-------------+--------------+
                                                           |
                                                backup ->  v
                                             +----------------------------+
                                             |        Workers KV          |
                                             |   chat history snapshot    |
                                             +----------------------------+
```

- `pages/` (Cloudflare Pages)
  - Static frontend (HTML/CSS/JS)
  - Connects via WebSocket to `wss://<worker>/api/ws`
  - Falls back to REST `POST /api/chat` when realtime is unavailable
- `my-ai-chatbot/` (Cloudflare Worker)
  - Routes: `/api/chat`, `/api/history`, `/api/clear`, `/api/ws`
  - Durable Object `ChatSession` stores conversation messages per user
  - KV namespace stores a backup copy of chat history
  - Workers AI invocations are made from the Worker (HTTP) and from websocket handler (streaming)

Data flow (Realtime):
1) Frontend connects to `/api/ws` and sends `connect` and `chat` messages
2) Worker DO appends the user message; Worker streams tokens from Workers AI
3) Worker sends text chunks to client as `{ type: "chunk", content }`
4) On completion, Worker updates DO with the final assistant text and sends `{ type: "complete" }`

Data flow (REST):
1) Frontend posts `{ message, userId }` to `/api/chat`
2) Worker DO saves the user message and returns history
3) Worker invokes Workers AI with a truncated window of history and returns `{ response, history }`

## Features
- Realtime streaming over WebSocket with clean text extraction (SSE line parsing)
- Durable, per‑user memory using Durable Objects (and KV backup)
- Multi‑session sidebar with create, switch, delete; safe behavior when last session is removed
- Robust parsing of AI outputs (handles SSE, metadata chunks, and binary‑like streaming payloads)
- Context window management (truncates history to avoid token‑limit errors)
- Permanent dark theme with refined, uncluttered UI
- Multi‑model selector (header dropdown) to switch between available models at runtime

## Repository Structure
```
Cloudflare/
├─ my-ai-chatbot/              # Worker (TypeScript)
│  ├─ src/index.ts             # HTTP routes, Durable Object, orchestration
│  ├─ src/realtime.ts          # WebSocket server & streaming parser (SSE → text)
│  ├─ wrangler.jsonc           # Bindings: AI, KV, Durable Objects
│  └─ ...
├─ pages/                      # Frontend (Pages)
│  └─ public/
│     ├─ index.html            # UI markup
│     ├─ style.css             # Theme & layout
│     ├─ app.js                # App logic (sessions, REST fallback, UI)
│     └─ realtime.js           # WebSocket client wrapper
├─ README.md                   # This documentation
└─ PROMPTS.md                  # Representative AI prompts used
```

## Bindings & Configuration
`my-ai-chatbot/wrangler.jsonc` (excerpt):
```jsonc
{
  "name": "ai-chatbot-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": { "bindings": [{
    "name": "CHAT_SESSION",
    "class_name": "ChatSession"
  }]},
  "kv_namespaces": [
    { "binding": "CHAT_HISTORY", "id": "<YOUR_KV_NAMESPACE_ID>" },
    { "binding": "FILE_STORAGE", "id": "<OPTIONAL_SAME_OR_OTHER_KV_ID>" }
  ],
  "ai": { "binding": "AI" },
  "migrations": [{
    "tag": "v1",
    "new_sqlite_classes": ["ChatSession"]
  }]
}
```
Notes:
- `FILE_STORAGE` is retained but not required after removing the file upload UI.
- Ensure `CHAT_HISTORY` KV namespace exists in your Cloudflare account and replace IDs above.

## Endpoints
- `POST /api/chat` → `{ response, history }`
- `GET /api/history?userId=...` → `{ messages }`
- `POST /api/clear` → `{ success: true }`
- `GET /api/ws` (Upgrade: websocket) → realtime chat protocol:
  - Send `{ type: "connect", userId? }` once connected
  - Send `{ type: "chat", userId, content, messageId? }`
  - Receive `{ type: "chunk", content }`, `{ type: "complete" }`, `{ type: "status" }`

## Local Development
Prereqs: Node 18+, Wrangler CLI (`npm i -g wrangler`), Cloudflare account.

1) Install deps (frontend only uses static assets):
```
cd pages
npm install
```

2) Run Worker locally (with bindings):
```
cd ../my-ai-chatbot
wrangler dev
```
The dev server will expose your Worker on localhost. Ensure AI binding is enabled on your account (Workers AI beta/GA).

3) Run Pages locally (static preview):
```
cd ../pages
# You can use any static server; with Wrangler:
wrangler pages dev public
```
Point the frontend `API_URL` (in `pages/public/app.js`) to your local Worker URL while testing, or keep using the deployed Worker.

## Deployment
- Deploy Worker:
```
cd my-ai-chatbot
wrangler deploy
```
- Deploy Pages:
```
cd ../pages
npm run deploy   # wraps: wrangler pages deploy public
```
- Optional one‑shot helper: `./deploy.sh` guides first‑time deploy (Wrangler login, KV creation, worker and pages deploy). You can also run it via `bash deploy.sh` without chmod.

## Model Configuration
Default model: `@cf/meta/llama-2-7b-chat-int8`.
- Realtime (WS) and REST share the same truncation logic to respect the 4k context window.
- You can switch the model in:
  - `my-ai-chatbot/src/index.ts` (REST)
  - `my-ai-chatbot/src/realtime.ts` (WebSocket)
- Users can also change models at runtime via the header dropdown in the frontend (e.g., Llama 2, Mistral, Llama 3). The selected model value is sent with requests and honored by the worker when present.

## Deploying This Repo Under Your Own Account (for cloners)
When someone clones this repository, any deploy will target the Cloudflare account associated with the Wrangler login on their machine (not the original author’s account).

1) Authenticate
```
wrangler login
wrangler whoami   # verify account
```

2) Create KV namespaces (once per account)
```
wrangler kv create CHAT_HISTORY
# Optional if you plan to use the same KV: FILE_STORAGE
wrangler kv create FILE_STORAGE
```
Copy the created IDs into `my-ai-chatbot/wrangler.jsonc` under `kv_namespaces`.

3) Ensure Workers AI is enabled on the account (Dashboard → Workers AI → Enable).

4) Deploy Worker
```
cd my-ai-chatbot
wrangler deploy
```
This will also apply the Durable Object migration (`ChatSession`) on first deploy.

5) Deploy Pages frontend
```
cd ../pages
wrangler pages deploy public
# Optionally set a project name: --project-name=<your-project>
```
A new Pages project will be created in the logged-in account. The frontend will talk to your newly deployed worker via the `API_URL` configured in `pages/public/app.js`.

Security notes
- No API keys or tokens are committed in this repo. Do not commit `.dev.vars`/`.env` files if you add them.
- Workers AI auth is provided via the bound `AI` service in your account. No secrets required in code.

## Notable Implementation Details
- Durable Object receives minimal responsibilities: append messages, return history, store final AI response; AI invocation for REST lives in main Worker.
- Streaming parser converts Workers AI SSE to plain text by:
  - decoding `Uint8Array`/object byte payloads
  - splitting into `data:` lines
  - ignoring metadata (`usage`, `[DONE]`)
  - concatenating `response` (or `text`) fields only
- Robust frontend fallback: if WS errors, REST is used seamlessly.
- Context management: only the latest N messages (default 15) are passed to the model; DO storage itself is capped (default 50) to prevent unbounded growth.

## Try It
- Open the live demo, type a message, switch models from the dropdown, create/delete sessions
- Click “Clear Chat History” (current session) or “Clear All Sessions” for a fresh state

## Assignment Checklist
- LLM: Workers AI (Llama 2; can switch to others)
- Workflow/coordination: Durable Objects + KV
- User input: Pages frontend + WebSocket Realtime
- Memory/state: Durable Objects + KV backup
- README with instructions: this file
- Prompts: see `PROMPTS.md`
- Repo prefix: rename to start with `cf_ai_` before submission

---

## License
MIT (code in this repository is original and authored for this project).