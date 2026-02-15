"""
Admin management endpoints for CompareIntel.
"""

from fastapi import APIRouter

from .analytics import router as analytics_router
from .models_management import router as models_router
from .search_providers import router as search_router
from .settings import router as settings_router
from .users import router as users_router

router = APIRouter(prefix="/admin", tags=["admin"])

router.include_router(analytics_router)
router.include_router(users_router)
router.include_router(settings_router)
router.include_router(models_router)
router.include_router(search_router)
