#!/bin/bash
# Pre-push CI checks - Run this before opening a PR to catch issues early
# Usage: ./check-ci.sh

set -e  # Exit on first error

echo "🔍 Running pre-push CI checks..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

# Backend checks
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐍 Backend checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd backend

if [ ! -d "venv" ]; then
  echo -e "${YELLOW}⚠️  Backend venv not found. Run: python3 -m venv venv && source venv/bin/activate && pip install -r requirements-dev.txt${NC}"
  FAILED=1
else
  source venv/bin/activate || { echo -e "${RED}❌ Failed to activate venv${NC}"; FAILED=1; }
  
  echo "Running ruff check..."
  if ruff check .; then
    echo -e "${GREEN}✓ Ruff check passed${NC}"
  else
    echo -e "${RED}❌ Ruff check failed${NC}"
    FAILED=1
  fi
  
  echo ""
  echo "Running ruff format check..."
  if ruff format --check .; then
    echo -e "${GREEN}✓ Ruff format check passed${NC}"
  else
    echo -e "${RED}❌ Ruff format check failed${NC}"
    FAILED=1
  fi
  
  echo ""
  echo "Running mypy type check..."
  if mypy app --ignore-missing-imports; then
    echo -e "${GREEN}✓ Mypy type check passed${NC}"
  else
    echo -e "${RED}❌ Mypy type check failed${NC}"
    FAILED=1
  fi
  
  echo ""
  echo "Running backend tests..."
  if pytest tests/unit/ -v; then
    echo -e "${GREEN}✓ Backend unit tests passed${NC}"
  else
    echo -e "${RED}❌ Backend unit tests failed${NC}"
    FAILED=1
  fi
fi

cd ..

# Frontend checks
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚛️  Frontend checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd frontend

if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}⚠️  Frontend node_modules not found. Run: npm ci${NC}"
  FAILED=1
else
  echo "Running ESLint..."
  if npm run lint; then
    echo -e "${GREEN}✓ ESLint passed${NC}"
  else
    echo -e "${RED}❌ ESLint failed${NC}"
    FAILED=1
  fi
  
  echo ""
  echo "Running TypeScript type check..."
  if npm run type-check; then
    echo -e "${GREEN}✓ TypeScript type check passed${NC}"
  else
    echo -e "${RED}❌ TypeScript type check failed${NC}"
    FAILED=1
  fi
  
  echo ""
  echo "Running frontend build..."
  if npm run build; then
    echo -e "${GREEN}✓ Frontend build passed${NC}"
  else
    echo -e "${RED}❌ Frontend build failed${NC}"
    FAILED=1
  fi
  
  echo ""
  echo "Running frontend tests..."
  if npm run test:run; then
    echo -e "${GREEN}✓ Frontend tests passed${NC}"
  else
    echo -e "${RED}❌ Frontend tests failed${NC}"
    FAILED=1
  fi
fi

cd ..

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed! Ready to push.${NC}"
  exit 0
else
  echo -e "${RED}❌ Some checks failed. Please fix the issues before pushing.${NC}"
  exit 1
fi
