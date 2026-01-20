#!/usr/bin/env bash
set -o errexit

echo "1. Installing CPU Torch..."
pip install torch==2.6.0+cpu --index-url https://download.pytorch.org/whl/cpu --default-timeout=1000

echo "2. Installing requirements..."
pip install -r requirements.txt