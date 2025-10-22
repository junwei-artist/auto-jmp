#!/bin/bash

# Auto-JMP Settings Tool Setup Script
# This script sets up the virtual environment and installs dependencies

set -e

echo "🧰 Auto-JMP Settings Tool Setup"
echo "================================="
echo

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 Working directory: $SCRIPT_DIR"
echo

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed or not in PATH"
    echo "Please install Python 3 and try again"
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"
echo

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "🔧 Creating virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
fi
echo

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "🔧 Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "🔧 Installing dependencies..."
pip install -r requirements.txt

echo
echo "✅ Setup completed successfully!"
echo
echo "🚀 To run the settings tool:"
echo "   python -m setting"
echo
echo "   Or activate the virtual environment and run:"
echo "   source venv/bin/activate"
echo "   python config_wizard.py"
echo
echo "📖 The settings tool will be available at:"
echo "   http://localhost:4900"
echo
