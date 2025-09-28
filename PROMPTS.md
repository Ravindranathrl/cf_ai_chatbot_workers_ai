# PROMPTS

This document captures representative AI-assisted prompts that guided implementation. These are illustrative, not exhaustive, and redact credentials or private data.

## Worker/Backend
- “Fix Durable Object id error: switch from idFromString(hashed) to idFromName; show how to route /api/chat -> DO with env.”
- “Workers AI run() examples with messages array; handle models that return {response}, {text}, {content}; add error handling.”
- “Implement WebSocket endpoint in a Worker; accept pair, forward chat messages, and stream AI tokens to client.”
- “Parse Workers AI streaming output; sometimes comes as SSE data: lines or Uint8Array-like objects; build robust parser.”
- “Truncate conversational history to avoid 4096 token limit; keep latest N messages and cap DO storage.”

## Frontend
- “Pages app with session sidebar, dark theme, model dropdown; wire WebSocket with fallback to REST.”
- “Fix raw streaming showing in UI; only append extracted text; ignore metadata usage/[DONE].”
- “Add ‘Clear All Sessions’ with safe default state; persist sessions in localStorage.”
- “Refine UI: reduce shadows, smaller sidebar, remove glowing input, tighten spacing.”

## Deployment/Config
- “Wrangler config for DO + KV + AI bindings; add CORS; Pages deploy command.”

---
These prompts were used to assist coding; all implementation is original for this project.
