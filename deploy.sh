#!/bin/bash

# --- CONFIGURATION ---
RPI_IP="192.168.100.73"       # <--- CHECK THIS IP ADDRESS!
RPI_USER="pi"
GITHUB_USER="bikemaster2331"
REPO_NAME="pathfinder"
# ---------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Pathfinder Ultimate Deploy${NC}"
echo "================================"

# 1. GIT SYNC (Source Code)
echo -e "${YELLOW}1. Syncing Source Code...${NC}"
git add .
if ! git diff-index --quiet HEAD --; then
    git commit -m "Auto-deploy: $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${GREEN}   Changes committed${NC}"
fi
git push origin main
echo -e "${GREEN}   Git Push Complete${NC}"

# 2. FRONTEND TRANSFER (The Cake)
echo -e "${YELLOW}2. Teleporting Frontend (dist)...${NC}"
# We assume the user has already run 'npm run build' locally
ssh ${RPI_USER}@${RPI_IP} "mkdir -p ~/pathfinder/src/react-app"
scp -r ~/Documents/Marthan/pathfinder/src/react-app/dist ${RPI_USER}@${RPI_IP}:~/pathfinder/src/react-app/
echo -e "${GREEN}   Frontend files transferred${NC}"

# 3. REMOTE EXECUTION (The Pi takes over)
echo -e "${YELLOW}3. Configuring Raspberry Pi...${NC}"

ssh ${RPI_USER}@${RPI_IP} << ENDSSH
    # Stop on error
    set -e
    
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    NC='\033[0m'

    # Pull latest code
    if [ ! -d ~/pathfinder ]; then
        git clone https://github.com/${GITHUB_USER}/${REPO_NAME}.git pathfinder
    else
        cd ~/pathfinder
        git pull origin main
    fi

    # Setup Python (The Backend)
    cd ~/pathfinder
    if [ ! -d pathenv ]; then
        echo -e "\${YELLOW}   Creating Python Environment...\${NC}"
        python3 -m venv pathenv
    fi
    
    source pathenv/bin/activate
    echo -e "\${YELLOW}   Updating Dependencies...\${NC}"
    pip install -r requirements.txt --quiet --upgrade
    pip install fastapi uvicorn --quiet

    # Restart the Backend (PM2)
    echo -e "\${YELLOW}   Restarting AI Brain (PM2)...\${NC}"
    
    # Check if process exists, restart it. If not, start it.
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
echo -e "Access your Pi at: http://${RPI_IP}"