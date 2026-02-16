"""API router - combines core, conversations, credits, preferences, dev."""

from fastapi import APIRouter

from .conversations import router as conversations_router
from .core import router as core_router
from .credits import router as credits_router
from .dev import model_stats
from .dev import router as dev_router
from .preferences import router as preferences_router

router = APIRouter(tags=["API"])

router.include_router(core_router, tags=["API"])
router.include_router(conversations_router, tags=["API"])
router.include_router(credits_router, tags=["API"])
router.include_router(preferences_router, tags=["API"])
router.include_router(dev_router, tags=["API"])

__all__ = ["router", "model_stats"]
