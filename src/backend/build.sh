#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "1. Installing CPU Torch (High Timeout Mode)..."
pip install torch==2.6.0+cpu --index-url https://download.pytorch.org/whl/cpu --default-timeout=1000

echo "2. Installing remaining packages..."
pip install -r requirements.txt

echo "3. Pre-downloading Spacy Model..."
# THIS IS THE FIX. We download it now so the app doesn't freeze later.
python -m spacy download xx_sent_ud_sm