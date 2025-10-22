#!/usr/bin/env python3
"""
Test script for the Auto-JMP Settings Tool port checking functionality.
This script demonstrates the port checking and process management features.
"""

import sys
import os
from pathlib import Path

# Add the current directory to Python path
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

from config_wizard import is_port_in_use, get_process_using_port, kill_process, wait_for_port_to_be_free

def test_port_functionality():
    """Test the port checking functionality."""
    print("🧪 Testing Auto-JMP Settings Tool Port Functionality")
    print("=" * 60)
    
    port = 4900
    
    print(f"🔍 Checking port {port}...")
    
    if is_port_in_use(port):
        print(f"⚠️  Port {port} is currently in use")
        
        pid = get_process_using_port(port)
        if pid:
            print(f"📋 Process {pid} is using port {port}")
            
            # Ask user if they want to test killing the process
            response = input(f"Would you like to test killing process {pid}? (y/n): ").lower().strip()
            if response in ['y', 'yes']:
                print(f"🔪 Testing kill process {pid}...")
                if kill_process(pid):
                    print(f"✅ Process {pid} killed successfully")
                    
                    # Wait for port to be free
                    print(f"⏳ Waiting for port {port} to be free...")
                    if wait_for_port_to_be_free(port, timeout=5):
                        print(f"✅ Port {port} is now free")
                    else:
                        print(f"❌ Port {port} is still in use")
                else:
                    print(f"❌ Failed to kill process {pid}")
            else:
                print("⏭️  Skipping process kill test")
        else:
            print(f"❌ Could not identify process using port {port}")
    else:
        print(f"✅ Port {port} is available")
    
    print("\n🎉 Port functionality test completed!")

if __name__ == "__main__":
    test_port_functionality()
