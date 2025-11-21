#!/bin/bash

# Auto-JMP Settings Tool Runner
# This script runs the settings tool with proper environment setup

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SETTING_DIR="$SCRIPT_DIR"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🧰 Starting Auto-JMP Settings Tool..."
echo "📁 Project root: $PROJECT_ROOT"
echo "📁 Settings dir: $SETTING_DIR"
echo

# Check if virtual environment exists
if [ ! -d "$SETTING_DIR/venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Please run ./setup.sh first to set up the environment."
    exit 1
fi

# Activate virtual environment
source "$SETTING_DIR/venv/bin/activate"

# Check if dependencies are installed
if ! python -c "import flask, flask_cors, psycopg2, redis, requests" 2>/dev/null; then
    echo "❌ Dependencies not installed!"
    echo "Please run ./setup.sh to install dependencies."
    exit 1
fi

echo "✅ Environment ready"
echo "🚀 Starting settings tool on port 4900..."
echo "🌐 Browser will open automatically"
echo
echo "Press Ctrl+C to stop the server"
echo

# Change to project root and run the settings tool
cd "$PROJECT_ROOT"
python -m setting "$@"
