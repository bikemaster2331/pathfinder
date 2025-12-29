#!/bin/bash

# 1. Configuration
HOST="pi@192.168.100.73"
SOURCE_DIR="$HOME/Documents/Marthan/pathfinder/"
DEST_DIR="/home/pi/pathfinder/"

echo "🚀 Deploying Backend ONLY..."

# 2. Sync with Strict Excludes
# We use 'rsync' because it is smarter than 'scp'. 
# It checks timestamps and only sends changed files.
rsync -avz --delete \
--exclude 'react-app' \
--exclude 'frontend' \
--exclude 'node_modules' \
--exclude 'pathenv' \
--exclude '__pycache__' \
--exclude '*.pyc' \
--exclude '.git' \
--exclude '.env' \
--exclude '.DS_Store' \
--exclude 'models' \
"$SOURCE_DIR" "$HOST:$DEST_DIR"

echo "✅ Files synced (Garbage ignored)."

# 3. Remote Restart
ssh $HOST "cd ~/pathfinder && \
        source pathenv/bin/activate && \
        pip install -r requirements.txt && \
        pm2 restart pathfinder-backend"

echo "🎉 Brain Restarted."