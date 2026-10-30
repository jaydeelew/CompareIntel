"""Unit tests for shareable comparison permalinks."""

from __future__ import annotations

import pytest
from fastapi import status

from app.models import SharedComparison
from app.schemas import ShareModelInfo
from app.services.share_snapshots import PUBLIC_OG_IMAGE, share_meta

pytestmark = pytest.mark.unit

PAYLOAD = {
    "prompt": "Explain gravity to a child",
    "models": [
        {"id": "openai/gpt-4o", "name": "GPT-4o"},
        {"id": "anthropic/claude-sonnet", "name": "Claude Sonnet"},
    ],
    "responses": [
        {
            "model_id": "openai/gpt-4o",
            "model_name": "GPT-4o",
            "content": "Gravity pulls things down.",
        },
        {
            "model_id": "anthropic/claude-sonnet",
            "model_name": "Claude Sonnet",
            "content": "Gravity is the force that keeps us on the ground.",
        },
    ],
}


def _create_share(client, payload=None):
    return client.post("/api/shares", json=payload or PAYLOAD)


class TestShareSnapshots:
    def test_create_share_returns_short_public_url(self, client):
        response = _create_share(client)
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "slug" in data
        assert len(data["slug"]) == 10
        assert data["url"].endswith(f"/c/{data['slug']}")
        assert data["revoke_token"]

    def test_create_is_allowed_for_anonymous_users(self, client):
        response = _create_share(client)
        assert response.status_code == status.HTTP_201_CREATED

    def test_public_json_omits_pii_and_owner_fields(self, client, authenticated_client):
        auth_client, user, _token, _refresh = authenticated_client
        response = _create_share(auth_client)
        slug = response.json()["slug"]

        public = client.get(f"/api/shares/{slug}")
        assert public.status_code == status.HTTP_200_OK
        body = public.json()
        assert body["slug"] == slug
        assert body["prompt"] == PAYLOAD["prompt"]
        assert body["models"] == PAYLOAD["models"]
        assert body["responses"] == PAYLOAD["responses"]
        assert "email" not in body
        assert user.email not in public.text
        assert "owner_user_id" not in body
        assert "revoke_token" not in body
        assert "revoke_token_hash" not in body
        assert "password" not in body

    def test_unknown_slug_returns_404(self, client):
        response = client.get("/api/shares/notreal123")
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_unshare_with_revoke_token_returns_404_afterward(self, client):
        created = _create_share(client).json()
        slug = created["slug"]
        unshare = client.post(
            f"/api/shares/{slug}/unshare", json={"revoke_token": created["revoke_token"]}
        )
        assert unshare.status_code == status.HTTP_204_NO_CONTENT
        assert client.get(f"/api/shares/{slug}").status_code == status.HTTP_404_NOT_FOUND
        assert client.get(f"/c/{slug}").status_code == status.HTTP_404_NOT_FOUND

    def test_unshare_without_token_is_forbidden(self, client):
        created = _create_share(client).json()
        response = client.post(f"/api/shares/{created['slug']}/unshare", json={})
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_owner_can_unshare_without_token(self, authenticated_client, client):
        auth_client, _user, _token, _refresh = authenticated_client
        created = _create_share(auth_client).json()
        unshare = auth_client.post(f"/api/shares/{created['slug']}/unshare", json={})
        assert unshare.status_code == status.HTTP_204_NO_CONTENT
        assert client.get(f"/api/shares/{created['slug']}").status_code == status.HTTP_404_NOT_FOUND

    def test_html_page_includes_og_twitter_and_noindex(self, client):
        created = _create_share(client).json()
        slug = created["slug"]
        page = client.get(f"/c/{slug}")
        assert page.status_code == status.HTTP_200_OK
        assert page.headers["content-type"].startswith("text/html")
        html = page.text
        assert "noindex" in html
        assert 'property="og:title"' in html
        assert 'property="og:description"' in html
        assert 'property="og:image"' in html
        assert PUBLIC_OG_IMAGE in html
        assert 'name="twitter:card"' in html
        assert "summary_large_image" in html
        assert "Explain gravity to a child" in html
        assert "GPT-4o" in html
        assert "Try your own comparison" in html
        assert 'href="/"' in html
        assert "test@example.com" not in html

    def test_html_404_for_unknown_slug(self, client):
        page = client.get("/c/zzzzzzzzzz")
        assert page.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in page.text.lower()

    def test_rejects_empty_prompt(self, client):
        payload = {**PAYLOAD, "prompt": ""}
        response = client.post("/api/shares", json=payload)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_ignores_extra_pii_fields_on_create(self, client, db_session):
        payload = {
            **PAYLOAD,
            "email": "leaked@example.com",
            "user_id": 99,
            "owner_user_id": 99,
        }
        created = client.post("/api/shares", json=payload)
        assert created.status_code == status.HTTP_201_CREATED
        slug = created.json()["slug"]
        row = db_session.query(SharedComparison).filter(SharedComparison.slug == slug).one()
        assert row.owner_user_id is None
        assert "leaked@example.com" not in row.snapshot_json
        public = client.get(f"/api/shares/{slug}")
        assert "leaked@example.com" not in public.text
        assert "user_id" not in public.json()

    def test_share_meta_uses_prompt_snippet(self):
        title, description = share_meta(
            "A" * 200,
            [ShareModelInfo(id="m1", name="Model One")],
        )
        assert title.startswith("CompareIntel comparison:")
        assert "…" in title
        assert "Model One" in description


def test_create_stores_no_account_columns_for_anonymous(client, db_session):
    created = _create_share(client).json()
    row = db_session.query(SharedComparison).filter(SharedComparison.slug == created["slug"]).one()
    assert row.owner_user_id is None
    assert row.is_public is True
    assert "email" not in row.snapshot_json
