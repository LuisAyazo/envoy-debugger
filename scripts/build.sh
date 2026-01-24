#!/bin/bash
# Build backend and frontend
set -e

echo "🔨 Building Gateway Debugger"
echo "============================="

# Build backend
echo "📦 Building backend..."
cd backend
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o ../bin/gateway-debugger-backend ./cmd/debugger
echo "✅ Backend built"

# Build frontend
echo "📦 Building frontend..."
cd ../frontend
npm run build
echo "✅ Frontend built"

cd ..

echo ""
echo "✅ Build complete!"
echo "   Backend binary: ./bin/gateway-debugger-backend"
echo "   Frontend: ./frontend/.next"
