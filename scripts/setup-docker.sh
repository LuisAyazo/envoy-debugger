#!/bin/bash
# Make scripts executable
chmod +x scripts/*.sh

echo "🔧 Backend Dockerfile"

cat > backend/Dockerfile << 'EOF'
# Build stage
FROM golang:1.23-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o debugger ./cmd/debugger

# Runtime stage
FROM alpine:3.18
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /build/debugger .
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:8080/health || exit 1
CMD ["./debugger"]
EOF

echo "🔧 Frontend Dockerfile"

cat > frontend/Dockerfile << 'EOF'
# Build stage
FROM node:18-alpine AS builder
WORKDIR /build
COPY package.json pnpm-lock.yaml ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /build/.next ./.next
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./package.json
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost:3000 || exit 1
CMD ["npm", "start"]
EOF

echo "🔧 docker-compose.yml"

cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - ENVIRONMENT=development
      - LOG_LEVEL=debug
      - STORAGE_MAX_ENTRIES=10000
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8080
    depends_on:
      - backend
    healthcheck:
      test: ["CMD", "wget", "-q", "-O-", "http://localhost:3000"]
      interval: 10s
      timeout: 5s
      retries: 3

  # Optional: Jaeger for tracing
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
      - "14268:14268"
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  # Optional: Prometheus for metrics
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
EOF

echo "✅ Dockerfiles and docker-compose created"
