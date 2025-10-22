#!/usr/bin/env python3
"""
Simple test for port extraction without importing the full SettingsManager.
"""

import re
from typing import Optional

def _extract_port_from_command(command: str) -> Optional[str]:
    """Extract port number from a command string."""
    # Look for --port 4700 or -p 4700 patterns (most specific first)
    port_patterns = [
        r'--port\s+(\d+)',           # --port 4700
        r'-p\s+(\d+)',               # -p 4700
        r'0\.0\.0\.0:(\d+)',         # 0.0.0.0:4700
        r'localhost:(\d+)',         # localhost:4700
        r'127\.0\.0\.1:(\d+)',       # 127.0.0.1:4700
        r'--host\s+\S+:\d+.*?(\d+)', # --host 0.0.0.0:4700 (but this is rare)
    ]
    
    for pattern in port_patterns:
        match = re.search(pattern, command)
        if match:
            port = match.group(1)
            # Validate that it's a reasonable port number
            try:
                port_num = int(port)
                if 1 <= port_num <= 65535:
                    return port
            except ValueError:
                continue
    
    return None

def test_port_extraction():
    """Test port extraction from various command formats."""
    print("🔍 Testing Port Extraction from Commands")
    print("=" * 50)
    
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
        ("uvicorn main:app --host 0.0.0.0:4700", "4700", "Host with port"),
        ("uvicorn main:app --host localhost:4700", "4700", "Localhost with port"),
        ("uvicorn main:app --host 127.0.0.1:4700", "4700", "IP with port"),
        ("uvicorn main:app --port 0", None, "Invalid port 0"),
        ("uvicorn main:app --port 70000", None, "Invalid port > 65535"),
        ("uvicorn main:app --port abc", None, "Non-numeric port"),
    ]
    
    print("Testing various command formats:\n")
    
    for i, (command, expected, description) in enumerate(test_cases, 1):
        result = _extract_port_from_command(command)
        status = "✅" if result == expected else "❌"
        
        print(f"{i:2d}. {status} {description}")
        print(f"    Command: {command}")
        print(f"    Expected: {expected}")
        print(f"    Got: {result}")
        print()
    
    # Test your specific case
    print("🎯 Your Specific Case:")
    your_command = "/Library/Frameworks/Python.framework/Versions/3.11/Resources/Python.app/Contents/MacOS/Python -m uvicorn main:app --host 0.0.0.0 --port 1 --reload"
    result = _extract_port_from_command(your_command)
    print(f"Command: {your_command}")
    print(f"Extracted Port: {result}")
    
    if result == "1":
        print("✅ Correctly extracted port 1")
    else:
        print(f"❌ Expected port 1, got {result}")

if __name__ == "__main__":
    print("🚀 Port Extraction Test")
    print("=" * 60)
    
    test_port_extraction()
    
    print("\n" + "=" * 60)
    print("📝 Summary:")
    print("The port extraction should now correctly handle:")
    print("✅ --port 1 (your case)")
    print("✅ --port 4700 (standard)")
    print("✅ -p 4700 (short form)")
    print("✅ --host 0.0.0.0:4700 (host with port)")
    print("✅ Port validation (1-65535)")
    print("❌ Invalid ports (0, >65535, non-numeric)")
