"""
Authentication utilities for CompareIntel.

This module provides password hashing, JWT token generation/validation,
and token generation for email verification and password resets.
"""

from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, UTC
from typing import Optional, Tuple, Dict, Any
import os
import secrets
import bcrypt

# Password hashing configuration
# Using bcrypt with explicit rounds to avoid issues
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12, bcrypt__ident="2b")

# Import configuration
from .config import settings

# JWT settings
SECRET_KEY = settings.secret_key
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against its hashed version.

    Args:
        plain_password: The plain text password
        hashed_password: The hashed password from database

    Returns:
        bool: True if password matches, False otherwise
    """
    try:
        password_bytes = plain_password.encode("utf-8")
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(password_bytes, hashed_bytes)
    except Exception:
        # Fallback to passlib for backwards compatibility with old hashes
        return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    Hash a password using bcrypt directly.

    Args:
        password: Plain text password

    Returns:
        str: Hashed password
    """
    try:
        # Use bcrypt directly instead of passlib
        password_bytes = password.encode("utf-8")
        salt = bcrypt.gensalt(rounds=12)
        hashed = bcrypt.hashpw(password_bytes, salt)
        return hashed.decode("utf-8")
    except Exception as e:
        raise


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.

    Args:
        data: Dictionary of claims to encode in the token
        expires_delta: Optional custom expiration time

    Returns:
        str: Encoded JWT token
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: Dict[str, Any]) -> str:
    """
    Create a JWT refresh token with longer expiration.

    Args:
        data: Dictionary of claims to encode in the token

    Returns:
        str: Encoded JWT refresh token
    """
    to_encode = data.copy()
    expire = datetime.now(UTC) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str, token_type: str = "access") -> Optional[Dict[str, Any]]:
    """
    Verify and decode a JWT token.

    Args:
        token: The JWT token to verify
        token_type: Expected token type ('access' or 'refresh')

    Returns:
        dict: Decoded token payload if valid, None otherwise
    """
    if not token or not isinstance(token, str):
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Verify token type - tokens must have a type field and it must match
        token_type_in_payload = payload.get("type")
        if token_type_in_payload is None or token_type_in_payload != token_type:
            return None

        return payload
    except JWTError:
        # JWT-specific errors (expired, invalid signature, etc.)
        return None
    except (ValueError, TypeError):
        # Malformed token format errors
        return None
    except Exception:
        # Catch any other unexpected errors to prevent 500s
        # Log in development but return None in production
        return None


def generate_verification_token() -> str:
    """
    Generate a random secure token for password reset.

    Returns:
        str: URL-safe random token
    """
    return secrets.token_urlsafe(32)


def generate_verification_code() -> str:
    """
    Generate a 6-digit numeric verification code for email verification.
    
    Uses cryptographically secure random number generation.

    Returns:
        str: 6-digit numeric code (e.g., "123456")
    """
    # Generate a random 6-digit code (100000 to 999999)
    code = secrets.randbelow(900000) + 100000
    return str(code)


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    Validate password meets strength requirements.

    Args:
        password: Password to validate

    Returns:
        tuple: (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"

    if not any(char.isdigit() for char in password):
        return False, "Password must contain at least one digit"

    if not any(char.isupper() for char in password):
        return False, "Password must contain at least one uppercase letter"

    if not any(char.islower() for char in password):
        return False, "Password must contain at least one lowercase letter"

    # Check for special character
    special_chars = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?"
    if not any(char in special_chars for char in password):
        return False, "Password must contain at least one special character (!@#$%^&*()_+-=[]{};':\"\\|,.<>/?)"

    return True, ""
