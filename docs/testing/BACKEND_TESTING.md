# Backend Testing Guide

Comprehensive guide for testing the CompareIntel backend, covering setup, running tests, writing new tests, and best practices.

## Table of Contents

1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Setup and Prerequisites](#setup-and-prerequisites)
4. [Running Tests](#running-tests)
5. [Test Configuration](#test-configuration)
6. [Writing Tests](#writing-tests)
7. [Test Fixtures](#test-fixtures)
8. [Test Factories](#test-factories)
9. [Testing Major Features](#testing-major-features)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

## Overview

The backend test suite uses **pytest** with async support for FastAPI testing. Tests are organized into three categories:

- **Unit Tests**: Test individual functions and modules in isolation
- **Integration Tests**: Test API endpoints and database interactions
- **E2E Tests**: Test complete user workflows end-to-end

### Test Coverage Goals

- **Target**: 70%+ coverage for all backend code
- **Critical Paths**: Authentication, rate limiting, comparison endpoints, model runner, web search
- **Edge Cases**: Error handling, boundary conditions, invalid inputs, network failures

### Testing Framework Stack

- **pytest** 8.0+ - Test runner
- **pytest-asyncio** - Async test support
- **pytest-cov** - Coverage reporting
- **pytest-mock** - Mocking utilities
- **httpx** - FastAPI test client
- **pytest-timeout** - Test timeout management

## Test Structure

```
backend/tests/
├── __init__.py
├── conftest.py              # Shared fixtures and test configuration
├── factories.py             # Test data factories
├── unit/                    # Unit tests
│   ├── test_auth.py
│   ├── test_auth_edge_cases.py
│   ├── test_rate_limiting.py
│   ├── test_rate_limiting_edge_cases.py
│   ├── test_model_runner.py
│   ├── test_model_runner_edge_cases.py
│   ├── test_utils.py
│   └── test_search_providers.py      # Web search tests
├── integration/             # Integration tests
│   ├── test_api.py
│   ├── test_comparison.py
│   ├── test_comparison_edge_cases.py
│   ├── test_admin.py
│   ├── test_websearch.py              # Web search integration tests
│   └── test_file_upload.py            # File upload tests
└── e2e/                     # End-to-end tests
    └── test_workflows.py
```

## Setup and Prerequisites

### Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

Required testing packages (already in requirements.txt):
- `pytest>=8.0.0`
- `pytest-asyncio>=0.23.0`
- `pytest-cov>=5.0.0`
- `pytest-mock>=3.14.0`
- `httpx>=0.27.0` (for FastAPI testing)
- `pytest-timeout>=2.3.0`

### Environment Setup

Tests automatically configure required environment variables in `conftest.py`:
- `SECRET_KEY`: Test secret key (automatically set)
- `OPENROUTER_API_KEY`: Test API key (automatically set)
- `ENVIRONMENT`: Set to `development` for tests
- Email service is mocked (no email configuration needed)

**No additional setup required** - tests work out of the box!

## Running Tests

### Basic Commands

```bash
# Run all tests
pytest

# Run with coverage report
pytest --cov=app --cov-report=html

# Run specific test category
pytest tests/unit/          # Unit tests only
pytest tests/integration/   # Integration tests only
pytest tests/e2e/           # E2E tests only

# Run specific test file
pytest tests/unit/test_auth.py

# Run specific test
pytest tests/unit/test_auth.py::TestUserRegistration::test_register_new_user
```

### Output Control

```bash
# Quiet mode (minimal output)
pytest -q

# Very quiet (no progress dots)
pytest -qq

# One-line traceback
pytest --tb=line

# Recommended quiet command
pytest -q --tb=line --disable-warnings
```

### Advanced Options

```bash
# Stop on first failure
pytest -x

# Stop after N failures
pytest --maxfail=3

# Run with markers
pytest -m unit              # Only unit tests
pytest -m integration       # Only integration tests
pytest -m e2e               # Only E2E tests
pytest -m "not slow"        # Skip slow tests

# Run in parallel (if pytest-xdist installed)
pytest -n auto
```

### Coverage Reports

```bash
# Generate HTML coverage report
pytest --cov=app --cov-report=html
# Open htmlcov/index.html in browser

# Generate multiple report formats
pytest --cov=app --cov-report=html --cov-report=xml --cov-report=term-missing
```

## Test Configuration

Configuration is in `backend/pyproject.toml` under `[tool.pytest.ini_options]`:

```toml
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = "-v --strict-markers --tb=short --cov=app --cov-report=term-missing --cov-report=html --cov-report=xml"
asyncio_mode = "auto"
timeout = 300
```

**Key Settings:**
- Test paths: `tests/`
- Coverage: Enabled by default
- Async mode: Auto (handles async tests automatically)
- Timeout: 300 seconds per test
- Markers: `unit`, `integration`, `e2e`, `slow`

## Writing Tests

### Test File Structure

```python
"""
Test module description.
"""
import pytest
from fastapi.testclient import TestClient
from tests.factories import create_user, create_pro_user

# Mark test class with appropriate marker
@pytest.mark.unit
class TestMyFeature:
    """Test class description."""
    
    def test_basic_functionality(self, client, db_session):
        """Test basic functionality."""
        # Arrange
        user = create_user(db_session)
        
        # Act
        result = some_function(user)
        
        # Assert
        assert result == expected_value
    
    def test_edge_case(self, client, db_session):
        """Test edge case."""
        # Test implementation
        pass
```

### Unit Test Example

```python
import pytest
from app.utils import some_utility_function

@pytest.mark.unit
def test_utility_function():
    """Test utility function with various inputs."""
    # Arrange
    input_data = "test input"
    
    # Act
    result = some_utility_function(input_data)
    
    # Assert
    assert result is not None
    assert isinstance(result, str)
```

### Integration Test Example

```python
import pytest
from fastapi.testclient import TestClient

@pytest.mark.integration
def test_api_endpoint(authenticated_client):
    """Test API endpoint with authentication."""
    client, user, access_token, refresh_token = authenticated_client
    
    # Make authenticated request
    response = client.get(
        "/api/endpoint",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert response.status_code == 200
    assert response.json()["status"] == "success"
```

### Testing Async Functions

```python
import pytest

@pytest.mark.asyncio
@pytest.mark.unit
async def test_async_function():
    """Test async function."""
    result = await some_async_function()
    assert result is not None
```

### Testing with Mocks

```python
from unittest.mock import patch, AsyncMock
import pytest

@pytest.mark.unit
@patch('app.external_service.api_call')
def test_with_mock(mock_api_call):
    """Test with mocked external service."""
    # Arrange
    mock_api_call.return_value = {"status": "success"}
    
    # Act
    result = function_that_calls_api()
    
    # Assert
    assert result["status"] == "success"
    mock_api_call.assert_called_once()
```

## Test Fixtures

Fixtures are defined in `conftest.py` and available to all tests.

### Database Fixtures

**`db_session`**: Fresh database session for each test
- In-memory SQLite database
- Creates all tables before test
- Drops all tables after test
- Complete isolation between tests

```python
def test_example(db_session):
    user = User(email="test@example.com")
    db_session.add(user)
    db_session.commit()
    assert user.id is not None
```

### API Client Fixtures

**`client`**: Test client with database dependency override
```python
def test_example(client):
    response = client.get("/api/endpoint")
    assert response.status_code == 200
```

**`authenticated_client`**: Test client with authenticated free tier user
- Returns: `(client, user, access_token, refresh_token)`

```python
def test_authenticated_endpoint(authenticated_client):
    client, user, access_token, refresh_token = authenticated_client
    response = client.get(
        "/api/protected",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert response.status_code == 200
```

**Other authenticated client fixtures:**
- `authenticated_client_starter`: Starter tier user
- `authenticated_client_pro`: Pro tier user
- `authenticated_client_admin`: Admin user
- `authenticated_client_super_admin`: Super admin user

### User Fixtures

Available user fixtures for different subscription tiers:

```python
def test_with_user(test_user_free):      # Free tier
def test_with_user(test_user_starter):   # Starter tier
def test_with_user(test_user_pro):       # Pro tier
def test_with_user(test_user_admin):     # Admin role
def test_with_user(test_user_unverified): # Unverified user
def test_with_user(test_user_inactive):   # Inactive user
```

## Test Factories

Test factories are in `tests/factories.py` for creating test data.

### User Factories

```python
from tests.factories import (
    create_user,
    create_free_user,
    create_starter_user,
    create_pro_user,
    create_admin_user,
    create_unverified_user,
)

def test_example(db_session):
    # Create user with custom attributes
    user = create_user(
        db_session,
        email="custom@example.com",
        subscription_tier="pro"
    )
    
    # Or use tier-specific factories
    pro_user = create_pro_user(db_session)
    admin_user = create_admin_user(db_session)
```

### Other Factories

```python
from tests.factories import (
    create_conversation,
    create_conversation_message,
    create_usage_log,
    generate_compare_request,
    generate_model_response,
    create_app_settings,  # For web search configuration
)

def test_example(db_session):
    user = create_pro_user(db_session)
    conversation = create_conversation(db_session, user)
    message = create_conversation_message(db_session, conversation)
    
    # Generate mock request data
    request_data = generate_compare_request(
        models=["openai/gpt-4", "anthropic/claude-3.5-sonnet"]
    )
```

## Testing Major Features

### 1. Authentication Testing

**Location**: `tests/unit/test_auth.py`, `tests/unit/test_auth_edge_cases.py`

**Coverage**:
- User registration with email verification
- Login/logout flows
- Token refresh
- Password reset
- Email verification
- Token expiration and validation
- Password strength validation
- Edge cases (malformed tokens, expired tokens, etc.)

**Example**:
```python
@pytest.mark.unit
def test_user_registration(client, db_session):
    """Test user registration flow."""
    response = client.post(
        "/api/auth/register",
        json={
            "email": "test@example.com",
            "password": "SecurePassword123!",
            "full_name": "Test User"
        }
    )
    assert response.status_code == 201
    assert response.json()["email"] == "test@example.com"
```

### 2. Model Comparison Testing

**Location**: `tests/integration/test_comparison.py`, `tests/integration/test_comparison_edge_cases.py`

**Coverage**:
- Streaming comparison requests
- Multiple model selection
- Token estimation
- Rate limiting enforcement
- Credit deduction
- Conversation history integration
- Error handling (API failures, timeouts)
- Edge cases (empty input, invalid models, etc.)

**Example**:
```python
@pytest.mark.integration
def test_comparison_streaming(authenticated_client):
    """Test streaming comparison endpoint."""
    client, user, token, _ = authenticated_client
    
    response = client.post(
        "/api/compare-stream",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "input_data": "What is AI?",
            "models": ["openai/gpt-4", "anthropic/claude-3.5-sonnet"]
        },
        stream=True
    )
    assert response.status_code == 200
```

### 3. Web Search Testing

**Location**: `tests/unit/test_search_providers.py`, `tests/integration/test_websearch.py`

**Coverage**:
- Search provider initialization
- Search query execution
- Search result formatting
- Provider availability checking
- Search provider factory
- Web search integration with model comparison
- Tool calling for web search-enabled models
- Error handling (API failures, rate limits)
- URL fetching functionality

**Example**:
```python
@pytest.mark.unit
async def test_search_provider_search():
    """Test search provider search functionality."""
    from app.search.brave import BraveSearchProvider
    from unittest.mock import AsyncMock, patch
    
    provider = BraveSearchProvider("test_api_key")
    
    with patch('httpx.AsyncClient.get') as mock_get:
        mock_get.return_value = AsyncMock(
            status_code=200,
            json=AsyncMock(return_value={
                "web": {
                    "results": [
                        {
                            "title": "Test Result",
                            "url": "https://example.com",
                            "description": "Test description"
                        }
                    ]
                }
            })
        )
        
        results = await provider.search("test query")
        assert len(results) > 0
        assert results[0].title == "Test Result"
```

### 4. Rate Limiting Testing

**Location**: `tests/unit/test_rate_limiting.py`, `tests/unit/test_rate_limiting_edge_cases.py`

**Coverage**:
- Per-user rate limiting
- Anonymous rate limiting
- Tier-based limits
- Credit-based rate limiting
- Usage tracking
- Reset mechanisms
- Boundary conditions
- Concurrent access

**Example**:
```python
@pytest.mark.unit
def test_rate_limit_enforcement(db_session):
    """Test rate limit enforcement."""
    user = create_free_user(db_session)
    
    # Make requests up to limit
    for _ in range(3):  # Free tier limit
        assert check_user_credits(user.id, db_session) is True
        deduct_user_credits(user.id, 1, db_session)
    
    # Next request should fail
    assert check_user_credits(user.id, db_session) is False
```

### 5. Credit System Testing

**Location**: `tests/integration/test_api.py`

**Coverage**:
- Credit allocation (daily/monthly)
- Credit deduction
- Credit balance queries
- Credit reset mechanisms
- Overage handling
- Tier-based credit limits

**Example**:
```python
@pytest.mark.integration
def test_credit_deduction(authenticated_client, db_session):
    """Test credit deduction on comparison."""
    client, user, token, _ = authenticated_client
    
    initial_credits = get_user_credits(user.id, db_session)
    
    # Make comparison request
    response = client.post(
        "/api/compare-stream",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "input_data": "Test",
            "models": ["openai/gpt-4"]
        }
    )
    
    # Verify credits were deducted
    final_credits = get_user_credits(user.id, db_session)
    assert final_credits < initial_credits
```

### 6. File Upload Testing

**Location**: `tests/integration/test_file_upload.py`

**Coverage**:
- PDF file upload and parsing
- DOCX file upload and parsing
- File size validation
- File type validation
- Text extraction
- Error handling (invalid files, corrupted files)

**Example**:
```python
@pytest.mark.integration
def test_file_upload(authenticated_client):
    """Test file upload functionality."""
    client, user, token, _ = authenticated_client
    
    # Create test file
    test_file = io.BytesIO(b"Test file content")
    test_file.name = "test.txt"
    
    response = client.post(
        "/api/upload-file",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": test_file}
    )
    
    assert response.status_code == 200
    assert "extracted_text" in response.json()
```

### 7. Conversation History Testing

**Location**: `tests/integration/test_api.py`

**Coverage**:
- Creating conversations
- Retrieving conversation list
- Retrieving conversation details
- Deleting conversations
- Conversation message storage
- Per-model conversation tracking

**Example**:
```python
@pytest.mark.integration
def test_conversation_creation(authenticated_client, db_session):
    """Test conversation creation."""
    client, user, token, _ = authenticated_client
    
    response = client.post(
        "/api/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "title": "Test Conversation",
            "input_data": "Test prompt"
        }
    )
    
    assert response.status_code == 201
    assert response.json()["title"] == "Test Conversation"
```

### 8. Admin Functionality Testing

**Location**: `tests/integration/test_admin.py`

**Coverage**:
- User management (list, update, delete)
- Role management
- Mock mode toggling
- App settings management
- Admin action logging
- Statistics endpoints

**Example**:
```python
@pytest.mark.integration
def test_admin_user_list(authenticated_client_admin):
    """Test admin user listing."""
    client, admin, token, _ = authenticated_client_admin
    
    response = client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert "users" in response.json()
```

## Best Practices

### 1. Test Organization

- **One test file per module**: `test_auth.py` for `auth.py`
- **Group related tests**: Use test classes for related functionality
- **Descriptive names**: Test names should clearly describe what is tested
- **AAA Pattern**: Arrange, Act, Assert

### 2. Test Isolation

- Each test should be independent
- Use fixtures for setup/teardown
- Don't rely on test execution order
- Clean up after tests (fixtures handle this automatically)

### 3. Test Coverage

- Aim for 70%+ coverage
- Focus on critical paths first
- Test edge cases and error scenarios
- Don't test implementation details

### 4. Assertions

- Use specific assertions: `assert result == expected` not `assert result`
- Test both success and failure cases
- Verify error messages when appropriate
- Check side effects (database changes, etc.)

### 5. Mocking

- Mock external services (APIs, email, etc.)
- Mock slow operations
- Don't mock what you're testing
- Use factories for test data

### 6. Performance

- Keep tests fast (< 1 second per test)
- Use in-memory database (already configured)
- Avoid real API calls (use mocks)
- Mark slow tests with `@pytest.mark.slow`

### 7. Documentation

- Write docstrings for test classes
- Add comments for complex test logic
- Document test data requirements
- Explain why edge cases are tested

## Troubleshooting

### Tests Fail with Database Errors

**Problem**: Database-related errors in tests

**Solution**:
- Ensure `db_session` fixture is used
- Check that tables are created (fixture handles this)
- Verify no external database connection is attempted

### Tests Fail with Authentication Errors

**Problem**: Authentication-related test failures

**Solution**:
- Use `authenticated_client` fixture for authenticated endpoints
- Check token format: `f"Bearer {access_token}"`
- Verify user fixture has correct permissions

### Tests Timeout

**Problem**: Tests exceed 300-second timeout

**Solution**:
- Check for infinite loops
- Verify mocks are set up correctly
- Use `pytest-timeout` to debug: `pytest --timeout=10`
- Mark slow tests with `@pytest.mark.slow`

### Coverage Not Showing

**Problem**: Coverage report shows 0%

**Solution**:
- Ensure `--cov=app` flag is used
- Check that source files are in `app/` directory
- Verify `pytest-cov` is installed
- Check coverage excludes in `pyproject.toml`

### Async Test Errors

**Problem**: Async tests fail with errors

**Solution**:
- Use `@pytest.mark.asyncio` decorator
- Ensure `asyncio_mode = "auto"` in config
- Use `await` for async calls
- Check FastAPI test client usage

### Import Errors

**Problem**: Cannot import modules in tests

**Solution**:
- Ensure you're in `backend/` directory
- Check `PYTHONPATH` if needed
- Verify `__init__.py` files exist
- Check relative imports

### Fixture Not Found

**Problem**: `pytest` says fixture not found

**Solution**:
- Ensure fixture is defined in `conftest.py`
- Check fixture name spelling
- Verify fixture scope (function, class, module)
- Check that `conftest.py` is in correct location

## Additional Resources

- [pytest Documentation](https://docs.pytest.org/)
- [pytest-asyncio Documentation](https://pytest-asyncio.readthedocs.io/)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [pytest-cov Documentation](https://pytest-cov.readthedocs.io/)

---

**Last Updated**: January 2025  
**Test Framework**: pytest 8.0+  
**Coverage Tool**: pytest-cov  
**Target Coverage**: 70%+
