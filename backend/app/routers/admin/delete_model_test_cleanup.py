"""Remove references to a deleted model ID from test sources (admin delete_model hook).

Python (backend/tests): removes ``test_*`` functions whose only provider/model string literals
are the deleted id; strips ``pytest.mark.parametrize`` entries (regex for one-line decorators,
line deletes when each value is on its own line); removes standalone quoted list lines.

TypeScript (frontend): files under ``*.test.ts``, ``*.test.tsx``, ``*.spec.ts`` are only
scanned; if the id remains quoted, a warning is recorded for manual edits (no safe rewriter).

Failures are never raised; check ``TestCleanupResult.warnings``.
"""

from __future__ import annotations

import ast
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path  # noqa: TC003

logger = logging.getLogger(__name__)

_MODEL_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]*/[a-z0-9][a-z0-9_.-]*$", re.I)

_MAX_PY_CLEANUP_ITERS = 24


@dataclass
class TestCleanupResult:
    modified_files: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    removed_test_functions: list[str] = field(default_factory=list)


def _looks_like_model_id(value: str) -> bool:
    return bool(_MODEL_ID_RE.match(value))


def _model_literal_strings(node: ast.AST) -> set[str]:
    found: set[str] = set()
    for n in ast.walk(node):
        if (
            isinstance(n, ast.Constant)
            and isinstance(n.value, str)
            and _looks_like_model_id(n.value)
        ):
            found.add(n.value)
    return found


def _literals_in_test_function(func: ast.AsyncFunctionDef | ast.FunctionDef) -> set[str]:
    found = _model_literal_strings(func)
    for dec in func.decorator_list:
        found |= _model_literal_strings(dec)
    return found


def _stmt_span(stmt: ast.AsyncFunctionDef | ast.FunctionDef) -> tuple[int, int]:
    start = stmt.lineno
    if stmt.decorator_list:
        start = min(start, min(d.lineno for d in stmt.decorator_list))
    end = stmt.end_lineno or stmt.lineno
    return start, end


def _is_test_function(name: str) -> bool:
    return name.startswith("test")


def _iter_test_functions(
    class_node: ast.ClassDef, prefix: str
) -> list[tuple[ast.AsyncFunctionDef | ast.FunctionDef, str]]:
    out: list[tuple[ast.AsyncFunctionDef | ast.FunctionDef, str]] = []
    qual = f"{prefix}{class_node.name}."
    for item in class_node.body:
        if isinstance(item, (ast.AsyncFunctionDef, ast.FunctionDef)) and _is_test_function(
            item.name
        ):
            out.append((item, qual))
        elif isinstance(item, ast.ClassDef) and item.name.startswith("Test"):
            out.extend(_iter_test_functions(item, qual))
    return out


def _collect_module_test_functions(
    tree: ast.Module,
) -> list[tuple[ast.AsyncFunctionDef | ast.FunctionDef, str]]:
    funcs: list[tuple[ast.AsyncFunctionDef | ast.FunctionDef, str]] = []
    for node in tree.body:
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and _is_test_function(
            node.name
        ):
            funcs.append((node, ""))
        elif isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            funcs.extend(_iter_test_functions(node, ""))
    return funcs


def _as_parametrize_call(dec: ast.expr) -> ast.Call | None:
    if not isinstance(dec, ast.Call):
        return None
    fn = dec.func
    if isinstance(fn, ast.Attribute) and fn.attr == "parametrize":
        return dec
    return None


def _parametrize_value_ranges_to_strip(
    func: ast.AsyncFunctionDef | ast.FunctionDef, model_id: str
) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    for dec in func.decorator_list:
        call = _as_parametrize_call(dec)
        if call is None or len(call.args) < 2:
            continue
        arg_vals = call.args[1]
        if isinstance(arg_vals, ast.List):
            seq = arg_vals.elts
        elif isinstance(arg_vals, ast.Tuple):
            seq = arg_vals.elts
        else:
            continue
        crowded_lines: set[int] = set()
        line_counts: dict[int, int] = {}
        for elt in seq:
            ln = getattr(elt, "lineno", None)
            if ln is not None:
                line_counts[ln] = line_counts.get(ln, 0) + 1
        crowded_lines = {ln for ln, c in line_counts.items() if c > 1}

        for elt in seq:
            ln = getattr(elt, "lineno", None)
            if ln is not None and ln in crowded_lines:
                continue
            if isinstance(elt, ast.Constant) and elt.value == model_id:
                if elt.lineno and elt.end_lineno:
                    ranges.append((elt.lineno, elt.end_lineno))
            elif isinstance(elt, ast.Tuple) and elt.elts:
                first = elt.elts[0]
                if isinstance(first, ast.Constant) and first.value == model_id:
                    ln = getattr(elt, "lineno", None)
                    if ln is not None and ln in crowded_lines:
                        continue
                    if elt.lineno and elt.end_lineno:
                        ranges.append((elt.lineno, elt.end_lineno))
    return ranges


def _merge_line_ranges(ranges: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if not ranges:
        return []
    ranges = sorted(ranges)
    merged: list[list[int]] = [list(ranges[0])]
    for start, end in ranges[1:]:
        if start <= merged[-1][1] + 1:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(int(a[0]), int(a[1])) for a in merged]


def _apply_line_range_deletions(text: str, ranges: list[tuple[int, int]]) -> str:
    if not ranges:
        return text
    lines = text.splitlines(keepends=True)
    for start, end in sorted(_merge_line_ranges(ranges), reverse=True):
        del lines[start - 1 : end]
    return "".join(lines)


def _standalone_quote_line_patterns(model_id: str) -> tuple[re.Pattern[str], ...]:
    esc = re.escape(model_id)
    return (
        re.compile(rf"^\s*[{chr(34)}{chr(39)}]{esc}[{chr(34)}{chr(39)}],\s*$"),
        re.compile(rf"^\s*\[{chr(34)}{chr(39)}]{esc}[{chr(34)}{chr(39)}],\s*$"),
        re.compile(rf"^\s*\[{chr(34)}{chr(39)}]{esc}[{chr(34)}{chr(39)}]\s*$"),
    )


def _strip_standalone_quoted_lines(text: str, model_id: str) -> str:
    patterns = _standalone_quote_line_patterns(model_id)
    out_lines: list[str] = []
    for line in text.splitlines(keepends=True):
        if any(p.match(line) for p in patterns):
            continue
        out_lines.append(line)
    return "".join(out_lines)


def _strip_model_id_from_single_line_parametrize(text: str, model_id: str) -> str:
    """Remove ``model_id`` from @pytest.mark.parametrize(...) lines where several literals share one line."""
    esc = re.escape(model_id)
    lines_out: list[str] = []
    for line in text.splitlines(keepends=True):
        if "parametrize" not in line:
            lines_out.append(line)
            continue
        if f'"{model_id}"' not in line and f"'{model_id}'" not in line:
            lines_out.append(line)
            continue
        nl = line
        nl = re.sub(rf',\s*"{esc}"', "", nl)
        nl = re.sub(rf",\s*'{esc}'", "", nl)
        nl = re.sub(rf'"{esc}",\s*', "", nl)
        nl = re.sub(rf"'{esc}',\s*", "", nl)
        nl = re.sub(rf'\[\s*"{esc}"\s*\]', "[]", nl)
        nl = re.sub(rf"\[\s*'{esc}'\s*\]", "[]", nl)
        lines_out.append(nl)
    return "".join(lines_out)


def _cleanup_python_source_iteration(
    text: str, model_id: str, rel_path: str, result: TestCleanupResult
) -> str:
    try:
        tree = ast.parse(text)
    except SyntaxError as e:
        result.warnings.append(f"{rel_path}: skip cleanup (syntax error: {e.lineno}: {e.msg})")
        return text

    delete_ranges: list[tuple[int, int]] = []

    for func, qual in _collect_module_test_functions(tree):
        literals = _literals_in_test_function(func)
        if model_id not in literals:
            continue
        if literals == {model_id}:
            delete_ranges.append(_stmt_span(func))
            label = f"{rel_path}::{qual}{func.name}"
            result.removed_test_functions.append(label)
            continue
        delete_ranges.extend(_parametrize_value_ranges_to_strip(func, model_id))

    text2 = _apply_line_range_deletions(text, delete_ranges)
    text3 = _strip_model_id_from_single_line_parametrize(text2, model_id)
    text4 = _strip_standalone_quoted_lines(text3, model_id)
    return text4


def _quoted_model_id_still_present(text: str, model_id: str) -> bool:
    return f'"{model_id}"' in text or f"'{model_id}'" in text


def _cleanup_backend_tests_file(
    path: Path, model_id: str, project_root: Path, result: TestCleanupResult
) -> bool:
    original = path.read_text(encoding="utf-8")
    rel = str(path.relative_to(project_root))
    text = original
    for _ in range(_MAX_PY_CLEANUP_ITERS):
        nxt = _cleanup_python_source_iteration(text, model_id, rel, result)
        if nxt == text:
            break
        text = nxt

    if text != original:
        path.write_text(text, encoding="utf-8")
        result.modified_files.append(rel)
        logger.info("Updated tests after model delete: %s", rel)

    if _quoted_model_id_still_present(text, model_id):
        result.warnings.append(
            f"{rel} still contains quoted {model_id!r}; edit manually if tests should stay green."
        )
    return text != original


def _frontend_test_globs(project_root: Path) -> list[Path]:
    frontend = project_root / "frontend"
    if not frontend.is_dir():
        return []
    paths: list[Path] = []
    for pattern in ("*.test.ts", "*.test.tsx", "*.spec.ts"):
        paths.extend(frontend.rglob(pattern))
    return paths


def strip_deleted_model_from_tests(model_id: str, project_root: Path) -> TestCleanupResult:
    """Best-effort test updates; never raises. Inspect ``warnings`` for manual follow-up."""
    result = TestCleanupResult()
    tests_root = project_root / "backend" / "tests"
    if tests_root.is_dir():
        try:
            for path in sorted(tests_root.rglob("*.py")):
                if "__pycache__" in path.parts:
                    continue
                try:
                    _cleanup_backend_tests_file(path, model_id, project_root, result)
                except OSError as e:
                    msg = f"{path.relative_to(project_root)}: {e}"
                    logger.warning(msg)
                    result.warnings.append(msg)
        except Exception as e:
            logger.exception("test cleanup failed")
            result.warnings.append(f"test cleanup error: {e}")
    else:
        result.warnings.append("backend/tests not found; skipped Python test cleanup")

    for path in _frontend_test_globs(project_root):
        try:
            body = path.read_text(encoding="utf-8")
        except OSError as e:
            result.warnings.append(f"{path.relative_to(project_root)}: read failed ({e})")
            continue
        if _quoted_model_id_still_present(body, model_id):
            result.warnings.append(
                f"{path.relative_to(project_root)} still references {model_id!r}; update TS tests manually."
            )

    return result
