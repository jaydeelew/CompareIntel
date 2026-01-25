# Test Coverage Improvements

This document describes the edge case and error scenario tests added to achieve 70%+ coverage.

## Backend Tests Added

### Authentication Edge Cases (`test_auth_edge_cases.py`)
- Token expiration and malformed tokens
- Password validation (empty, long, special characters)
- Password hashing edge cases
- Verification token handling
- Security checks (SQL injection, XSS attempts)

### Comparison Edge Cases (`test_comparison_edge_cases.py`)
- Input validation (empty, whitespace, long inputs)
- Model selection (no models, invalid IDs, too many)
- Tier validation and limit enforcement
- Rate limiting boundaries
- Error handling (API failures, partial failures)
- Streaming edge cases
- Anonymous user handling
- Conversation history validation

### Rate Limiting Edge Cases (`test_rate_limiting_edge_cases.py`)
- Boundary conditions (at/above/below limits)
- Reset scenarios (new day, same day)
- Usage increment edge cases
- Anonymous rate limits
- Extended tier limits
- Concurrent access scenarios

### Model Runner Edge Cases (`test_model_runner_edge_cases.py`)
- API error handling (timeouts, rate limits, auth errors)
- Invalid model handling
- Empty and long prompts
- Streaming error handling
- Response cleaning edge cases

## Frontend Tests Added

### useModelComparison Hook (`useModelComparison.edge-cases.test.ts`)
- Error handling and recovery
- Loading state transitions
- Input validation
- Response handling
- Abort controller edge cases

### Compare Service (`compareService.edge-cases.test.ts`)
- Network error handling
- API error responses (4xx, 5xx)
- Input validation
- Model selection validation
- Streaming error handling
- Concurrent request handling

## Running Tests

Backend:
```bash
cd backend
pytest --cov=app --cov-report=html
```

Frontend:
```bash
cd frontend
npm run test:coverage
```

## Coverage Goals

- Backend: 70%+ coverage
- Frontend: 70%+ coverage
- Focus areas: Error handling, boundary conditions, invalid inputs
