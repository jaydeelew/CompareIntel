"""User preferences routes."""

import json

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from ...database import get_db
from ...dependencies import get_current_user
from ...models import User
from ...schemas import UserPreferencesResponse, UserPreferencesUpdate

router = APIRouter(tags=["API - Preferences"])


@router.get("/user/preferences")
async def get_user_preferences(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Get user preferences/settings."""
    from ...models import UserPreference

    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    preferences = current_user.preferences
    if not preferences:
        preferences = UserPreference(
            user_id=current_user.id,
            theme="light",
            email_notifications=True,
            usage_alerts=True,
        )
        db.add(preferences)
        db.commit()
        db.refresh(preferences)

    preferred_models = None
    if preferences.preferred_models:
        try:
            preferred_models = json.loads(preferences.preferred_models)
        except (json.JSONDecodeError, TypeError):
            preferred_models = None

    return UserPreferencesResponse(
        preferred_models=preferred_models,
        theme=preferences.theme or "light",
        email_notifications=preferences.email_notifications
        if preferences.email_notifications is not None
        else True,
        usage_alerts=preferences.usage_alerts
        if preferences.usage_alerts is not None
        else True,
        zipcode=preferences.zipcode,
        remember_state_on_logout=preferences.remember_state_on_logout
        if preferences.remember_state_on_logout is not None
        else False,
    )


@router.put("/user/preferences")
async def update_user_preferences(
    preferences_data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Update user preferences/settings."""
    from ...models import UserPreference

    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        validated_data = UserPreferencesUpdate(**preferences_data)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    preferences = current_user.preferences
    if not preferences:
        preferences = UserPreference(
            user_id=current_user.id,
            theme="light",
            email_notifications=True,
            usage_alerts=True,
        )
        db.add(preferences)
        db.flush()

    if validated_data.theme is not None:
        preferences.theme = validated_data.theme
    if validated_data.email_notifications is not None:
        preferences.email_notifications = validated_data.email_notifications
    if validated_data.usage_alerts is not None:
        preferences.usage_alerts = validated_data.usage_alerts
    if validated_data.preferred_models is not None:
        preferences.preferred_models = json.dumps(validated_data.preferred_models)
    if "zipcode" in preferences_data:
        preferences.zipcode = validated_data.zipcode
    if validated_data.remember_state_on_logout is not None:
        preferences.remember_state_on_logout = validated_data.remember_state_on_logout

    db.commit()
    db.refresh(preferences)

    preferred_models = None
    if preferences.preferred_models:
        try:
            preferred_models = json.loads(preferences.preferred_models)
        except (json.JSONDecodeError, TypeError):
            preferred_models = None

    return UserPreferencesResponse(
        preferred_models=preferred_models,
        theme=preferences.theme or "light",
        email_notifications=preferences.email_notifications
        if preferences.email_notifications is not None
        else True,
        usage_alerts=preferences.usage_alerts
        if preferences.usage_alerts is not None
        else True,
        zipcode=preferences.zipcode,
        remember_state_on_logout=preferences.remember_state_on_logout
        if preferences.remember_state_on_logout is not None
        else False,
    )
