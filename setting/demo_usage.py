#!/usr/bin/env python3
"""
Demo script showing how to use the Auto-JMP Settings Tool.
This script demonstrates the correct usage patterns.
"""

import subprocess
import sys
from pathlib import Path

def demo_settings_tool():
    """Demonstrate the settings tool usage."""
    print("🧰 Auto-JMP Settings Tool - Usage Demo")
    print("=" * 50)
    print()
    
    # Get project root
    project_root = Path(__file__).parent.parent
    setting_dir = project_root / "setting"
    
    print("📁 Project structure:")
    print(f"   Project root: {project_root}")
    print(f"   Settings dir: {setting_dir}")
    print()
    
    print("🚀 Correct usage methods:")
    print()
    
    print("1️⃣  From project root (recommended):")
    print(f"   cd {project_root}")
    print("   python -m setting")
    print()
    
    print("2️⃣  Using the runner script:")
    print(f"   {setting_dir}/run-settings.command")
    print()
    
    print("3️⃣  From settings directory:")
    print(f"   cd {setting_dir}")
    print("   source venv/bin/activate")
    print("   python config_wizard.py")
    print()
    
    print("🔧 Available options:")
    print("   --port PORT        Use different port (default: 4900)")
    print("   --no-browser       Don't open browser automatically")
    print("   --debug            Enable debug mode")
    print("   --help             Show help message")
    print()
    
    print("✨ Features:")
    print("   ✅ Port checking and process management")
    print("   ✅ Automatic browser opening")
    print("   ✅ Interactive process killing")
    print("   ✅ Modern web interface")
    print("   ✅ Service management")
    print()
    
    print("🌐 Access: http://localhost:4900")
    print()

if __name__ == "__main__":
    demo_settings_tool()
