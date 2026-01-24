#!/bin/bash
# Gateway Debugger - Setup script
set -e

echo "🚀 Gateway Debugger Setup"
echo "========================"

# Check prerequisites
echo "📋 Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed."; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required but not installed."; exit 1; }
command -v go >/dev/null 2>&1 || { echo "Go is required but not installed."; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed."; exit 1; }

echo "✅ All prerequisites met"

# Create .env if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Update .env with your values"
fi

# Backend setup
echo ""
echo "🔨 Building backend..."
cd backend
go mod download
go mod tidy
cd ..

# Frontend setup
echo ""
echo "🔨 Setting up frontend..."
cd frontend
npm install
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "📖 Next steps:"
echo "   1. Update .env with your configuration"
echo "   2. Run 'make dev' to start local development"
echo "   3. Or run './scripts/deploy.sh' to deploy to Kubernetes"
