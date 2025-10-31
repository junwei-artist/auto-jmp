from fastapi import APIRouter, Depends, HTTPException, status, Request, Form
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import uuid
import secrets
import hashlib
import base64
from datetime import datetime, timedelta
import urllib.parse

from app.core.database import get_db
from app.core.auth import get_current_user, get_current_user_optional, get_password_hash, create_access_token, security
from app.models import AppUser, OAuthClient, AuthorizationCode

router = APIRouter()

# ============================================================================
# Pydantic Models
# ============================================================================

class OAuthClientCreate(BaseModel):
    """Request to create a new OAuth client"""
    client_name: str
    description: Optional[str] = None
    redirect_uris: List[str]

class OAuthClientResponse(BaseModel):
    """OAuth client information (with secret shown only once)"""
    id: str
    client_id: str
    client_secret: str  # Only shown once on creation
    client_name: str
    description: Optional[str] = None
    redirect_uris: List[str]
    owner_id: str
    is_active: bool
    created_at: str

class OAuthClientInfoResponse(BaseModel):
    """OAuth client information (without secret)"""
    id: str
    client_id: str
    client_name: str
    description: Optional[str] = None
    redirect_uris: List[str]
    owner_id: str
    is_active: bool
    created_at: str
    last_used_at: Optional[str] = None

class OAuthClientUpdate(BaseModel):
    """Request to update an OAuth client"""
    redirect_uris: Optional[List[str]] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class OAuthTokenResponse(BaseModel):
    """OAuth2 token response"""
    access_token: str
    token_type: str = "Bearer"
    expires_in: int
    scope: Optional[str] = None

# ============================================================================
# Helper Functions
# ============================================================================

def generate_client_id() -> str:
    """Generate a unique client ID"""
    return base64.urlsafe_b64encode(secrets.token_bytes(16)).decode('utf-8').rstrip('=')

def generate_client_secret() -> str:
    """Generate a client secret (to be hashed before storage)"""
    return secrets.token_urlsafe(32)

def generate_authorization_code() -> str:
    """Generate an authorization code"""
    return secrets.token_urlsafe(32)

def hash_client_secret(secret: str) -> str:
    """Hash a client secret using SHA-256"""
    return hashlib.sha256(secret.encode()).hexdigest()

def verify_client_secret(plain_secret: str, hashed_secret: str) -> bool:
    """Verify a client secret against its hash"""
    return hash_client_secret(plain_secret) == hashed_secret

# ============================================================================
# OAuth2 Client Management Endpoints
# ============================================================================

@router.post("/clients", response_model=OAuthClientResponse, status_code=status.HTTP_201_CREATED)
async def create_oauth_client(
    client_data: OAuthClientCreate,
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new OAuth2 client for the current user"""
    
    # Generate client ID and secret
    client_id = generate_client_id()
    client_secret = generate_client_secret()
    client_secret_hash = hash_client_secret(client_secret)
    
    # Validate redirect URIs
    if not client_data.redirect_uris:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one redirect URI must be provided"
        )
    
    # Create client
    oauth_client = OAuthClient(
        client_id=client_id,
        client_secret_hash=client_secret_hash,
        client_name=client_data.client_name,
        description=client_data.description,
        redirect_uris=client_data.redirect_uris,
        owner_id=current_user.id,
        is_active=True
    )
    
    db.add(oauth_client)
    await db.commit()
    await db.refresh(oauth_client)
    
    return OAuthClientResponse(
        id=str(oauth_client.id),
        client_id=oauth_client.client_id,
        client_secret=client_secret,  # Show secret only once
        client_name=oauth_client.client_name,
        description=oauth_client.description,
        redirect_uris=oauth_client.redirect_uris,
        owner_id=str(oauth_client.owner_id),
        is_active=oauth_client.is_active,
        created_at=oauth_client.created_at.isoformat()
    )

@router.get("/clients", response_model=List[OAuthClientInfoResponse])
async def list_oauth_clients(
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all OAuth2 clients for the current user"""
    
    result = await db.execute(
        select(OAuthClient).where(OAuthClient.owner_id == current_user.id)
    )
    clients = result.scalars().all()
    
    return [
        OAuthClientInfoResponse(
            id=str(client.id),
            client_id=client.client_id,
            client_name=client.client_name,
            description=client.description,
            redirect_uris=client.redirect_uris,
            owner_id=str(client.owner_id),
            is_active=client.is_active,
            created_at=client.created_at.isoformat(),
            last_used_at=client.last_used_at.isoformat() if client.last_used_at else None
        )
        for client in clients
    ]

@router.get("/clients/{client_id}", response_model=OAuthClientInfoResponse)
async def get_oauth_client(
    client_id: str,
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get OAuth2 client details"""
    
    result = await db.execute(
        select(OAuthClient).where(
            OAuthClient.client_id == client_id,
            OAuthClient.owner_id == current_user.id
        )
    )
    client = result.scalar_one_or_none()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OAuth client not found"
        )
    
    return OAuthClientInfoResponse(
        id=str(client.id),
        client_id=client.client_id,
        client_name=client.client_name,
        description=client.description,
        redirect_uris=client.redirect_uris,
        owner_id=str(client.owner_id),
        is_active=client.is_active,
        created_at=client.created_at.isoformat(),
        last_used_at=client.last_used_at.isoformat() if client.last_used_at else None
    )

@router.delete("/clients/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_oauth_client(
    client_id: str,
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an OAuth2 client"""
    
    result = await db.execute(
        select(OAuthClient).where(
            OAuthClient.client_id == client_id,
            OAuthClient.owner_id == current_user.id
        )
    )
    client = result.scalar_one_or_none()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OAuth client not found"
        )
    
    await db.delete(client)
    await db.commit()
    
    return None

@router.patch("/clients/{client_id}", response_model=OAuthClientInfoResponse)
async def update_oauth_client(
    client_id: str,
    update_data: OAuthClientUpdate,
    current_user: AppUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an OAuth2 client (redirect URIs, description, active status)"""
    
    result = await db.execute(
        select(OAuthClient).where(
            OAuthClient.client_id == client_id,
            OAuthClient.owner_id == current_user.id
        )
    )
    client = result.scalar_one_or_none()
    
    if not client:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OAuth client not found"
        )
    
    # Update fields
    if update_data.redirect_uris is not None:
        client.redirect_uris = update_data.redirect_uris
    if update_data.description is not None:
        client.description = update_data.description
    if update_data.is_active is not None:
        client.is_active = update_data.is_active
    
    await db.commit()
    await db.refresh(client)
    
    return OAuthClientInfoResponse(
        id=str(client.id),
        client_id=client.client_id,
        client_name=client.client_name,
        description=client.description,
        redirect_uris=client.redirect_uris,
        owner_id=str(client.owner_id),
        is_active=client.is_active,
        created_at=client.created_at.isoformat(),
        last_used_at=client.last_used_at.isoformat() if client.last_used_at else None
    )

# ============================================================================
# OAuth2 Authorization Flow Endpoints
# ============================================================================

@router.get("/authorize")
async def authorize(
    client_id: str,
    redirect_uri: str,
    response_type: str = "code",
    scope: Optional[str] = None,
    state: Optional[str] = None,
    code_challenge: Optional[str] = None,
    code_challenge_method: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """OAuth2 authorization endpoint - returns login page if not authenticated"""
    
    # Get client info
    result = await db.execute(
        select(OAuthClient).where(OAuthClient.client_id == client_id)
    )
    client = result.scalar_one_or_none()
    
    if not client or not client.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid client"
        )
    
    # Build parameters for login page
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": response_type,
        "state": state or "",
        "scope": scope or ""
    }
    
    # Return login page HTML
    return HTMLResponse(content=f"""
<!DOCTYPE html>
<html>
<head>
    <title>Authorize Application</title>
    <style>
        body {{ font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }}
        .app-info {{ background: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }}
        .error {{ color: red; margin-bottom: 15px; }}
        input {{ width: 100%; padding: 10px; margin: 5px 0; box-sizing: border-box; }}
        button {{ width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; }}
        button:hover {{ background: #0056b3; }}
    </style>
</head>
<body>
    <h2>Authorize Application</h2>
    <div class="app-info">
        <strong>{client.client_name}</strong><br>
        <small>{client.description or 'External application'}</small>
    </div>
    
    <div id="error" class="error" style="display:none;"></div>
    
    <h3>Sign In</h3>
    <form id="loginForm">
        <input type="email" id="email" placeholder="Email" required><br>
        <input type="password" id="password" placeholder="Password" required><br>
        <button type="submit">Sign In and Authorize</button>
    </form>
    
    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {{
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('error');
            
            try {{
                // Login first
                const loginRes = await fetch('/api/v1/auth/login', {{
                    method: 'POST',
                    headers: {{ 'Content-Type': 'application/json' }},
                    body: JSON.stringify({{ email, password }})
                }});
                
                if (!loginRes.ok) {{
                    const err = await loginRes.json();
                    errorDiv.textContent = err.detail || 'Login failed';
                    errorDiv.style.display = 'block';
                    return;
                }}
                
                // Get the token and proceed with OAuth
                const tokenData = await loginRes.json();
                localStorage.setItem('access_token', tokenData.access_token);
                
                // Now authorize
                const params = new URLSearchParams({{
                    client_id: '{client_id}',
                    redirect_uri: '{redirect_uri}',
                    response_type: '{response_type}',
                    state: '{state or ""}'
                }});
                
                // Get authorization with token
                const authRes = await fetch(`/api/v1/oauth/authorize-token?${{params.toString()}}`, {{
                    headers: {{ 'Authorization': `Bearer ${{tokenData.access_token}}` }},
                    redirect: 'manual'
                }});
                
                if (authRes.status === 302 || authRes.status === 301) {{
                    // Follow redirect
                    const location = authRes.headers.get('Location');
                    if (location) {{
                        window.location.href = location;
                    }} else {{
                        errorDiv.textContent = 'No redirect location';
                        errorDiv.style.display = 'block';
                    }}
                }} else if (!authRes.ok) {{
                    const err = await authRes.json();
                    errorDiv.textContent = err.detail || 'Authorization failed';
                    errorDiv.style.display = 'block';
                }} else {{
                    errorDiv.textContent = 'Unexpected response';
                    errorDiv.style.display = 'block';
                }}
            }} catch (error) {{
                errorDiv.textContent = 'Error: ' + error.message;
                errorDiv.style.display = 'block';
            }}
        }});
    </script>
</body>
</html>
    """, status_code=200)

@router.get("/authorize-token")
async def authorize_token(
    client_id: str,
    redirect_uri: str,
    response_type: str = "code",
    scope: Optional[str] = None,
    state: Optional[str] = None,
    code_challenge: Optional[str] = None,
    code_challenge_method: Optional[str] = None,
    current_user: Optional[AppUser] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db)
):
    """OAuth2 authorization endpoint - completes the flow after login"""
    
    # Check if user is authenticated
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    # Get client
    result = await db.execute(
        select(OAuthClient).where(OAuthClient.client_id == client_id)
    )
    client = result.scalar_one_or_none()
    
    if not client or not client.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid client"
        )
    
    # Validate redirect URI
    if redirect_uri not in client.redirect_uris:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid redirect URI"
        )
    
    # Only support authorization code flow
    if response_type != "code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported response type"
        )
    
    # Generate authorization code
    auth_code = generate_authorization_code()
    expires_at = datetime.utcnow() + timedelta(minutes=10)  # 10 minute expiry
    
    # Store authorization code
    authorization_code = AuthorizationCode(
        code=auth_code,
        user_id=current_user.id,
        client_id=client.id,
        redirect_uri=redirect_uri,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        expires_at=expires_at,
        used=False
    )
    
    db.add(authorization_code)
    
    # Update client last used time
    client.last_used_at = datetime.utcnow()
    
    await db.commit()
    
    # Build redirect URL
    params = {
        "code": auth_code,
        "state": state
    }
    
    # Remove None values
    params = {k: v for k, v in params.items() if v is not None}
    
    redirect_url = f"{redirect_uri}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url=redirect_url)

@router.post("/token", response_model=OAuthTokenResponse)
async def token(
    grant_type: str = Form(...),
    code: Optional[str] = Form(None),
    redirect_uri: Optional[str] = Form(None),
    client_id: Optional[str] = Form(None),
    client_secret: Optional[str] = Form(None),
    code_verifier: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """OAuth2 token endpoint - exchange authorization code for access token"""
    
    if grant_type != "authorization_code":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported grant type"
        )
    
    # Get client
    result = await db.execute(
        select(OAuthClient).where(OAuthClient.client_id == client_id)
    )
    client = result.scalar_one_or_none()
    
    if not client or not client.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid client credentials"
        )
    
    # Verify client secret
    if not verify_client_secret(client_secret, client.client_secret_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid client credentials"
        )
    
    # Get and validate authorization code
    result = await db.execute(
        select(AuthorizationCode).where(
            AuthorizationCode.code == code,
            AuthorizationCode.client_id == client.id,
            AuthorizationCode.used == False
        )
    )
    auth_code = result.scalar_one_or_none()
    
    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired authorization code"
        )
    
    # Check expiry
    if auth_code.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Authorization code has expired"
        )
    
    # Validate redirect URI matches
    if auth_code.redirect_uri != redirect_uri:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid redirect URI"
        )
    
    # Verify PKCE if present
    if auth_code.code_challenge:
        if not code_verifier:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Code verifier required"
            )
        
        if auth_code.code_challenge_method == "plain":
            if code_verifier != auth_code.code_challenge:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid code verifier"
                )
        elif auth_code.code_challenge_method == "S256":
            import hashlib
            challenge = base64.urlsafe_b64encode(
                hashlib.sha256(code_verifier.encode()).digest()
            ).decode().rstrip('=')
            if challenge != auth_code.code_challenge:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid code verifier"
                )
    
    # Mark code as used
    auth_code.used = True
    await db.commit()
    
    # Get user
    result = await db.execute(
        select(AppUser).where(AppUser.id == auth_code.user_id)
    )
    user = result.scalar_one_or_none()
    
    # Generate access token (30 minutes expiry)
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": str(user.id), "is_guest": user.is_guest, "is_admin": user.is_admin},
        expires_delta=access_token_expires
    )
    
    return OAuthTokenResponse(
        access_token=access_token,
        token_type="Bearer",
        expires_in=1800  # 30 minutes in seconds
    )

