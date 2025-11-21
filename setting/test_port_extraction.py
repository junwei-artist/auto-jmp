#!/usr/bin/env python3
"""
Test script to verify port extraction from command strings.
This tests the _extract_port_from_command method with various command formats.
"""

import sys
import os
from pathlib import Path

# Add the setting directory to Python path
setting_dir = Path(__file__).parent
sys.path.insert(0, str(setting_dir))

from utils import SettingsManager

def test_port_extraction():
    """Test port extraction from various command formats."""
    print("🔍 Testing Port Extraction from Commands")
    print("=" * 50)
    
    settings = SettingsManager()
    
    # Test cases with expected results
    test_cases = [
        # (command, expected_port, description)
        ("python main.py", None, "No port specified"),
        ("uvicorn main:app --port 4700", "4700", "Standard --port flag"),
        ("uvicorn main:app -p 4700", "4700", "Short -p flag"),
        ("uvicorn main:app --host 0.0.0.0 --port 4700", "4700", "Host and port flags"),
        ("uvicorn main:app --host 0.0.0.0 --port 1 --reload", "1", "Port 1 (your case)"),
        ("uvicorn main:app --host 0.0.0.0 --port 4700 --reload", "4700", "Host, port, and reload"),
        ("uvicorn main:app --host 0.0.0.0 --port 9999 --workers 4", "9999", "Multiple flags"),
        ("next dev -p 4800", "4800", "Next.js with port"),
        ("npm run dev -- --port 4800", None, "NPM with port (not directly supported)"),
        ("uvicorn main:app --host 0.0.0.0:4700", "4700", "Host with port"),
        ("uvicorn main:app --host localhost:4700", "4700", "Localhost with port"),
        ("uvicorn main:app --host 127.0.0.1:4700", "4700", "IP with port"),
        ("uvicorn main:app --port 0", None, "Invalid port 0"),
        ("uvicorn main:app --port 70000", None, "Invalid port > 65535"),
        ("uvicorn main:app --port abc", None, "Non-numeric port"),
    ]
    
    print("Testing various command formats:\n")
    
    for i, (command, expected, description) in enumerate(test_cases, 1):
        result = settings._extract_port_from_command(command)
        status = "✅" if result == expected else "❌"
        
        print(f"{i:2d}. {status} {description}")
        print(f"    Command: {command}")
        print(f"    Expected: {expected}")
        print(f"    Got: {result}")
        print()
    
    # Test your specific case
    print("🎯 Your Specific Case:")
    your_command = "/Library/Frameworks/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python -m uvicorn main:app --host 0.0.0.0 --port 1 --reload"
    result = settings._extract_port_from_command(your_command)
    print(f"Command: {your_command}")
    print(f"Extracted Port: {result}")
    
    if result == "1":
        print("✅ Correctly extracted port 1")
    else:
        print(f"❌ Expected port 1, got {result}")

def test_edge_cases():
    """Test edge cases and potential issues."""
    print("\n🧪 Testing Edge Cases")
    print("=" * 30)
    
    settings = SettingsManager()
    
    edge_cases = [
        ("uvicorn main:app --port 1", "1", "Minimal valid port"),
        ("uvicorn main:app --port 65535", "65535", "Maximum valid port"),
        ("uvicorn main:app --port 0", None, "Invalid port 0"),
        ("uvicorn main:app --port 65536", None, "Invalid port > 65535"),
        ("uvicorn main:app --port -1", None, "Negative port"),
        ("uvicorn main:app --port 1.5", None, "Decimal port"),
        ("uvicorn main:app --port", None, "Missing port value"),
        ("uvicorn main:app --port abc", None, "Non-numeric port"),
    ]
    
    for command, expected, description in edge_cases:
        result = settings._extract_port_from_command(command)
        status = "✅" if result == expected else "❌"
        print(f"{status} {description}: {result}")

if __name__ == "__main__":
    print("🚀 Port Extraction Test")
    print("=" * 60)
    
    test_port_extraction()
    test_edge_cases()
    
    print("\n" + "=" * 60)
    print("📝 Summary:")
    print("The port extraction should now correctly handle:")
    print("✅ --port 1 (your case)")
    print("✅ --port 4700 (standard)")
    print("✅ -p 4700 (short form)")
    print("✅ --host 0.0.0.0:4700 (host with port)")
    print("✅ Port validation (1-65535)")
    print("❌ Invalid ports (0, >65535, non-numeric)")
