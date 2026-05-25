# Backend Tests

This directory contains the comprehensive test suite for the CompareIntel backend.

**📚 For complete testing documentation, see: [Backend Testing Guide](../../docs/testing/BACKEND_TESTING.md)**

## Quick Start

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test category
pytest tests/unit/          # Unit tests
pytest tests/integration/   # Integration tests
pytest tests/e2e/           # E2E tests

# Run specific feature tests
pytest tests/unit/test_search_providers.py      # Web search unit tests
pytest tests/integration/test_websearch.py      # Web search integration tests
```

## Test Structure

- **Unit Tests** (`tests/unit/`): Test individual functions and modules
  - Authentication (`test_auth.py`, `test_auth_edge_cases.py`)
  - Rate limiting (`test_rate_limiting.py`, `test_rate_limiting_edge_cases.py`)
  - Model runner (`test_model_runner.py`, `test_model_runner_edge_cases.py`)
  - Search providers (`test_search_providers.py`) - Web search functionality
  - Utilities (`test_utils.py`)

- **Integration Tests** (`tests/integration/`): Test API endpoints and database interactions
  - API endpoints (`test_api.py`)
  - Comparison functionality (`test_comparison.py`, `test_comparison_edge_cases.py`)
  - Web search integration (`test_websearch.py`)
  - Admin functionality (`test_admin.py`)

- **E2E Tests** (`tests/e2e/`): Test complete user workflows
  - Workflows (`test_workflows.py`)

## Test Coverage

Current test coverage includes:
- ✅ Authentication and authorization
- ✅ Model comparison and streaming
- ✅ Rate limiting and credit system
- ✅ Web search functionality
- ✅ Attachment handling via compare payload (`attached_images` JSON — see Backend Testing Guide)
- ✅ Conversation history
- ✅ Admin functionality
- ✅ Edge cases and error handling

For detailed information on running tests, writing new tests, fixtures, and best practices, see the [Backend Testing Guide](../../docs/testing/BACKEND_TESTING.md).

