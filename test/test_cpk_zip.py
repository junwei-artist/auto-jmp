#!/usr/bin/env python3
"""
Test script for CPK ZIP file generation with meta_fixed.xlsx
"""
import requests
import json
import os
from pathlib import Path

# Configuration
BACKEND_URL = "http://localhost:4700"
TEST_EXCEL_FILE = "/Users/lytech/Documents/GitHub/auto-jmp/cpk-jsl/excel/meta/meta_fixed.xlsx"

def login():
    """Login and get auth token"""
    login_data = {
        "email": "admin@admin.com",
        "password": "admin"
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
        "name": "CPK ZIP Test with Meta Fixed",
        "description": "Testing ZIP file generation with meta_fixed.xlsx",
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

def test_cpk_with_meta_fixed(token, project_id):
    """Test CPK extension with meta_fixed.xlsx"""
    print(f"\n🧪 Testing CPK with meta_fixed.xlsx...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Check if test Excel file exists
    if not os.path.exists(TEST_EXCEL_FILE):
        print(f"❌ Test Excel file not found: {TEST_EXCEL_FILE}")
        return False
    
    print(f"📁 Using Excel file: {TEST_EXCEL_FILE}")
    
    # Prepare form data
    with open(TEST_EXCEL_FILE, 'rb') as f:
        files = {'file': ('meta_fixed.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        data = {
            'project_id': project_id,
            'project_name': 'CPK Meta Fixed Test',
            'project_description': 'Testing ZIP generation with meta_fixed.xlsx',
            'imgdir': '/tmp/',
            'cat_var': 'Stage'  # This will be ignored
        }
        
        response = requests.post(
            f"{BACKEND_URL}/api/v1/extensions/excel2cpkv1/run-analysis",
            files=files,
            data=data,
            headers=headers
        )
    
    print(f"📡 Response Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ CPK analysis completed")
        
        if result.get('success', False):
            print(f"   Run ID: {result['run']['id']}")
            print(f"   ZIP Key: {result.get('storage', {}).get('zip_key', 'None')}")
            if result.get('zip_info'):
                print(f"   ZIP Size: {result['zip_info']['zip_size_mb']} MB")
                print(f"   ZIP Path: {result['zip_info']['zip_path']}")
            
            # Check if ZIP file exists on disk
            zip_path = result.get('zip_info', {}).get('zip_path')
            if zip_path and os.path.exists(zip_path):
                print(f"   ✅ ZIP file exists on disk: {zip_path}")
            else:
                print(f"   ❌ ZIP file not found on disk")
            
            return True
        else:
            print(f"   ❌ Analysis failed: {result.get('error', 'Unknown error')}")
            return False
    else:
        print(f"❌ CPK analysis failed: {response.status_code} - {response.text}")
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
                print(f"     Storage Key: {attachment.get('storage_key', 'N/A')}")
        
        return len(zip_attachments) > 0
    else:
        print(f"❌ Failed to get attachments: {response.status_code} - {response.text}")
        return False

def download_and_verify_zip(token, project_id):
    """Download and verify ZIP file contents"""
    print(f"\n🔍 Verifying ZIP file contents...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get attachments
    response = requests.get(f"{BACKEND_URL}/api/v1/projects/{project_id}/attachments", headers=headers)
    if response.status_code != 200:
        print(f"❌ Failed to get attachments")
        return False
    
    attachments = response.json()
    zip_attachments = [att for att in attachments if att['filename'].endswith('.zip')]
    
    if not zip_attachments:
        print(f"❌ No ZIP attachments found")
        return False
    
    zip_attachment = zip_attachments[0]
    attachment_id = zip_attachment['id']
    
    # Download ZIP file
    response = requests.get(f"{BACKEND_URL}/api/v1/projects/{project_id}/attachments/{attachment_id}/download", headers=headers)
    if response.status_code == 200:
        zip_content = response.content
        print(f"✅ Downloaded ZIP file: {len(zip_content)} bytes")
        
        # Save to temporary file for inspection
        import tempfile
        import zipfile
        
        with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp_file:
            tmp_file.write(zip_content)
            tmp_file.flush()
            
            # Extract and list contents
            with zipfile.ZipFile(tmp_file.name, 'r') as zipf:
                file_list = zipf.namelist()
                print(f"📦 ZIP contents ({len(file_list)} files):")
                for file_name in file_list:
                    file_info = zipf.getinfo(file_name)
                    print(f"   - {file_name} ({file_info.file_size} bytes)")
                
                # Check for expected files
                expected_files = ['meta_fixed.xlsx', 'data.csv', 'script.jsl', 'README.txt']
                found_files = [f for f in expected_files if f in file_list]
                print(f"✅ Found expected files: {found_files}")
                
                if len(found_files) == len(expected_files):
                    print(f"🎉 All expected files found in ZIP!")
                    return True
                else:
                    missing = set(expected_files) - set(found_files)
                    print(f"⚠️  Missing files: {missing}")
                    return False
        
        # Clean up
        os.unlink(tmp_file.name)
    else:
        print(f"❌ Failed to download ZIP file: {response.status_code}")
        return False

def main():
    """Main test function"""
    print("🚀 Testing CPK ZIP file generation with meta_fixed.xlsx")
    print("=" * 60)
    
    # Check if backend is running
    try:
        response = requests.post(f"{BACKEND_URL}/api/v1/auth/login", json={"email":"test","password":"test"}, timeout=5)
        if response.status_code not in [200, 422]:  # 422 is validation error, which means backend is running
            print(f"❌ Backend not responding properly")
            return
    except requests.exceptions.RequestException:
        print(f"❌ Backend not running at {BACKEND_URL}")
        print(f"   Please start the backend server first")
        return
    
    # Login
    token = login()
    if not token:
        return
    
    # Create test project
    project_id = create_test_project(token)
    if not project_id:
        return
    
    # Test CPK with meta_fixed.xlsx
    cpk_success = test_cpk_with_meta_fixed(token, project_id)
    
    # Check attachments
    attachments_found = check_project_attachments(token, project_id)
    
    # Download and verify ZIP
    zip_verified = False
    if attachments_found:
        zip_verified = download_and_verify_zip(token, project_id)
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Summary:")
    print(f"   CPK Analysis: {'✅ PASS' if cpk_success else '❌ FAIL'}")
    print(f"   ZIP Attachment Created: {'✅ PASS' if attachments_found else '❌ FAIL'}")
    print(f"   ZIP Contents Verified: {'✅ PASS' if zip_verified else '❌ FAIL'}")
    
    if all([cpk_success, attachments_found, zip_verified]):
        print("\n🎉 All tests passed! ZIP generation is working perfectly.")
        print("   The ZIP file contains:")
        print("   - Original Excel file (meta_fixed.xlsx)")
        print("   - Generated CSV file (data.csv)")
        print("   - Generated JSL file (script.jsl)")
        print("   - README file with instructions")
    else:
        print("\n⚠️  Some tests failed. Check the logs above for details.")

if __name__ == "__main__":
    main()
