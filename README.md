# 🔍 Gateway Debugger & Analytics

**Herramienta de observabilidad tipo Apigee para Univision Gateway**

Permite debugging profundo de requests en tiempo real, análisis de flujo interno de Envoy, métricas, logs dinámicos y visualización completa del ciclo de vida de cada solicitud.

## ✨ Características

- ✅ **Trace Viewer**: Visualiza el flujo completo del request a través de Envoy
- ✅ **Request Flow Analysis**: Ve cada decisión interna (JWT validation, headers, circuit breakers, etc)
- ✅ **Real-time Metrics**: Gráficas de latencia, throughput, error rates
- ✅ **Dynamic Log Control**: Activa/desactiva logs sin reiniciar servicios
- ✅ **Error Attribution**: Identifica exactamente dónde falló el request
- ✅ **Jaeger Integration**: Distribuited tracing para requests complejos
- ✅ **Performance Profiling**: Identifica cuellos de botella
- ✅ **Filter-level Debugging**: JWT, headers, transformations, etc

## 🏗️ Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│           Frontend (Next.js)                             │
│  - Trace Viewer Dashboard                               │
│  - Real-time Metrics & Alerts                           │
│  - Log Control Panel                                    │
│  - Request Flow Visualization                           │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┴───────────┐
        │                      │
┌───────▼────────┐    ┌────────▼───────┐
│ Backend API    │    │ WebSocket      │
│ (Go)           │    │ Server         │
│ - Traces       │    │ - Live Traces  │
│ - Metrics      │    │ - Alerts       │
│ - Logs         │    │ - Events       │
│ - Correlation  │    │ - Metrics Push │
└───────┬────────┘    └────────┬───────┘
        │                      │
        └──────────┬───────────┘
                   │
        ┌──────────▼──────────────┐
        │ Data Sources            │
        ├─────────────────────────┤
        │ • Envoy Access Logs     │
        │ • Jaeger Spans          │
        │ • Prometheus Metrics    │
        │ • K8s Events            │
        │ • Pod Logs              │
        └─────────────────────────┘
```

## 📋 Estructura del Proyecto

```
gateway-debugger/
├── README.md                          # Este archivo
├── ARCHITECTURE.md                    # Arquitectura técnica detallada
├── SETUP.md                           # Guía de instalación
│
├── backend/                           # Backend en Go
│   ├── go.mod
│   ├── go.sum
│   ├── main.go                       # Entry point
│   ├── Dockerfile
│   ├── Makefile
│   │
│   ├── cmd/
│   │   └── debugger/
│   │       ├── main.go
│   │       └── config.go
│   │
│   ├── internal/
│   │   ├── api/
│   │   │   ├── handlers.go           # HTTP handlers
│   │   │   ├── models.go             # Data models
│   │   │   └── websocket.go          # WS handlers
│   │   │
│   │   ├── collector/
│   │   │   ├── tracer.go             # Jaeger collector
│   │   │   ├── metrics.go            # Prometheus scraper
│   │   │   ├── logs.go               # Log aggregator
│   │   │   └── correlator.go         # Correlate traces
│   │   │
│   │   └── storage/
│   │       ├── memory.go             # In-memory store
│   │       └── redis.go              # Redis cache (optional)
│   │
│   └── test/
│       ├── unit_test.go
│       └── integration_test.go
│
├── frontend/                          # Frontend Next.js
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── Dockerfile
│   │
│   ├── public/                        # Static assets
│   │   └── favicon.ico
│   │
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx               # Dashboard home
│   │   │   │
│   │   │   ├── traces/                # Trace viewer
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx     # Trace detail
│   │   │   │   └── components/
│   │   │   │       ├── TraceViewer.tsx
│   │   │   │       ├── Timeline.tsx
│   │   │   │       └── FilterPanel.tsx
│   │   │   │
│   │   │   ├── metrics/               # Metrics dashboard
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── LatencyChart.tsx
│   │   │   │       ├── ThroughputChart.tsx
│   │   │   │       └── ErrorRateChart.tsx
│   │   │   │
│   │   │   ├── logs/                  # Log viewer
│   │   │   │   ├── page.tsx
│   │   │   │   └── components/
│   │   │   │       ├── LogViewer.tsx
│   │   │   │       ├── LogLevelControl.tsx
│   │   │   │       └── LogSearch.tsx
│   │   │   │
│   │   │   └── flow/                  # Request flow
│   │   │       ├── page.tsx
│   │   │       └── components/
│   │   │           ├── FlowDiagram.tsx
│   │   │           ├── FilterSteps.tsx
│   │   │           └── Decision.tsx
│   │   │
│   │   ├── components/
│   │   │   ├── Navigation.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Alert.tsx
│   │   │   └── Charts/
│   │   │       └── LineChart.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useTraces.ts
│   │   │   ├── useMetrics.ts
│   │   │   ├── useWebSocket.ts
│   │   │   └── useFilters.ts
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts                 # API client
│   │   │   ├── ws.ts                  # WebSocket client
│   │   │   ├── utils.ts               # Utilities
│   │   │   └── types.ts               # TypeScript types
│   │   │
│   │   └── styles/
│   │       ├── globals.css
│   │       └── components.css
│   │
│   └── .env.example
│
├── k8s/                               # Kubernetes manifests
│   ├── namespace.yaml
│   ├── deployment.yaml                # Debugger deployment
│   ├── service.yaml
│   ├── configmap.yaml
│   ├── rbac.yaml
│   └── envoy-config/
│       ├── patch-access-logs.yaml
│       └── patch-tracing.yaml
│
├── scripts/
│   ├── setup.sh                       # Setup initial
│   ├── build.sh                       # Build everything
│   ├── deploy.sh                      # Deploy to K8s
│   ├── logs.sh                        # View logs
│   └── test.sh                        # Run tests
│
├── examples/
│   ├── traces.json                    # Sample traces
│   ├── metrics.json                   # Sample metrics
│   ├── requests.json                  # Sample requests
│   └── jwt-failure-flow.md            # Example: JWT failure
│
├── docker-compose.yml                 # Local dev setup
├── Makefile                           # Build commands
└── .env.example                       # Environment template
```

## 🚀 Quick Start

### Prerequisitos
- Kubernetes 1.28+
- Envoy Gateway instalado
- Go 1.23+ (para backend)
- Node.js 18+ (para frontend)
- Docker

### Instalación Local

```bash
# 1. Clonar y navegar
cd gateway-debugger

# 2. Configurar variables
cp .env.example .env

# 3. Build y desarrollo local
make dev

# 4. Acceder al dashboard
open http://localhost:3000
```

### Instalación en Kubernetes

```bash
# 1. Crear namespace
kubectl create namespace gateway-debugger

# 2. Deploy todo
./scripts/deploy.sh

# 3. Port-forward
kubectl port-forward -n gateway-debugger svc/gateway-debugger 3000:3000

# 4. Acceder
open http://localhost:3000
```

## 📊 API REST

```
GET    /api/v1/traces                 # List traces with filters
POST   /api/v1/traces/search          # Advanced search
GET    /api/v1/traces/{id}            # Get trace detail
GET    /api/v1/traces/{id}/flow       # Get request flow

GET    /api/v1/metrics/latency        # Latency metrics
GET    /api/v1/metrics/throughput     # Throughput metrics
GET    /api/v1/metrics/errors         # Error rates

GET    /api/v1/logs                   # Get logs
POST   /api/v1/logs/level             # Change log level
DELETE /api/v1/logs/{id}              # Clear logs

GET    /api/v1/requests/{id}          # Get complete request flow
GET    /api/v1/requests/{id}/errors   # Get errors in flow

WS     /api/v1/stream                 # WebSocket for live data
```

## 🔧 Configuración

Ver [SETUP.md](SETUP.md) para configuración completa.

## 📚 Documentación

- [ARCHITECTURE.md](ARCHITECTURE.md) - Arquitectura técnica
- [SETUP.md](SETUP.md) - Guía de instalación
- [examples/](examples/) - Ejemplos de uso

## 🧪 Testing

```bash
# Backend tests
make test-backend

# Frontend tests
make test-frontend

# Integration tests
make test-integration
```

## 🐛 Troubleshooting

Ver [SETUP.md#Troubleshooting](SETUP.md#troubleshooting)

## 📈 Roadmap

- [x] MVP: Trace viewer básico
- [ ] Jaeger full integration
- [ ] Custom Lua filters para Envoy
- [ ] Advanced correlation engine
- [ ] ML-based anomaly detection
- [ ] Performance profiling tools
- [ ] Alert system

## 📄 License

Same as main project

---

**¿Preguntas?** Ver documentación en `SETUP.md` o `ARCHITECTURE.md`
