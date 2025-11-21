#!/usr/bin/env python3
"""
Enhanced Auto-JMP Settings Tool Demo
This script demonstrates all the new diagnostic features.
"""

import sys
import json
from pathlib import Path

# Add the project root to Python path
current_dir = Path(__file__).parent
project_root = current_dir.parent
sys.path.insert(0, str(project_root))

from setting.utils import SettingsManager

def demo_enhanced_features():
    """Demonstrate the enhanced diagnostic features."""
    print("🧰 Auto-JMP Settings Tool - Enhanced Diagnostics Demo")
    print("=" * 70)
    print()
    
    manager = SettingsManager()
    
    # System Information
    print("📊 SYSTEM INFORMATION")
    print("-" * 30)
    system_info = manager.get_system_info()
    print(f"Hostname: {system_info['hostname']}")
    print(f"Platform: {system_info['platform']}")
    print(f"Python Version: {system_info['python_version']}")
    print(f"External IP: {system_info['ip_addresses']['external']}")
    print(f"Internal IPs: {system_info['ip_addresses']['internal']}")
    print(f"Firewall Status: {system_info['firewall_status']['status']}")
    print()
    
    # Service Status
    print("🔧 SERVICE STATUS")
    print("-" * 30)
    status = manager.get_service_status()
    print(f"Backend: {'✅ Running' if status['backend']['running'] else '❌ Stopped'}")
    if status['backend']['running']:
        print(f"  Port: {status['backend']['port']}")
        print(f"  PID: {status['backend']['pid']}")
    print(f"Frontend: {'✅ Running' if status['frontend']['running'] else '❌ Stopped'}")
    if status['frontend']['running']:
        print(f"  Port: {status['frontend']['port']}")
        print(f"  PID: {status['frontend']['pid']}")
    print()
    
    # Communication Test
    print("🔗 COMMUNICATION TEST")
    print("-" * 30)
    comm_test = manager.test_frontend_backend_communication()
    print(f"Backend Accessible: {'✅ Yes' if comm_test['backend_accessible'] else '❌ No'}")
    print(f"Frontend Accessible: {'✅ Yes' if comm_test['frontend_accessible'] else '❌ No'}")
    print(f"CORS Configuration: {'✅ Yes' if comm_test['cors_configuration'] else '❌ No'}")
    print(f"WebSocket Connection: {'✅ Yes' if comm_test['websocket_connection'] else '❌ No'}")
    if comm_test['errors']:
        print("Errors:")
        for error in comm_test['errors']:
            print(f"  ⚠️  {error}")
    print()
    
    # Configuration Consistency
    print("✅ CONFIGURATION CONSISTENCY")
    print("-" * 30)
    consistency = manager.check_configuration_consistency()
    print(f"Backend-Frontend URLs: {'✅ Consistent' if consistency['backend_frontend_urls'] else '❌ Inconsistent'}")
    print(f"Port Consistency: {'✅ Different ports' if consistency['port_consistency'] else '❌ Same port'}")
    print(f"Environment: {'✅ Valid' if consistency['environment_consistency'] else '❌ Invalid'}")
    print(f"Database Config: {'✅ Configured' if consistency['database_config'] else '❌ Missing'}")
    print(f"Redis Config: {'✅ Configured' if consistency['redis_config'] else '❌ Missing'}")
    
    if consistency['issues']:
        print("Issues:")
        for issue in consistency['issues']:
            print(f"  ⚠️  {issue}")
    
    if consistency['recommendations']:
        print("Recommendations:")
        for rec in consistency['recommendations']:
            print(f"  💡 {rec}")
    print()
    
    # Network Connectivity
    print("🌐 NETWORK CONNECTIVITY")
    print("-" * 30)
    connectivity = manager._test_network_connectivity()
    print(f"Internet Access: {'✅ Yes' if connectivity['internet'] else '❌ No'}")
    print(f"DNS Resolution: {'✅ Yes' if connectivity['dns_resolution'] else '❌ No'}")
    print("External Services:")
    for service, status in connectivity['external_services'].items():
        print(f"  {service}: {'✅ Accessible' if status else '❌ Not accessible'}")
    print()
    
    # Configuration Summary
    print("⚙️  CONFIGURATION SUMMARY")
    print("-" * 30)
    config = manager.load_current_config()
    backend_url = config['frontend'].get('NEXT_PUBLIC_BACKEND_URL', 'Not set')
    frontend_url = config['frontend'].get('NEXT_PUBLIC_FRONTEND_URL', 'Not set')
    ws_url = config['frontend'].get('NEXT_PUBLIC_WS_URL', 'Not set')
    
    print(f"Backend URL: {backend_url}")
    print(f"Frontend URL: {frontend_url}")
    print(f"WebSocket URL: {ws_url}")
    print(f"Environment: {config['backend'].get('ENVIRONMENT', 'Not set')}")
    print(f"Database: {'Configured' if config['backend'].get('DATABASE_URL') else 'Not configured'}")
    print(f"Redis: {'Configured' if config['backend'].get('REDIS_URL') else 'Not configured'}")
    print()
    
    print("🎉 Enhanced diagnostics completed!")
    print()
    print("🚀 To use the web interface:")
    print("   python -m setting")
    print("   Then open: http://localhost:4900")
    print("   Go to the 'Diagnostics' tab for detailed information")

if __name__ == "__main__":
    demo_enhanced_features()
