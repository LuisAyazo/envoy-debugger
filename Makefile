.PHONY: help setup dev build deploy test clean docker-build docker-up docker-down logs

help:
	@echo "Gateway Debugger - Development Commands"
	@echo "========================================"
	@echo ""
	@echo "Setup:"
	@echo "  make setup          - Initial setup (install dependencies)"
	@echo ""
	@echo "Development:"
	@echo "  make dev            - Start development environment (docker-compose)"
	@echo ""
	@echo "Build:"
	@echo "  make build          - Build backend and frontend"
	@echo "  make docker-build   - Build Docker images"
	@echo ""
	@echo "Deploy:"
	@echo "  make deploy         - Deploy to Kubernetes"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up      - Start with docker-compose"
	@echo "  make docker-down    - Stop docker-compose"
	@echo ""
	@echo "Testing:"
	@echo "  make test           - Run all tests"
	@echo "  make test-backend   - Run backend tests"
	@echo "  make test-frontend  - Run frontend tests"
	@echo ""
	@echo "Logs:"
	@echo "  make logs-backend   - View backend logs (K8s)"
	@echo "  make logs-frontend  - View frontend logs (K8s)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make clean-docker   - Remove Docker images"

setup:
	@bash scripts/setup.sh
	@bash scripts/setup-docker.sh

dev:
	@docker-compose up -d
	@echo "🚀 Services starting..."
	@echo "   Frontend: http://localhost:3000"
	@echo "   Backend API: http://localhost:8080"
	@echo "   Jaeger: http://localhost:16686"
	@echo "   Prometheus: http://localhost:9090"

build:
	@bash scripts/build.sh

docker-build:
	@echo "🐳 Building Docker images..."
	docker build -t gateway-debugger-backend:latest ./backend
	docker build -t gateway-debugger-frontend:latest ./frontend
	@echo "✅ Docker images built"

deploy:
	@bash scripts/deploy.sh

test: test-backend test-frontend

test-backend:
	@cd backend && go test -v -race -coverprofile=coverage.out ./...

test-frontend:
	@cd frontend && npm run test -- --passWithNoTests

logs-backend:
	@bash scripts/logs.sh backend

logs-frontend:
	@bash scripts/logs.sh frontend

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

clean:
	@rm -rf bin/
	@rm -rf backend/coverage.out
	@rm -rf frontend/.next
	@rm -rf frontend/node_modules
	@echo "✅ Cleaned build artifacts"

clean-docker:
	docker-compose down -v
	docker rmi gateway-debugger-backend:latest gateway-debugger-frontend:latest
	@echo "✅ Cleaned Docker artifacts"

fmt:
	@cd backend && gofmt -s -w .
	@cd frontend && npm run lint

lint:
	@cd backend && golangci-lint run ./...

.DEFAULT_GOAL := help
