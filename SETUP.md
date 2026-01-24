# Gateway Debugger Setup Guide

## Prerequisites

- Kubernetes 1.28+
- Go 1.23+
- Node.js 18+
- Docker
- kubectl configured
- Envoy Gateway installed

## Local Development Setup

### 1. Initial Setup

```bash
cd gateway-debugger
make setup
```

This will:
- Download Go dependencies
- Install Node.js packages
- Create `.env` file
- Generate Dockerfiles

### 2. Configure Environment

Edit `.env` with your settings:

```bash
# For development
ENVIRONMENT=development
LOG_LEVEL=debug

# For Jaeger (optional)
JAEGER_ENDPOINT=http://localhost:14268/api/traces
JAEGER_ENABLED=true

# For Prometheus (optional)
PROMETHEUS_ENDPOINT=http://localhost:9090
```

### 3. Start Development Environment

```bash
make dev
```

This starts:
- Backend API on port 8080
- Frontend on port 3000
- Jaeger on port 16686 (optional)
- Prometheus on port 9090 (optional)

Access the dashboard: http://localhost:3000

## Production Deployment

### 1. Build Docker Images

```bash
make docker-build
```

### 2. Push to Registry

```bash
docker tag gateway-debugger-backend:latest myregistry/gateway-debugger-backend:v0.1.0
docker push myregistry/gateway-debugger-backend:v0.1.0

docker tag gateway-debugger-frontend:latest myregistry/gateway-debugger-frontend:v0.1.0
docker push myregistry/gateway-debugger-frontend:v0.1.0
```

### 3. Update Kubernetes Manifests

Edit `k8s/deployment.yaml` and update image references:

```yaml
image: myregistry/gateway-debugger-backend:v0.1.0
```

### 4. Deploy to Kubernetes

```bash
make deploy
```

This will:
- Create namespace
- Apply RBAC rules
- Create ConfigMaps
- Deploy services
- Start deployments

### 5. Access the Dashboard

```bash
kubectl port-forward -n gateway-debugger svc/gateway-debugger 3000:3000
open http://localhost:3000
```

## API Endpoints

### Health & Status

```bash
GET /health                    # Health check
GET /metrics                   # System metrics
GET /api/v1/stats             # System statistics
```

### Traces

```bash
GET  /api/v1/traces                  # List traces
GET  /api/v1/traces?limit=50&offset=0
GET  /api/v1/traces?statusCode=401
GET  /api/v1/traces/{id}             # Get trace detail
GET  /api/v1/traces/{id}/flow        # Get trace flow steps
POST /api/v1/traces/search           # Advanced search
```

### Metrics

```bash
GET /api/v1/metrics/latency          # Latency statistics
GET /api/v1/metrics/throughput       # Throughput statistics
GET /api/v1/metrics/errors           # Error statistics
```

### Logs

```bash
GET  /api/v1/logs                    # Get logs
GET  /api/v1/logs?limit=100&offset=0
GET  /api/v1/logs?component=jwt-filter
POST /api/v1/logs/search             # Search logs
POST /api/v1/logs/level/{component}  # Change log level
```

### Request Flow

```bash
GET /api/v1/requests/{id}            # Get request flow
GET /api/v1/requests/{id}/errors     # Get request errors
```

### WebSocket

```
WS  /api/v1/stream                   # Live data stream
```

## Testing

### Run All Tests

```bash
make test
```

### Run Backend Tests Only

```bash
make test-backend
```

### Run Frontend Tests Only

```bash
make test-frontend
```

### With Coverage

```bash
cd backend
go test -v -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Troubleshooting

### Backend won't start

```bash
# Check logs
make logs-backend

# Common issues:
# - Port 8080 already in use
# - Jaeger endpoint unreachable
# - Kubernetes API not accessible
```

### Frontend can't connect to backend

```bash
# Check API URL in .env
grep NEXT_PUBLIC_API_URL .env

# Or in browser console
fetch('http://localhost:8080/health').then(r => r.json())
```

### Kubernetes deployment failed

```bash
# Check namespace
kubectl get namespace gateway-debugger

# Check pods
kubectl get pods -n gateway-debugger

# Check logs
kubectl logs -n gateway-debugger deployment/gateway-debugger-backend

# Check services
kubectl get svc -n gateway-debugger
```

### Port-forward not working

```bash
# Kill existing port-forward
pkill -f "port-forward"

# Try again
kubectl port-forward -n gateway-debugger svc/gateway-debugger 3000:3000
```

## Monitoring

### Prometheus Queries

```promql
# Request latency (p95)
histogram_quantile(0.95, rate(request_duration_ms[5m]))

# Request rate
rate(requests_total[5m])

# Error rate
rate(requests_total{status=~"5.."}[5m])
```

### Jaeger Traces

Visit http://localhost:16686 to view distributed traces.

## Configuration Files

### Backend Configuration

File: `k8s/configmap.yaml` -> `config.yaml`

Key settings:
- `port`: API port
- `storage.max_entries`: Max traces to keep in memory
- `storage.retention_time`: How long to keep traces
- `jaeger.enabled`: Enable Jaeger integration
- `prometheus.enabled`: Enable Prometheus scraping

### Envoy Configuration

Two patches are needed:

1. **Access Logs** - In `k8s/configmap.yaml`
   - Enables JSON access logging
   - Logs to stdout

2. **Tracing** - In `k8s/configmap.yaml`
   - Sends traces to Jaeger
   - 100% sampling for MVP

Apply these patches to your EnvoyProxy resource:

```bash
# Edit envoy-gateway-system EnvoyProxy
kubectl edit envoyproxy -n envoy-gateway-system default
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

## Examples

See [examples/](examples/) directory for usage examples.

## Support

For issues or questions:
1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Review logs
3. Check API health: `curl http://localhost:8080/health`
