# Support Email

CompareIntel uses `support@compareintel.com` as the primary support contact throughout the application.

## Where It Appears

### Email Templates
All automated emails (verification, password reset, subscription confirmation, usage warnings) include the support email in the footer.

### Frontend Footer
The Footer component displays the support email with a mailto link on every page.

### User Menu
Authenticated users see a "Contact Support" option in their user menu that opens an email client.

## Visibility

- **All users:** Footer is visible on every page without authentication
- **Registered users:** Additional access via User Menu dropdown
- **In emails:** All automated emails include support contact

## Zoho Configuration

Recommended email aliases (all forwarding to same inbox):
- `support@compareintel.com` (primary)
- `hello@compareintel.com`
- `contact@compareintel.com`
- `help@compareintel.com`

## Files

- Backend templates: `backend/app/email_service.py`
- Footer component: `frontend/src/components/Footer.tsx`
- User menu: `frontend/src/components/auth/UserMenu.tsx`
