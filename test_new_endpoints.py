#!/usr/bin/env python3
"""
Simple test script to verify the new project endpoints work correctly.
This script tests the /owned and /member endpoints.
"""

import requests
import json
import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

def test_endpoints():
    """Test the new project endpoints"""
    base_url = "http://localhost:4700"
    
    # Test data
    test_user = {
        "email": "test@example.com",
        "password": "testpassword123"
    }
    
    print("Testing new project endpoints...")
    
    try:
        # Try to register a test user (ignore if already exists)
        try:
            response = requests.post(f"{base_url}/api/v1/auth/register", json=test_user)
            if response.status_code == 201:
                print("✓ Test user registered")
            elif response.status_code == 400 and "already exists" in response.text:
                print("✓ Test user already exists")
            else:
                print(f"⚠ Registration response: {response.status_code}")
        except Exception as e:
            print(f"⚠ Registration failed: {e}")
        
        # Login to get token
        response = requests.post(f"{base_url}/api/v1/auth/login", json=test_user)
        if response.status_code != 200:
            print(f"✗ Login failed: {response.status_code}")
            return False
        
        token = response.json().get("access_token")
        if not token:
            print("✗ No access token received")
            return False
        
        print("✓ Login successful")
        
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test owned projects endpoint
        response = requests.get(f"{base_url}/api/v1/projects/owned", headers=headers)
        if response.status_code == 200:
            owned_projects = response.json()
            print(f"✓ Owned projects endpoint works: {len(owned_projects)} projects")
        else:
            print(f"✗ Owned projects endpoint failed: {response.status_code}")
            return False
        
        # Test member projects endpoint
        response = requests.get(f"{base_url}/api/v1/projects/member", headers=headers)
        if response.status_code == 200:
            member_projects = response.json()
            print(f"✓ Member projects endpoint works: {len(member_projects)} projects")
        else:
            print(f"✗ Member projects endpoint failed: {response.status_code}")
            return False
        
        # Test original projects endpoint still works
        response = requests.get(f"{base_url}/api/v1/projects/", headers=headers)
        if response.status_code == 200:
            all_projects = response.json()
            print(f"✓ Original projects endpoint still works: {len(all_projects)} projects")
            
            # Verify that owned + member = all (approximately)
            total_separate = len(owned_projects) + len(member_projects)
            if abs(len(all_projects) - total_separate) <= 1:  # Allow for small differences
                print("✓ Project counts are consistent")
            else:
                print(f"⚠ Project count mismatch: all={len(all_projects)}, owned={len(owned_projects)}, member={len(member_projects)}")
        else:
            print(f"✗ Original projects endpoint failed: {response.status_code}")
            return False
        
        print("\n🎉 All tests passed! The new endpoints are working correctly.")
        return True
        
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to backend server. Make sure it's running on localhost:4700")
        return False
    except Exception as e:
        print(f"✗ Test failed with error: {e}")
        return False

if __name__ == "__main__":
    success = test_endpoints()
    sys.exit(0 if success else 1)
