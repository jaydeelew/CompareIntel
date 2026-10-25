# Security Fixes - February 2026 ZAP Scan Issues

## Summary

This document addresses two security concerns identified from February 2026 ZAP scans:

1. ✅ **FIXED**: Admin password reset accepting passwords via query string
2. ✅ **RESOLVED**: ZAP workflow GitHub issue spam

---

## Issue 1: Admin Password Reset Query String Vulnerability

### Problem
The `/api/admin/users/{id}/reset-password` endpoint accepted the `new_password` parameter from both:
- Request body (secure) ✅
- Query string (insecure) ❌

This meant passwords could be passed via GET-style URLs like:
```
POST /api/admin/users/123/reset-password?new_password=secret123
```

**Security risks:**
- Passwords visible in URLs
- Passwords logged in access logs
- Passwords stored in browser history
- Passwords cached by proxies

### Fix Applied
Created `AdminPasswordReset` schema to enforce request body only:

```python
class AdminPasswordReset(BaseModel):
    """Schema for admin password reset request (must be in request body)."""
    new_password: str = Field(..., min_length=8)
```

Updated endpoint to use schema:
```python
async def reset_user_password(
    user_id: int,
    password_data: AdminPasswordReset,  # Forces body-only
    request: Request,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
```

### Tests Added
- ✅ `test_reset_user_password_via_body` - Verifies body method works
- ✅ `test_reset_user_password_rejects_query_param` - Verifies query param is rejected (422 error)
- ✅ `test_reset_user_password_validates_strength` - Verifies password validation

### Verification
The password is now **only** accepted in the request body. Any attempt to pass it via query string will result in a 422 validation error.

Both `/api/admin/users/{id}/reset-password` and `/api/v1/admin/users/{id}/reset-password` are fixed.

---

## Issue 2: ZAP Workflow GitHub Issue Spam

### Problem Statement
14 open GitHub issues titled "ZAP Scan Baseline Report" or "ZAP API Scan Report" were created in early February 2026 from automated ZAP scans against localhost.

### Current Status: Already Resolved ✅

The DAST workflow (`.github/workflows/dast.yml`) was **deleted on February 15, 2026** as part of commit `37cbe3a7` (CI/CD consolidation).

### Investigation Findings

1. **Workflow History:**
   - Created and maintained in early Feb 2026
   - Last updated Feb 8, 2026 (upgraded ZAP action to v0.15.0)
   - Deleted Feb 15, 2026 in CI/CD consolidation

2. **Issue Creation Analysis:**
   - Examined all versions of the workflow from its history
   - **None of the versions had GitHub issue creation enabled**
   - The ZAP actions used (`zaproxy/action-api-scan@v0.9.0` and `zaproxy/action-baseline@v0.15.0`) only uploaded artifacts
   - No `issue_title` parameter was configured

3. **Current State:**
   - No DAST workflow exists in the repository
   - No automated ZAP scans are running
   - No new issues will be created

### Recommendation

If you want to restore ZAP scanning **without** GitHub issue creation:

1. **Keep scans results-only** (current deleted version was already configured this way):
   - Use `fail_action: false` to not block CI on findings
   - Upload artifacts for manual review
   - Do NOT add `issue_title` parameter

2. **Example safe configuration:**
```yaml
- name: Run OWASP ZAP baseline scan
  uses: zaproxy/action-baseline@v0.15.0
  with:
    target: 'http://localhost:5173'
    rules_file_name: '.github/zap-rules.tsv'
    fail_action: false  # Don't block CI
    artifact_name: 'zap-baseline-scan'
    # NO issue_title parameter = no GitHub issues
```

3. **Alternative: Use the security-scan job in ci.yml**
   - Already includes dependency vulnerability scanning
   - Consider adding ZAP there if needed

---

## Conclusion

- ✅ **Password reset vulnerability**: Fixed via schema validation
- ✅ **ZAP issue spam**: Already resolved (workflow deleted Feb 15)

The repository is now secure against both issues. The ZAP workflow will not create any more GitHub issues because it no longer exists.
