#!/usr/bin/env python3
"""
Test script for Redis and Celery health check functionality.
Run this script to test the new health check features.
"""

import sys
import os
from pathlib import Path

# Add the project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from setting.utils import SettingsManager

def test_redis_celery_health():
    """Test Redis and Celery health check functionality."""
    print("🧪 Testing Redis & Celery Health Check")
    print("=" * 50)
    
    # Initialize settings manager
    manager = SettingsManager()
    
    print("\n1. Testing Redis Connection...")
    try:
        config = manager.load_current_config()
        redis_url = config['backend'].get('REDIS_URL', 'redis://localhost:6379')
        success, message = manager.test_redis_connection(redis_url)
        print(f"   Redis Connection: {'✅' if success else '❌'} {message}")
    except Exception as e:
        print(f"   Redis Connection: ❌ Error: {e}")
    
    print("\n2. Testing Celery Connection...")
    try:
        success, message = manager.test_celery_connection()
        print(f"   Celery Connection: {'✅' if success else '❌'} {message}")
    except Exception as e:
        print(f"   Celery Connection: ❌ Error: {e}")
    
    print("\n3. Getting Redis Status...")
    try:
        redis_status = manager.get_redis_status()
        print(f"   Redis Running: {'✅' if redis_status['running'] else '❌'}")
        if redis_status['running']:
            print(f"   Version: {redis_status['version']}")
            print(f"   Memory Usage: {redis_status['memory_usage']}")
            print(f"   Connected Clients: {redis_status['connected_clients']}")
            print(f"   Uptime: {redis_status['uptime']} seconds")
            print(f"   Keys Count: {redis_status['keys_count']}")
        else:
            print(f"   Error: {redis_status.get('error', 'Unknown error')}")
    except Exception as e:
        print(f"   Redis Status: ❌ Error: {e}")
    
    print("\n4. Getting Celery Status...")
    try:
        celery_status = manager.get_celery_status()
        print(f"   Workers Running: {'✅' if celery_status['workers_running'] else '❌'}")
        if celery_status['workers_running']:
            print(f"   Active Tasks: {celery_status['active_tasks']}")
            print(f"   Queued Tasks: {celery_status['queued_tasks']}")
            print(f"   Completed Tasks: {celery_status['completed_tasks']}")
            print(f"   Failed Tasks: {celery_status['failed_tasks']}")
        else:
            print(f"   Error: {celery_status.get('error', 'No workers detected')}")
    except Exception as e:
        print(f"   Celery Status: ❌ Error: {e}")
    
    print("\n5. Getting Overall Health...")
    try:
        health = manager.get_redis_and_celery_health()
        status_emoji = '✅' if health['overall_status'] == 'healthy' else '⚠️' if health['overall_status'] == 'degraded' else '❌'
        print(f"   Overall Status: {status_emoji} {health['overall_status'].upper()}")
        
        if health['recommendations']:
            print("   Recommendations:")
            for i, rec in enumerate(health['recommendations'], 1):
                print(f"     {i}. {rec}")
    except Exception as e:
        print(f"   Overall Health: ❌ Error: {e}")
    
    print("\n" + "=" * 50)
    print("✅ Redis & Celery health check test completed!")

if __name__ == '__main__':
    test_redis_celery_health()
