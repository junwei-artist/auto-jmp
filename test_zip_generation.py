#!/usr/bin/env python3
"""
Test script for ZIP file generation functionality
"""
import requests
import json
import os
import tempfile
from pathlib import Path

# Configuration
BACKEND_URL = "http://localhost:4700"
TEST_EXCEL_FILE = "test_excel.xlsx"  # Use existing test file

def login():
    """Login and get auth token"""
    login_data = {
        "email": "admin@admin.com",
        "password": "admin"  # Updated password
    }
    
    response = requests.post(f"{BACKEND_URL}/api/v1/auth/login", json=login_data)
    if response.status_code == 200:
        token = response.json()["access_token"]
        print(f"✅ Login successful")
        return token
    else:
        print(f"❌ Login failed: {response.status_code} - {response.text}")
        return None

def create_test_project(token):
    """Create a test project"""
    headers = {"Authorization": f"Bearer {token}"}
    project_data = {
        "name": "ZIP Test Project",
        "description": "Testing ZIP file generation",
        "allow_guest": False,
        "is_public": False
    }
    
    response = requests.post(f"{BACKEND_URL}/api/v1/projects/", json=project_data, headers=headers)
    if response.status_code == 200:
        project = response.json()
        print(f"✅ Project created: {project['id']}")
        return project["id"]
    else:
        print(f"❌ Project creation failed: {response.status_code} - {response.text}")
        return None

def test_cpk_zip_generation(token, project_id):
    """Test CPK extension ZIP generation"""
    print("\n🧪 Testing CPK ZIP generation...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Check if test Excel file exists
    if not os.path.exists(TEST_EXCEL_FILE):
        print(f"❌ Test Excel file not found: {TEST_EXCEL_FILE}")
        return False
    
    # Prepare form data
    with open(TEST_EXCEL_FILE, 'rb') as f:
        files = {'file': (TEST_EXCEL_FILE, f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        data = {
            'project_id': project_id,
            'project_name': 'CPK ZIP Test',
            'project_description': 'Testing ZIP generation with CPK',
            'imgdir': '/tmp/',
            'cat_var': 'Stage'  # This will be ignored
        }
        
        response = requests.post(
            f"{BACKEND_URL}/api/v1/extensions/excel2cpkv1/run-analysis",
            files=files,
            data=data,
            headers=headers
        )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ CPK analysis completed")
        print(f"   Response: {json.dumps(result, indent=2)}")
        if result.get('success', False):
            if 'run' in result:
                print(f"   Run ID: {result['run']['id']}")
            print(f"   ZIP Key: {result.get('storage', {}).get('zip_key', 'None')}")
            if result.get('zip_info'):
                print(f"   ZIP Size: {result['zip_info']['zip_size_mb']} MB")
            return True
        else:
            print(f"   Error: {result.get('error', 'Unknown error')}")
            return False
    else:
        print(f"❌ CPK analysis failed: {response.status_code} - {response.text}")
        return False

def test_boxplot_zip_generation(token, project_id):
    """Test Boxplot extension ZIP generation"""
    print("\n🧪 Testing Boxplot ZIP generation...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Check if test Excel file exists
    if not os.path.exists(TEST_EXCEL_FILE):
        print(f"❌ Test Excel file not found: {TEST_EXCEL_FILE}")
        return False
    
    # Prepare form data
    with open(TEST_EXCEL_FILE, 'rb') as f:
        files = {'file': (TEST_EXCEL_FILE, f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        data = {
            'project_id': project_id,
            'project_name': 'Boxplot ZIP Test',
            'project_description': 'Testing ZIP generation with Boxplot',
            'cat_var': 'Stage',
            'color_by': None
        }
        
        response = requests.post(
            f"{BACKEND_URL}/api/v1/extensions/excel2boxplotv1/run-analysis",
            files=files,
            data=data,
            headers=headers
        )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Boxplot analysis completed")
        print(f"   Response: {json.dumps(result, indent=2)}")
        if result.get('success', False):
            if 'run' in result:
                print(f"   Run ID: {result['run']['id']}")
            print(f"   ZIP Key: {result.get('storage', {}).get('zip_key', 'None')}")
            if result.get('zip_info'):
                print(f"   ZIP Size: {result['zip_info']['zip_size_mb']} MB")
            return True
        else:
            print(f"   Error: {result.get('error', 'Unknown error')}")
            return False
    else:
        print(f"❌ Boxplot analysis failed: {response.status_code} - {response.text}")
        return False

def test_commonality_zip_generation(token, project_id):
    """Test Commonality extension ZIP generation"""
    print("\n🧪 Testing Commonality ZIP generation...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Check if test Excel file exists
    if not os.path.exists(TEST_EXCEL_FILE):
        print(f"❌ Test Excel file not found: {TEST_EXCEL_FILE}")
        return False
    
    # Prepare form data
    with open(TEST_EXCEL_FILE, 'rb') as f:
        files = {'file': (TEST_EXCEL_FILE, f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        data = {
            'project_id': project_id,
            'project_name': 'Commonality ZIP Test',
            'project_description': 'Testing ZIP generation with Commonality',
            'cat_var': 'Stage'  # This will be ignored
        }
        
        response = requests.post(
            f"{BACKEND_URL}/api/v1/extensions/excel2commonality/run-analysis",
            files=files,
            data=data,
            headers=headers
        )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Commonality analysis completed")
        print(f"   Response: {json.dumps(result, indent=2)}")
        if result.get('success', False):
            if 'run' in result:
                print(f"   Run ID: {result['run']['id']}")
            print(f"   ZIP Key: {result.get('storage', {}).get('zip_key', 'None')}")
            if result.get('zip_info'):
                print(f"   ZIP Size: {result['zip_info']['zip_size_mb']} MB")
            return True
        else:
            print(f"   Error: {result.get('error', 'Unknown error')}")
            return False
    else:
        print(f"❌ Commonality analysis failed: {response.status_code} - {response.text}")
        return False

def check_project_attachments(token, project_id):
    """Check project attachments to see if ZIP files were added"""
    print(f"\n📎 Checking project attachments...")
    
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BACKEND_URL}/api/v1/projects/{project_id}/attachments", headers=headers)
    
    if response.status_code == 200:
        attachments = response.json()
        print(f"✅ Found {len(attachments)} attachments:")
        
        zip_attachments = [att for att in attachments if att['filename'].endswith('.zip')]
        print(f"   ZIP files: {len(zip_attachments)}")
        
        for attachment in attachments:
            print(f"   - {attachment['filename']} ({attachment['description']})")
            if attachment['filename'].endswith('.zip'):
                print(f"     Size: {attachment['file_size']} bytes")
                print(f"     MIME: {attachment['mime_type']}")
        
        return len(zip_attachments) > 0
    else:
        print(f"❌ Failed to get attachments: {response.status_code} - {response.text}")
        return False

def main():
    """Main test function"""
    print("🚀 Testing ZIP file generation functionality")
    print("=" * 50)
    
    # Login
    token = login()
    if not token:
        return
    
    # Create test project
    project_id = create_test_project(token)
    if not project_id:
        return
    
    # Test each extension
    cpk_success = test_cpk_zip_generation(token, project_id)
    boxplot_success = test_boxplot_zip_generation(token, project_id)
    commonality_success = test_commonality_zip_generation(token, project_id)
    
    # Check attachments
    attachments_found = check_project_attachments(token, project_id)
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Test Summary:")
    print(f"   CPK ZIP Generation: {'✅ PASS' if cpk_success else '❌ FAIL'}")
    print(f"   Boxplot ZIP Generation: {'✅ PASS' if boxplot_success else '❌ FAIL'}")
    print(f"   Commonality ZIP Generation: {'✅ PASS' if commonality_success else '❌ FAIL'}")
    print(f"   ZIP Attachments Found: {'✅ PASS' if attachments_found else '❌ FAIL'}")
    
    if all([cpk_success, boxplot_success, commonality_success, attachments_found]):
        print("\n🎉 All tests passed! ZIP generation is working correctly.")
    else:
        print("\n⚠️  Some tests failed. Check the logs above for details.")

if __name__ == "__main__":
    main()
