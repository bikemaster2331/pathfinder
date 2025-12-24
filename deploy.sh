#!/bin/bash

# --- CONFIGURATION ---
RPI_IP="192.168.100.73"
RPI_USER="pi"
GITHUB_USER="bikemaster2331"
REPO_NAME="pathfinder"
# ---------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Pathfinder Backend-Only Deploy${NC}"
echo "========================================"

# 1. GIT SYNC (Source Code Only)
echo -e "${YELLOW}1. Syncing Source Code...${NC}"
git add .
# We don't care about the commit message, just push the state
if ! git diff-index --quiet HEAD --; then
    git commit -m "Auto-deploy: $(date '+%Y-%m-%d %H:%M:%S')"
fi
git push -f origin main
echo -e "${GREEN}   Git Push Complete${NC}"

# 2. REMOTE EXECUTION (Update the Pi Brain)
echo -e "${YELLOW}2. Configuring Raspberry Pi Brain...${NC}"

ssh ${RPI_USER}@${RPI_IP} << ENDSSH
    set -e
    
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'

    # CLEANUP: If the folder exists but is broken, delete it
    if [ -d ~/pathfinder ] && [ ! -d ~/pathfinder/.git ]; then
        echo -e "\${YELLOW}   Found broken folder. Re-cloning...\${NC}"
        rm -rf ~/pathfinder
    fi

    # PULL: Get the latest code
    if [ ! -d ~/pathfinder ]; then
        git clone https://github.com/${GITHUB_USER}/${REPO_NAME}.git pathfinder
    else
        cd ~/pathfinder
        # Force the Pi to match GitHub exactly
        git fetch origin
        git reset --hard origin/main
    fi

    # SETUP: Python Environment
    cd ~/pathfinder
    if [ ! -d pathenv ]; then
        echo -e "\${YELLOW}   Creating Python Environment...\${NC}"
        python3 -m venv pathenv
    fi
    
    source pathenv/bin/activate
    echo -e "\${YELLOW}   Updating Dependencies...\${NC}"
    # Upgrade pip first to avoid warnings
    pip install --upgrade pip --quiet
    pip install -r requirements.txt --quiet --upgrade
    pip install fastapi uvicorn --quiet

    # RESTART: PM2 Brain
    echo -e "\${YELLOW}   Restarting AI Brain (PM2)...\${NC}"
    
    if pm2 list | grep -q "pathfinder-backend"; then
        pm2 restart pathfinder-backend
    else
        pm2 start "/home/pi/pathfinder/pathenv/bin/python" \\
        --name pathfinder-backend \\
        --cwd "/home/pi/pathfinder/src/backend" \\
        -- -m uvicorn app:app --host 0.0.0.0 --port 8000
        pm2 save
    fi

    echo -e "\${GREEN}   Backend is Online!\${NC}"
ENDSSH

echo ""
echo -e "${GREEN}Deployment Successful!${NC}"
echo -e "Backend is running at: http://${RPI_IP}:8000"
