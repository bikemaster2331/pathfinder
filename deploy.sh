#!/bin/bash

RPI_IP="192.168.1.14"
RPI_USER="pi"
GITHUB_USER="bikemaster2331"
REPO_NAME="pathfinder"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Pathfinder Auto-Deploy${NC}"
echo "================================"
echo ""

echo -e "${YELLOW}Committing local changes...${NC}"
git add .
if git diff-index --quiet HEAD --; then
    echo -e "${GREEN}  No changes to commit${NC}"
else
    read -p "Commit message (or Enter for auto): " commit_msg
    if [ -z "$commit_msg" ]; then
        commit_msg="Auto-deploy: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
    git commit -m "$commit_msg"
    echo -e "${GREEN}  Changes committed${NC}"
fi

echo ""
echo -e "${YELLOW}Pushing to GitHub...${NC}"
if git push origin main; then
    echo -e "${GREEN}  Pushed successfully${NC}"
else
    echo -e "${RED}  Push failed${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}Deploying to RPi (${RPI_IP})...${NC}"

ssh ${RPI_USER}@${RPI_IP} << ENDSSH

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "\${BLUE}RPi Deployment Starting...\${NC}"
echo ""

if [ ! -d ~/pathfinder ]; then
    echo -e "\${YELLOW}  First-time setup detected\${NC}"
    cd ~
    git clone https://github.com/${GITHUB_USER}/${REPO_NAME}.git pathfinder
    cd pathfinder
    echo -e "\${GREEN}  Repository cloned\${NC}"
else
    echo -e "\${YELLOW}  Updating existing installation\${NC}"
    cd ~/pathfinder
    git pull origin main
    echo -e "\${GREEN}  Code updated\${NC}"
fi

if [ ! -d venv ]; then
    echo ""
    echo -e "\${YELLOW}  Creating Python virtual environment...\${NC}"
    python3 -m venv venv
    echo -e "\${GREEN}  Virtual environment created\${NC}"
fi

source venv/bin/activate

echo ""
echo -e "\${YELLOW}  Installing Python packages...\${NC}"
pip install -r requirements.txt --quiet --upgrade
echo -e "\${GREEN}  Dependencies installed\${NC}"

if [ ! -d models/paraphrase-multilingual-MiniLM-L12-v2 ]; then
    echo ""
    echo -e "\${YELLOW}  Downloading ML model...\${NC}"
    python3 << 'PYEOF'
from sentence_transformers import SentenceTransformer
import os
os.makedirs('models', exist_ok=True)
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
model.save('models/paraphrase-multilingual-MiniLM-L12-v2')
print("Model downloaded")
PYEOF
    echo -e "\${GREEN}  Model ready\${NC}"
else
    echo -e "\${GREEN}  ML model already exists\${NC}"
fi

if [ ! -f .env ]; then
    echo ""
    echo -e "\${YELLOW}  Creating .env file...\${NC}"
    echo "GEMINI_API_KEY=your_gemini_api_key_here" > .env
    echo -e "\${YELLOW}  Edit ~/pathfinder/.env and set your key.\${NC}"
else
    echo -e "\${GREEN}  .env file exists\${NC}"
fi

if systemctl is-active --quiet pathfinder; then
    echo ""
    echo -e "\${YELLOW}  Restarting service...\${NC}"
    sudo systemctl restart pathfinder
    echo -e "\${GREEN}  Service restarted\${NC}"
else
    echo ""
    echo -e "\${YELLOW}  Run manually:\${NC}"
    echo "     cd ~/pathfinder && source venv/bin/activate"
    echo "     uvicorn src.backend.app:app --host 0.0.0.0 --port 8000"
fi

echo ""
echo -e "\${BLUE}System Status:\${NC}"
echo -e "   Memory: \$(free -h | grep Mem | awk '{print \$3 \" / \" \$2}')"
echo -e "   Disk:   \$(df -h ~ | tail -1 | awk '{print \$3 \" / \" \$2}')"

echo ""
echo -e "\${GREEN}Deployment complete\${NC}"

ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}Deployment successful${NC}"
    echo -e "${BLUE}Access: http://${RPI_IP}:8000/${NC}"
else
    echo -e "${RED}Deployment failed${NC}"
    exit 1
fi
