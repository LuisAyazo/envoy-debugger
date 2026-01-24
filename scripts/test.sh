#!/bin/bash
# Run tests
set -e

echo "🧪 Running tests for Gateway Debugger"
echo "====================================="

# Backend tests
echo "🧪 Backend tests..."
cd backend
go test -v -race -coverprofile=coverage.out ./...
cd ..

# Frontend tests
echo "🧪 Frontend tests..."
cd frontend
npm run test -- --passWithNoTests
cd ..

echo ""
echo "✅ Tests complete!"
