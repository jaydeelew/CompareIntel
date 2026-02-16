# Authentication & Authorization

## Overview

CompareIntel uses JWT for stateless authentication. Features include:
- User registration and email verification
- Password-based auth with bcrypt
- Token refresh
- Role-based access control
- Anonymous support via IP/fingerprint tracking

## JWT Tokens

**Access token:** 30 min, HS256, claims: `sub` (user id), `exp`, `type: "access"`  
**Refresh token:** 7 days, HS256, claims: `sub`, `exp`, `type: "refresh"`

## Flows

**Registration:** POST /api/auth/register → create user, send verification email → return tokens  
**Login:** POST /api/auth/login → verify password → return tokens  
**Refresh:** POST /api/auth/refresh (refresh_token) → return new access_token  
**Protected:** GET /api/auth/me with `Authorization: Bearer <token>`

## Cookie-Based Auth

Tokens are stored in **HTTP-only cookies** (not localStorage) for XSS protection.
- `access_token`, `refresh_token` cookies
- `HttpOnly`, `Secure` (production), `SameSite=lax`
- Backend reads cookies first, falls back to Authorization header
- Frontend uses `credentials: 'include'` on fetch

**Backend:** `utils/cookies.py` - set_auth_cookies(), clear_auth_cookies(), get_token_from_cookies()  
**Frontend:** AuthContext no longer manages tokens; fetch includes credentials automatically.

## Password Requirements

- Min 8 chars, one digit, one upper, one lower, one special: `!@#$%^&*()_+-=[]{};':"\\|,.<>/?`
- bcrypt with 12 rounds

## Roles

- **user:** Comparisons, own account
- **moderator:** + reports, content moderation
- **admin:** + user management, dashboard, subscription changes
- **super_admin:** + admin management, system settings, mock mode

## Anonymous Users

- Daily limit: 10 model responses, max 3 models per comparison
- Tracking: IP + browser fingerprint (user agent, screen, timezone, canvas/WebGL)

## Error Codes

| Status | Meaning |
|--------|---------|
| 401 | Invalid/expired token or wrong credentials |
| 403 | Insufficient permissions |
| 400 | Email exists, invalid token, token expired |
