#!/usr/bin/env python3
"""
Test script for the new membership and comment system API endpoints
"""

import asyncio
import httpx
import json
from uuid import uuid4

# Test configuration
BASE_URL = "http://localhost:4700"
TEST_EMAIL = "admin@example.com"
TEST_PASSWORD = "admin123"

async def test_membership_system():
    """Test the membership system endpoints"""
    
    async with httpx.AsyncClient() as client:
        print("🔐 Testing Membership System API Endpoints")
        print("=" * 50)
        
        # 1. Login to get authentication token
        print("\n1. Logging in...")
        login_response = await client.post(
            f"{BASE_URL}/api/v1/auth/login",
            data={"username": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        
        if login_response.status_code != 200:
            print(f"❌ Login failed: {login_response.status_code}")
            print(login_response.text)
            return
        
        token = login_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("✅ Login successful")
        
        # 2. Get projects to find one to test with
        print("\n2. Getting projects...")
        projects_response = await client.get(
            f"{BASE_URL}/api/v1/projects/",
            headers=headers
        )
        
        if projects_response.status_code != 200:
            print(f"❌ Failed to get projects: {projects_response.status_code}")
            return
        
        projects = projects_response.json()
        if not projects:
            print("❌ No projects found to test with")
            return
        
        project_id = projects[0]["id"]
        print(f"✅ Found project: {projects[0]['name']} (ID: {project_id})")
        
        # 3. Test getting project members
        print("\n3. Testing get project members...")
        members_response = await client.get(
            f"{BASE_URL}/api/v1/members/projects/{project_id}/members",
            headers=headers
        )
        
        if members_response.status_code == 200:
            members = members_response.json()
            print(f"✅ Found {len(members)} members")
            for member in members:
                print(f"   - {member['email']} ({member['role']})")
        else:
            print(f"❌ Failed to get members: {members_response.status_code}")
            print(members_response.text)
        
        # 4. Test getting project comments
        print("\n4. Testing get project comments...")
        comments_response = await client.get(
            f"{BASE_URL}/api/v1/members/projects/{project_id}/comments",
            headers=headers
        )
        
        if comments_response.status_code == 200:
            comments = comments_response.json()
            print(f"✅ Found {len(comments)} comments")
            for comment in comments:
                print(f"   - {comment['user_email']}: {comment['content'][:50]}...")
        else:
            print(f"❌ Failed to get comments: {comments_response.status_code}")
            print(comments_response.text)
        
        # 5. Test creating a comment
        print("\n5. Testing create comment...")
        comment_data = {
            "content": f"Test comment from API test - {uuid4()}"
        }
        
        create_comment_response = await client.post(
            f"{BASE_URL}/api/v1/members/projects/{project_id}/comments",
            headers=headers,
            json=comment_data
        )
        
        if create_comment_response.status_code == 200:
            print("✅ Comment created successfully")
            
            # Get the comment ID for testing update/delete
            comment_id = create_comment_response.json()["comment_id"]
            
            # 6. Test updating the comment
            print("\n6. Testing update comment...")
            update_data = {
                "content": f"Updated comment - {uuid4()}"
            }
            
            update_response = await client.put(
                f"{BASE_URL}/api/v1/members/projects/{project_id}/comments/{comment_id}",
                headers=headers,
                json=update_data
            )
            
            if update_response.status_code == 200:
                print("✅ Comment updated successfully")
            else:
                print(f"❌ Failed to update comment: {update_response.status_code}")
            
            # 7. Test deleting the comment
            print("\n7. Testing delete comment...")
            delete_response = await client.delete(
                f"{BASE_URL}/api/v1/members/projects/{project_id}/comments/{comment_id}",
                headers=headers
            )
            
            if delete_response.status_code == 200:
                print("✅ Comment deleted successfully")
            else:
                print(f"❌ Failed to delete comment: {delete_response.status_code}")
        
        else:
            print(f"❌ Failed to create comment: {create_comment_response.status_code}")
            print(create_comment_response.text)
        
        print("\n🎉 Membership system API test completed!")

if __name__ == "__main__":
    asyncio.run(test_membership_system())
