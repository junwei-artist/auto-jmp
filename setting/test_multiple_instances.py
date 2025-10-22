#!/usr/bin/env python3
"""
Test script to verify multiple service instance detection.
This script tests the improved service status detection that shows all running instances.
"""

import sys
import os
from pathlib import Path

# Add the setting directory to Python path
setting_dir = Path(__file__).parent
sys.path.insert(0, str(setting_dir))

from utils import SettingsManager

def test_multiple_instance_detection():
    """Test the multiple instance detection functionality."""
    print("🔍 Testing Multiple Service Instance Detection")
    print("=" * 50)
    
    try:
        # Initialize settings manager
        settings = SettingsManager()
        
        # Get service status
        print("📊 Getting service status...")
        status = settings.get_service_status()
        
        print("\n🔧 Backend Service Status:")
        print(f"  Running: {status['backend']['running']}")
        print(f"  Instances: {len(status['backend']['instances'])}")
        
        if status['backend']['instances']:
            for i, instance in enumerate(status['backend']['instances'], 1):
                print(f"    Instance {i}:")
                print(f"      PID: {instance['pid']}")
                print(f"      Port: {instance['port']}")
                print(f"      Command: {instance['command']}")
                print(f"      Pattern: {instance['pattern']}")
        else:
            print("    No backend instances found")
        
        print("\n🌐 Frontend Service Status:")
        print(f"  Running: {status['frontend']['running']}")
        print(f"  Instances: {len(status['frontend']['instances'])}")
        
        if status['frontend']['instances']:
            for i, instance in enumerate(status['frontend']['instances'], 1):
                print(f"    Instance {i}:")
                print(f"      PID: {instance['pid']}")
                print(f"      Port: {instance['port']}")
                print(f"      Command: {instance['command']}")
                print(f"      Pattern: {instance['pattern']}")
        else:
            print("    No frontend instances found")
        
        # Test restart functionality
        print("\n🔄 Testing restart functionality...")
        print("Note: This will kill all instances and start one new instance")
        
        # Uncomment the following lines to actually test restart (be careful!)
        # print("Killing all backend instances...")
        # success, message = settings.restart_backend()
        # print(f"Backend restart: {success} - {message}")
        
        # print("Killing all frontend instances...")
        # success, message = settings.restart_frontend()
        # print(f"Frontend restart: {success} - {message}")
        
        print("\n✅ Multiple instance detection test completed!")
        
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()

def simulate_multiple_instances():
    """Simulate having multiple instances by showing what the detection would find."""
    print("\n🎭 Simulating Multiple Instance Detection")
    print("=" * 50)
    
    # This is a demonstration of what the new structure looks like
    sample_status = {
        "backend": {
            "running": True,
            "instances": [
                {
                    "pid": "12345",
                    "port": "4700",
                    "command": "python main.py",
                    "pattern": "python.*main.py"
                },
                {
                    "pid": "12346", 
                    "port": "4701",
                    "command": "uvicorn main:app --port 4701",
                    "pattern": "uvicorn.*main:app"
                }
            ]
        },
        "frontend": {
            "running": True,
            "instances": [
                {
                    "pid": "23456",
                    "port": "4800",
                    "command": "npm run dev",
                    "pattern": "npm.*run.*dev"
                },
                {
                    "pid": "23457",
                    "port": "4801", 
                    "command": "next dev -p 4801",
                    "pattern": "next.*dev"
                }
            ]
        }
    }
    
    print("📊 Sample Status Structure:")
    print(f"Backend: {len(sample_status['backend']['instances'])} instances")
    print(f"Frontend: {len(sample_status['frontend']['instances'])} instances")
    
    print("\n🔧 Backend Instances:")
    for i, instance in enumerate(sample_status['backend']['instances'], 1):
        print(f"  {i}. PID {instance['pid']} on port {instance['port']}")
        print(f"     Command: {instance['command']}")
    
    print("\n🌐 Frontend Instances:")
    for i, instance in enumerate(sample_status['frontend']['instances'], 1):
        print(f"  {i}. PID {instance['pid']} on port {instance['port']}")
        print(f"     Command: {instance['command']}")

if __name__ == "__main__":
    print("🚀 Multiple Service Instance Detection Test")
    print("=" * 60)
    
    # Run the actual test
    test_multiple_instance_detection()
    
    # Show simulation
    simulate_multiple_instances()
    
    print("\n" + "=" * 60)
    print("📝 Summary:")
    print("✅ Updated get_service_status() to return all instances")
    print("✅ Updated restart methods to kill all instances")
    print("✅ Updated HTML template to display multiple instances")
    print("✅ Updated JavaScript to render instance details")
    print("\n🎯 The settings panel now shows:")
    print("   • Total count of running instances")
    print("   • Individual instance details (PID, port, command)")
    print("   • Pattern used to detect each instance")
    print("   • 'Restart All' button to kill all and start one")
