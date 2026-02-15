#!/bin/bash
set -e

SERVER="root@134.199.199.15"
REMOTE_DIR="/opt/nodes-staging"

echo "🔨 Building web client..."
cd apps/desktop
VITE_GUN_RELAY_URL=wss://nodesrelay.leveq.dev/gun \
VITE_LIVEKIT_URL=wss://nodesvoice.leveq.dev \
VITE_LIVEKIT_API_KEY=nodes-stg-key \
pnpm build

echo "📦 Uploading to staging server..."
cd ../..
scp -r /c/Users/kclev/dev/nodes/apps/desktop/dist/ $SERVER:$REMOTE_DIR/web/

echo "✅ Deployed to https://nodesstg.leveq.dev"