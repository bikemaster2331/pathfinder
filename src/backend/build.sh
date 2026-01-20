#!/usr/bin/env bash
set -o errexit

echo "Installing CPU Torch with high timeout..."
pip install torch==2.1.2+cpu --index-url https://download.pytorch.org/whl/cpu --default-timeout=1000

echo "Installing remaining requirements..."
# Since build.sh and requirements.txt are now in the same folder:
pip install -r requirements.txt