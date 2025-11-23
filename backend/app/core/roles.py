"""
Utility functions for managing project roles.
Ensures default roles exist in the database.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import logging
import json

logger = logging.getLogger(__name__)

# Default system roles
DEFAULT_ROLES = [
    {
        "id": "00000000-0000-0000-0000-000000000001",
        "name": "OWNER",
        "display_name": "Project Owner",
        "description": "Full access to project including member management",
        "permissions": {"manage_members": True, "edit_project": True, "run_analysis": True, "view_project": True},
        "is_system_role": True
    },
    {
        "id": "00000000-0000-0000-0000-000000000002",
        "name": "MEMBER",
        "display_name": "Project Member",
        "description": "Can run analysis and edit project content",
        "permissions": {"run_analysis": True, "edit_project": True, "view_project": True},
        "is_system_role": False
    },
    {
        "id": "00000000-0000-0000-0000-000000000003",
        "name": "WATCHER",
        "display_name": "Project Watcher",
        "description": "Can only view project and results",
        "permissions": {"view_project": True},
        "is_system_role": False
    }
]

async def ensure_default_roles(db: AsyncSession) -> None:
    """
    Ensure that default project roles exist in the database.
    This function is idempotent - it can be called multiple times safely.
    """
    try:
        for role in DEFAULT_ROLES:
            # Check if role exists
            result = await db.execute(
                text("SELECT id FROM project_role WHERE id = :id"),
                {"id": role["id"]}
            )
            existing = result.fetchone()
            
            if not existing:
                # Insert the role - use CAST for JSON conversion
                permissions_json = json.dumps(role["permissions"])
                await db.execute(
                    text("""
                        INSERT INTO project_role (id, name, display_name, description, permissions, is_system_role)
                        VALUES (:id, :name, :display_name, :description, CAST(:permissions AS jsonb), :is_system_role)
                        ON CONFLICT (id) DO NOTHING
                    """),
                    {
                        "id": role["id"],
                        "name": role["name"],
                        "display_name": role["display_name"],
                        "description": role["description"],
                        "permissions": permissions_json,
                        "is_system_role": role["is_system_role"]
                    }
                )
                logger.info(f"Created default role: {role['name']}")
        
        await db.commit()
    except Exception as e:
        logger.error(f"Error ensuring default roles: {e}")
        await db.rollback()
        raise

async def get_role_id_by_name(db: AsyncSession, role_name: str) -> str:
    """
    Get the role ID for a given role name.
    Ensures default roles exist first.
    """
    await ensure_default_roles(db)
    
    result = await db.execute(
        text("SELECT id FROM project_role WHERE name = :name"),
        {"name": role_name}
    )
    row = result.fetchone()
    if row:
        return str(row[0])
    
    # Fallback to default role IDs
    role_map = {
        "OWNER": "00000000-0000-0000-0000-000000000001",
        "MEMBER": "00000000-0000-0000-0000-000000000002",
        "WATCHER": "00000000-0000-0000-0000-000000000003"
    }
    return role_map.get(role_name, "00000000-0000-0000-0000-000000000002")  # Default to MEMBER

