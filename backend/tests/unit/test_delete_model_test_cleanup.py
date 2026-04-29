"""Tests for admin delete_model test reference cleanup."""

from __future__ import annotations

import textwrap
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

from app.routers.admin.delete_model_test_cleanup import strip_deleted_model_from_tests


def _layout_backend_tests(project: Path) -> Path:
    tests = project / "backend" / "tests" / "unit"
    tests.mkdir(parents=True)
    return tests


def test_strip_removes_test_that_only_references_deleted_model(tmp_path: Path) -> None:
    project_root = tmp_path / "repo"
    tests = _layout_backend_tests(project_root)
    mid = "openai/z-test-deleted-model"
    (tests / "sample_deleted.py").write_text(
        textwrap.dedent(
            f'''
            def test_keeps_other():
                assert "anthropic/claude-3.5-haiku"

            def test_only_deleted():
                x = "{mid}"
                assert x
            '''
        ).strip()
        + "\n",
        encoding="utf-8",
    )

    result = strip_deleted_model_from_tests(mid, project_root)
    body = (tests / "sample_deleted.py").read_text(encoding="utf-8")

    assert "test_only_deleted" not in body
    assert "test_keeps_other" in body
    assert any("sample_deleted.py" in f for f in result.modified_files)
    assert any("test_only_deleted" in x for x in result.removed_test_functions)


def test_strip_parametrize_entry_without_removing_whole_test(tmp_path: Path) -> None:
    project_root = tmp_path / "repo"
    tests = _layout_backend_tests(project_root)
    keep = "anthropic/claude-3.5-haiku"
    drop = "openai/z-param-drop-model"
    (tests / "sample_param.py").write_text(
        textwrap.dedent(
            f'''
            import pytest

            @pytest.mark.parametrize("m", ["{keep}", "{drop}"])
            def test_models(m):
                assert "/" in m
            '''
        ).strip()
        + "\n",
        encoding="utf-8",
    )

    strip_deleted_model_from_tests(drop, project_root)
    body = (tests / "sample_param.py").read_text(encoding="utf-8")

    assert drop not in body
    assert keep in body
    assert "test_models" in body


def test_frontend_test_triggers_manual_warning(tmp_path: Path) -> None:
    project_root = tmp_path / "repo"
    ft = project_root / "frontend" / "src"
    ft.mkdir(parents=True)
    mid = "openai/z-ts-model"
    (ft / "sample.test.ts").write_text(f'const x = "{mid}"\n', encoding="utf-8")

    result = strip_deleted_model_from_tests(mid, project_root)

    assert any("sample.test.ts" in w and "manually" in w for w in result.warnings)
