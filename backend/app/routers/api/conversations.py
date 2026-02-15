"""Conversation routes."""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...config import get_conversation_limit
from ...database import get_db
from ...dependencies import get_current_user
from ...models import Conversation, User
from ...models import ConversationMessage as ConversationMessageModel
from ...schemas import (
    BreakoutConversationCreate,
    ConversationDetail,
    ConversationSummary,
)

router = APIRouter(tags=["API - Conversations"])


@router.get("/conversations", response_model=list[ConversationSummary])
async def get_conversations(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Get list of user's conversations, limited by subscription tier."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    tier = current_user.subscription_tier or "free"
    display_limit = get_conversation_limit(tier)
    return_limit = display_limit

    conversations = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.created_at.desc())
        .limit(return_limit + 1)
        .all()
    )

    if len(conversations) > display_limit:
        conversations_to_delete = conversations[display_limit:]
        for conv_to_delete in conversations_to_delete:
            db.delete(conv_to_delete)
        db.commit()
        conversations = conversations[:display_limit]

    conversation_ids = [conv.id for conv in conversations]
    message_counts = {}
    if conversation_ids:
        count_results = (
            db.query(
                ConversationMessageModel.conversation_id,
                func.count(ConversationMessageModel.id).label("count"),
            )
            .filter(ConversationMessageModel.conversation_id.in_(conversation_ids))
            .group_by(ConversationMessageModel.conversation_id)
            .all()
        )
        message_counts = {conv_id: count for conv_id, count in count_results}

    summaries = []
    for conv in conversations:
        try:
            models_used = json.loads(conv.models_used) if conv.models_used else []
        except (json.JSONDecodeError, TypeError):
            models_used = []

        message_count = message_counts.get(conv.id, 0)
        summaries.append(
            ConversationSummary(
                id=conv.id,
                input_data=conv.input_data,
                models_used=models_used,
                conversation_type=conv.conversation_type or "comparison",
                parent_conversation_id=conv.parent_conversation_id,
                breakout_model_id=conv.breakout_model_id,
                created_at=conv.created_at,
                message_count=message_count,
            )
        )

    return summaries


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Get full conversation with all messages."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    try:
        models_used = json.loads(conversation.models_used) if conversation.models_used else []
    except (json.JSONDecodeError, TypeError):
        models_used = []

    messages = (
        db.query(ConversationMessageModel)
        .filter(ConversationMessageModel.conversation_id == conversation.id)
        .order_by(ConversationMessageModel.created_at.asc())
        .all()
    )

    already_broken_out_models: list[str] = []
    if conversation.conversation_type != "breakout":
        existing_breakouts = (
            db.query(Conversation)
            .filter(
                Conversation.parent_conversation_id == conversation.id,
                Conversation.conversation_type == "breakout",
                Conversation.user_id == current_user.id,
            )
            .all()
        )
        already_broken_out_models = [
            breakout.breakout_model_id
            for breakout in existing_breakouts
            if breakout.breakout_model_id is not None
        ]

    from ...schemas import ConversationMessage as ConversationMessageSchema

    message_schemas = [
        ConversationMessageSchema(
            id=msg.id,
            model_id=msg.model_id,
            role=msg.role,
            content=msg.content,
            input_tokens=msg.input_tokens,
            output_tokens=msg.output_tokens,
            success=msg.success,
            processing_time_ms=msg.processing_time_ms,
            created_at=msg.created_at,
        )
        for msg in messages
    ]

    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        input_data=conversation.input_data,
        models_used=models_used,
        conversation_type=conversation.conversation_type or "comparison",
        parent_conversation_id=conversation.parent_conversation_id,
        breakout_model_id=conversation.breakout_model_id,
        already_broken_out_models=already_broken_out_models,
        created_at=conversation.created_at,
        messages=message_schemas,
    )


@router.delete("/conversations/all", status_code=200)
async def delete_all_conversations(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Delete all conversations for the current user."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    deleted_count = db.query(Conversation).filter(Conversation.user_id == current_user.id).delete()
    db.commit()

    return {
        "message": f"Successfully deleted {deleted_count} conversation(s)",
        "deleted_count": deleted_count,
    }


@router.delete("/conversations/{conversation_id}", status_code=200)
async def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Delete a conversation and all its messages."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    db.delete(conversation)
    db.commit()

    return {"message": "Conversation deleted successfully"}


@router.post("/conversations/breakout", response_model=ConversationDetail)
async def create_breakout_conversation(
    breakout_data: BreakoutConversationCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """Create a breakout conversation from a multi-model comparison."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    parent_conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == breakout_data.parent_conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not parent_conversation:
        raise HTTPException(status_code=404, detail="Parent conversation not found")

    try:
        parent_models_used = (
            json.loads(parent_conversation.models_used)
            if parent_conversation.models_used
            else []
        )
    except (json.JSONDecodeError, TypeError):
        parent_models_used = []

    if breakout_data.model_id not in parent_models_used:
        raise HTTPException(
            status_code=400,
            detail=f"Model {breakout_data.model_id} was not part of the parent conversation",
        )

    parent_messages = (
        db.query(ConversationMessageModel)
        .filter(ConversationMessageModel.conversation_id == parent_conversation.id)
        .order_by(ConversationMessageModel.created_at.asc())
        .all()
    )

    breakout_conversation = Conversation(
        user_id=current_user.id,
        title=parent_conversation.title,
        input_data=parent_conversation.input_data,
        models_used=json.dumps([breakout_data.model_id]),
        conversation_type="breakout",
        parent_conversation_id=parent_conversation.id,
        breakout_model_id=breakout_data.model_id,
    )
    db.add(breakout_conversation)
    db.flush()

    for msg in parent_messages:
        if msg.role == "user" or (
            msg.role == "assistant" and msg.model_id == breakout_data.model_id
        ):
            new_message = ConversationMessageModel(
                conversation_id=breakout_conversation.id,
                model_id=msg.model_id,
                role=msg.role,
                content=msg.content,
                input_tokens=msg.input_tokens,
                output_tokens=msg.output_tokens,
                success=msg.success,
                processing_time_ms=msg.processing_time_ms,
                created_at=msg.created_at,
            )
            db.add(new_message)

    db.commit()
    db.refresh(breakout_conversation)

    new_messages = (
        db.query(ConversationMessageModel)
        .filter(ConversationMessageModel.conversation_id == breakout_conversation.id)
        .order_by(ConversationMessageModel.created_at.asc())
        .all()
    )

    from ...schemas import ConversationMessage as ConversationMessageSchema

    message_schemas = [
        ConversationMessageSchema(
            id=msg.id,
            model_id=msg.model_id,
            role=msg.role,
            content=msg.content,
            input_tokens=msg.input_tokens,
            output_tokens=msg.output_tokens,
            success=msg.success,
            processing_time_ms=msg.processing_time_ms,
            created_at=msg.created_at,
        )
        for msg in new_messages
    ]

    return ConversationDetail(
        id=breakout_conversation.id,
        title=breakout_conversation.title,
        input_data=breakout_conversation.input_data,
        models_used=[breakout_data.model_id],
        conversation_type="breakout",
        parent_conversation_id=breakout_conversation.parent_conversation_id,
        breakout_model_id=breakout_conversation.breakout_model_id,
        created_at=breakout_conversation.created_at,
        messages=message_schemas,
    )
