#!/usr/bin/env bash
# Exit on error
set -o errexit

echo "1. Installing CPU Torch (High Timeout Mode)..."
pip install torch==2.6.0+cpu --index-url https://download.pytorch.org/whl/cpu --default-timeout=1000

echo "2. Installing remaining packages..."
pip install -r requirements.txt