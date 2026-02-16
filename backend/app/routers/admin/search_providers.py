"""
Admin search provider management endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ...database import get_db
from ...dependencies import require_admin_role
from ...models import AppSettings, User
from .helpers import log_admin_action

router = APIRouter()


class SetActiveSearchProviderRequest(BaseModel):
    provider: str


class TestSearchProviderRequest(BaseModel):
    provider: str
    query: str


@router.get("/search-providers")
async def get_search_providers(
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Get list of all available search providers and current active one."""
    import os

    from ...search.factory import SearchProviderFactory

    is_development = os.environ.get("ENVIRONMENT") == "development"

    app_settings = db.query(AppSettings).first()
    active_provider = app_settings.active_search_provider if app_settings else None

    available_providers = SearchProviderFactory.get_available_providers()

    providers = []
    for provider_name in ["brave", "tavily"]:
        is_configured = provider_name in available_providers
        is_active = provider_name == active_provider

        providers.append(
            {
                "name": provider_name,
                "display_name": provider_name.capitalize(),
                "is_configured": is_configured,
                "is_active": is_active,
            }
        )

    return {
        "providers": providers,
        "active_provider": active_provider,
        "is_development": is_development,
    }


@router.post("/search-providers/set-active")
async def set_active_search_provider(
    request: Request,
    req: SetActiveSearchProviderRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Set the active search provider."""
    from ...search.factory import SearchProviderFactory

    provider = req.provider

    if provider not in ["brave", "tavily"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider: {provider}. Supported providers: brave, tavily",
        )

    available_providers = SearchProviderFactory.get_available_providers()
    if provider not in available_providers:
        raise HTTPException(
            status_code=400,
            detail=f"API key not configured for provider: {provider}. Please add the API key to backend/.env file.",
        )

    app_settings = db.query(AppSettings).first()
    if not app_settings:
        app_settings = AppSettings()
        db.add(app_settings)

    app_settings.active_search_provider = provider
    db.commit()

    log_admin_action(
        db=db,
        admin_user=current_user,
        action_type="set_active_search_provider",
        action_description=f"Set active search provider to {provider}",
        target_user_id=None,
        details={"provider": provider},
        request=request,
    )

    return {
        "success": True,
        "active_provider": provider,
        "message": f"Active search provider set to {provider}",
    }


@router.get("/search-providers/test")
async def test_search_provider(
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Test the currently active search provider with a sample query."""
    from ...search.factory import SearchProviderFactory

    provider = SearchProviderFactory.get_active_provider(db)
    if not provider:
        raise HTTPException(status_code=400, detail="No active search provider configured")

    try:
        results = await provider.search("test query", max_results=3)
        return {
            "success": True,
            "provider": provider.get_provider_name(),
            "results_count": len(results),
            "results": [
                {
                    "title": r.title,
                    "url": r.url,
                    "snippet": r.snippet,
                    "source": r.source,
                }
                for r in results
            ],
        }
    except Exception as e:
        return {"success": False, "provider": provider.get_provider_name(), "error": str(e)}


@router.post("/search-providers/test-provider")
async def test_specific_search_provider(
    request: Request,
    req: TestSearchProviderRequest,
    current_user: User = Depends(require_admin_role("admin")),
    db: Session = Depends(get_db),
):
    """Test a specific search provider with a custom query."""
    from ...search.factory import SearchProviderFactory

    provider_name = req.provider
    query = req.query

    if provider_name not in ["brave", "tavily"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider: {provider_name}. Supported providers: brave, tavily",
        )

    provider = SearchProviderFactory.get_provider(provider_name, db)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail=f"Provider {provider_name} is not available (API key not configured)",
        )

    try:
        results = await provider.search(query, max_results=5)
        return {
            "success": True,
            "provider": provider_name,
            "query": query,
            "results_count": len(results),
            "results": [
                {
                    "title": r.title,
                    "url": r.url,
                    "snippet": r.snippet,
                    "source": r.source,
                }
                for r in results
            ],
        }
    except Exception as e:
        return {"success": False, "provider": provider_name, "query": query, "error": str(e)}
