"""User preferences routes."""

import json

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from ...database import get_db
from ...dependencies import get_current_user
from ...models import User
from ...schemas import UserPreferencesResponse, UserPreferencesUpdate

router = APIRouter(tags=["API - Preferences"])


def _optional_json_dict(raw: str | None) -> dict | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def _preferences_to_response(preferences) -> UserPreferencesResponse:
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
        usage_alerts=preferences.usage_alerts if preferences.usage_alerts is not None else True,
        zipcode=preferences.zipcode,
        remember_state_on_logout=preferences.remember_state_on_logout
        if preferences.remember_state_on_logout is not None
        else False,
        hide_hero_utility_tiles=preferences.hide_hero_utility_tiles
        if preferences.hide_hero_utility_tiles is not None
        else False,
        remember_text_advanced_settings=preferences.remember_text_advanced_settings
        if preferences.remember_text_advanced_settings is not None
        else False,
        remember_image_advanced_settings=preferences.remember_image_advanced_settings
        if preferences.remember_image_advanced_settings is not None
        else False,
        text_composer_advanced=_optional_json_dict(preferences.text_composer_advanced),
        image_composer_advanced=_optional_json_dict(preferences.image_composer_advanced),
    )


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

    return _preferences_to_response(preferences)


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
    if validated_data.hide_hero_utility_tiles is not None:
        preferences.hide_hero_utility_tiles = validated_data.hide_hero_utility_tiles
    if validated_data.remember_text_advanced_settings is not None:
        preferences.remember_text_advanced_settings = validated_data.remember_text_advanced_settings
    if validated_data.remember_image_advanced_settings is not None:
        preferences.remember_image_advanced_settings = (
            validated_data.remember_image_advanced_settings
        )

    if "text_composer_advanced" in preferences_data:
        if preferences_data["text_composer_advanced"] is None:
            preferences.text_composer_advanced = None
        elif validated_data.text_composer_advanced is not None:
            preferences.text_composer_advanced = json.dumps(
                validated_data.text_composer_advanced.model_dump()
            )

    if "image_composer_advanced" in preferences_data:
        if preferences_data["image_composer_advanced"] is None:
            preferences.image_composer_advanced = None
        elif validated_data.image_composer_advanced is not None:
            preferences.image_composer_advanced = json.dumps(
                validated_data.image_composer_advanced.model_dump()
            )

    db.commit()
    db.refresh(preferences)

    return _preferences_to_response(preferences)
