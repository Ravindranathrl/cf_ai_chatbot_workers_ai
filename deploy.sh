#!/usr/bin/env bash
set -euo pipefail

echo "\n=== Cloudflare AI Chatbot – First‑time Deploy Helper ===\n"

if ! command -v wrangler >/dev/null 2>&1; then
  echo "[!] Wrangler CLI not found. Install with: npm i -g wrangler"
  exit 1
fi

echo "[1/6] Checking Cloudflare auth…"
if ! wrangler whoami >/dev/null 2>&1; then
  echo "You are not logged in. Opening login flow…"
  wrangler login || true
  echo "Rechecking auth…"
  wrangler whoami || { echo "Login failed or was cancelled."; exit 1; }
fi

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$ROOT_DIR/my-ai-chatbot"
PAGES_DIR="$ROOT_DIR/pages"

echo "\n[2/6] (Optional) Create KV namespaces in this account"
read -rp "Create CHAT_HISTORY KV now? [y/N]: " CREATE_CH
if [[ "${CREATE_CH:-}" =~ ^[Yy]$ ]]; then
  wrangler kv namespace create CHAT_HISTORY || true
  echo "→ Copy the generated KV id into my-ai-chatbot/wrangler.jsonc under CHAT_HISTORY"
fi

read -rp "Create FILE_STORAGE KV now (optional)? [y/N]: " CREATE_FS
if [[ "${CREATE_FS:-}" =~ ^[Yy]$ ]]; then
  wrangler kv namespace create FILE_STORAGE || true
  echo "→ Copy the generated KV id into my-ai-chatbot/wrangler.jsonc under FILE_STORAGE"
fi

echo "\n[3/6] Ensure Workers AI is enabled in this account (Dashboard → Workers AI)."
read -rp "Press Enter to continue once enabled…" _

echo "\n[4/6] Deploying Worker…"
cd "$WORKER_DIR"
wrangler deploy

echo "\n[5/6] Deploying Pages (frontend)…"
cd "$PAGES_DIR"
DEFAULT_PROJ="ai-chatbot-project"
read -rp "Specify Pages project name [${DEFAULT_PROJ}]: " PAGES_NAME
PAGES_NAME="${PAGES_NAME:-$DEFAULT_PROJ}"
wrangler pages deploy public --project-name "$PAGES_NAME"

echo "\n[6/6] Done. Next steps:"
cat <<'EOS'
- If the frontend cannot reach the worker, verify API_URL in pages/public/app.js points to your worker host.
- The Durable Object migration (ChatSession) is auto‑applied on first worker deploy.
- You can re‑run this script anytime. It won’t overwrite existing KV namespaces.

Tip: To run without making the script executable, use: bash deploy.sh
EOS

echo "\nAll set!"

#!/bin/bash

# Cloudflare AI Chatbot Deployment Script

echo "🚀 Deploying Cloudflare AI Chatbot with Memory"

# Make script executable
chmod +x deploy.sh

# Step 1: Create KV namespace if it doesn't exist
echo "📦 Creating KV namespace for chat history..."
KV_OUTPUT=$(wrangler kv:namespace create "CHAT_HISTORY" 2>&1)
KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*' | cut -d'"' -f2)

if [ -z "$KV_ID" ]; then
  echo "⚠️  KV namespace might already exist. Listing existing namespaces:"
  wrangler kv:namespace list
  echo "Please update wrangler.jsonc manually with your KV namespace ID"
else
  echo "✅ KV namespace created with ID: $KV_ID"
  
  # Update wrangler.jsonc with KV namespace ID
  sed -i '' "s/YOUR_KV_NAMESPACE_ID/$KV_ID/g" my-ai-chatbot/wrangler.jsonc
  echo "✅ Updated wrangler.jsonc with KV namespace ID"
fi

# Step 2: Deploy the Worker
echo "🔧 Deploying Worker..."
cd my-ai-chatbot
npm install
npm run deploy

# Get the deployed worker URL
WORKER_URL=$(wrangler whoami | grep -o 'https://[^ ]*my-ai-chatbot[^ ]*')
echo "✅ Worker deployed at: $WORKER_URL"

# Step 3: Update frontend API URL
cd ../pages
echo "🔄 Updating frontend API URL..."
sed -i '' "s|const API_URL = 'http://localhost:8787/api';|const API_URL = '$WORKER_URL/api';|g" public/app.js
echo "✅ Updated frontend API URL"

# Step 4: Deploy the Pages frontend
echo "🌐 Deploying Pages frontend..."
npm install
npm run deploy

echo "🎉 Deployment complete!"
echo "Your Cloudflare AI Chatbot is now live!"
