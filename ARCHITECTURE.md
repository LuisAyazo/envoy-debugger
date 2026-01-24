# 🏗️ Arquitectura Técnica: Gateway Debugger

## Visión General

El Gateway Debugger es una herramienta de observabilidad que captura, correlaciona y visualiza el flujo completo de un request a través del Envoy Gateway, mostrando cada decisión interna y punto de fallo.

## 1. Componentes Principales

### 1.1 Colector de Datos (Backend Go)

**Responsabilidades:**
- Recolectar traces de Jaeger
- Parsear logs de Envoy (JSON format)
- Scrape de métricas Prometheus
- Correlacionar datos por `request-id`
- Exponer API REST + WebSocket

**Stack:**
- Go 1.23+
- Gin (HTTP framework)
- Gorilla WebSocket
- Jaeger client
- Prometheus client

**API Endpoints:**

```
// Traces
GET  /api/v1/traces                    # List with pagination/filter
GET  /api/v1/traces/{id}               # Get full trace
GET  /api/v1/traces/{id}/flow          # Get flow steps

// Metrics
GET  /api/v1/metrics/latency           # 95th percentile, avg, etc
GET  /api/v1/metrics/throughput        # RPS, connections
GET  /api/v1/metrics/errors            # By status code, reason

// Logs
GET  /api/v1/logs                      # Paginated logs
POST /api/v1/logs/level/{component}    # Change log level
GET  /api/v1/logs/search               # Search logs

// WebSocket
WS   /api/v1/stream                    # Live traces, metrics, logs
```

### 1.2 Frontend Dashboard (Next.js)

**Responsabilidades:**
- Visualizar traces con timeline
- Mostrar métricas en gráficos
- Controlar niveles de log
- Filtrar y buscar requests
- Mostrar flujo de decisiones de Envoy

**Stack:**
- Next.js 14+
- React 18+
- TypeScript
- Recharts (gráficos)
- Tailwind CSS
- React Query (data fetching)

**Pages:**

```
/                      Dashboard principal
/traces                Viewer de traces
/traces/{id}           Detalle de un trace
/metrics               Gráficas de performance
/logs                  Log viewer
/flow                  Request flow visualization
```

### 1.3 Colector de Datos (Data Sources)

**Jaeger:**
- Backend recibe spans vía Jaeger API
- Correlaciona spans por trace-id
- Extrae timing y metadata

**Envoy Access Logs:**
- Formato JSON configurado en Gateway API
- Incluye request-id, filters executed, status
- Parseado en tiempo real

**Kubernetes:**
- Pod logs (via kubectl or K8s API)
- Events del API server
- Status de recursos

**Prometheus:**
- Latency histograms
- Request rates
- Error rates
- Circuit breaker state

## 2. Flujo de Datos

### Request Flow Trace

```
┌─────────────────┐
│  Client Request │
│  GET /api/users │
└────────┬────────┘
         │
         ▼ (Jaeger span: "http_request_received")
┌─────────────────────────────┐
│  Envoy Listener             │
│  - Span: "listener"         │
│  - Duration: 0.1ms          │
└────────┬────────────────────┘
         │
         ▼ (Jaeger span: "http_route_match")
┌─────────────────────────────┐
│  HTTP Route Matching        │
│  - Matched: /api/*          │
│  - Route: api-route         │
│  - Status: ✅ PASS          │
└────────┬────────────────────┘
         │
         ▼ (Jaeger span: "filter_jwt_auth")
┌─────────────────────────────┐
│  JWT Authentication         │
│  - Token provided: yes      │
│  - Token valid: ❌ NO       │
│  - Reason: exp < now        │
│  - Status: ❌ FAIL          │
│  - Response: 401            │
└────────┬────────────────────┘
         │
         ▼ (Jaeger span: "response_sent")
┌──────────────────────────────┐
│  Response Sent to Client     │
│  - Status: 401 Unauthorized  │
│  - Headers: {...}            │
│  - Total Duration: 2.3ms     │
└──────────────────────────────┘
```

### Data Correlation

```
Jaeger Trace ID: trace-123
├─ Span 1: http_request_received (request-id: req-abc-123)
├─ Span 2: http_route_match
│  └─ Tags: route=/api/*, matched=true
├─ Span 3: filter_jwt_auth
│  └─ Tags: filter=jwt, status=failed, reason=exp_invalid
└─ Span 4: response_sent
   └─ Tags: status_code=401, duration=2.3ms

Envoy Access Log: {"request_id": "req-abc-123", ...}
K8s Event: "Pod envoy-xyz processing request"
```

### Storage Strategy

**Memory (Development):**
```go
type TraceStore struct {
    Traces    map[string]*Trace        // Key: trace_id
    Metrics   map[string]*MetricPoint  // Key: timestamp:metric_name
    Logs      []LogEntry               // Append-only
    MaxEntries int                     // Auto cleanup
}
```

**Redis (Production):**
```
traces:{trace_id}      -> Trace JSON + expiration (1h)
metrics:{metric_name}  -> Time series data
logs:{component}       -> Log stream
```

## 3. Implementación Backend (Go)

### Project Structure

```
backend/
├── cmd/debugger/
│   └── main.go                # Entry point
├── internal/
│   ├── api/
│   │   ├── handlers.go        # HTTP handlers
│   │   ├── models.go          # Request/Response models
│   │   └── websocket.go       # WS logic
│   ├── collector/
│   │   ├── jaeger.go          # Jaeger integration
│   │   ├── envoy_logs.go      # Parse Envoy logs
│   │   ├── metrics.go         # Prometheus integration
│   │   ├── correlator.go      # Correlate by request-id
│   │   └── k8s.go             # K8s API client
│   └── storage/
│       ├── memory.go          # In-memory store
│       └── types.go           # Storage models
├── go.mod
├── Makefile
└── Dockerfile
```

### Key Components

**1. Trace Model:**

```go
type Trace struct {
    ID          string        // Jaeger trace ID
    RequestID   string        // X-Request-ID header
    Timestamp   time.Time
    Duration    time.Duration
    Method      string
    Path        string
    StatusCode  int
    
    Spans       []Span
    FlowSteps   []FlowStep    // Decision path in Envoy
    Metadata    map[string]string
    Errors      []Error
}

type Span struct {
    Name        string                 // "filter_jwt_auth"
    Duration    time.Duration
    Timestamp   time.Time
    Tags        map[string]interface{}
    Logs        []map[string]interface{}
    ParentID    string
}

type FlowStep struct {
    Order       int
    Name        string                 // "JWT Validation", "Route Match"
    Status      string                 // "pass", "fail", "skip"
    Duration    time.Duration
    Reason      string                 // "Token expired"
    Metadata    map[string]interface{} // Details
}
```

**2. Correlator Logic:**

```go
func (c *Correlator) CorrelateRequest(traceID, requestID string) *Trace {
    // 1. Get trace from Jaeger
    jaegerTrace := c.jaegerClient.GetTrace(traceID)
    
    // 2. Get logs from Envoy
    envoyLogs := c.envoyCollector.GetLogsByRequestID(requestID)
    
    // 3. Get K8s events
    k8sEvents := c.k8sCollector.GetEventsByRequestID(requestID)
    
    // 4. Combine and correlate
    return c.merge(jaegerTrace, envoyLogs, k8sEvents)
}
```

**3. WebSocket Manager:**

```go
type WSManager struct {
    hub        *Hub
    collectors []Collector
}

func (m *WSManager) StreamLiveTraces(clientID string) {
    for span := range m.collectors.SpanChan {
        m.hub.broadcast(clientID, span)
    }
}
```

## 4. Implementación Frontend (Next.js)

### Component Architecture

```
App Layout
├── Navigation
│   ├── Logo
│   ├── Menu (Traces, Metrics, Logs, Flow)
│   └── Settings
└── Main Content
    ├── Traces Page
    │   ├── TraceList (table con filters)
    │   └── TraceDetail
    │       ├── Timeline (visual de spans)
    │       ├── FlowDiagram (steps visualization)
    │       └── Metadata (JSON viewer)
    │
    ├── Metrics Page
    │   ├── LatencyChart (percentiles)
    │   ├── ThroughputChart (RPS)
    │   └── ErrorRateChart (by reason)
    │
    ├── Logs Page
    │   ├── LogLevelControl (buttons)
    │   ├── LogViewer (virtual scroll)
    │   └── LogSearch
    │
    └── Flow Page
        ├── FlowDiagram (Mermaid o custom)
        ├── DecisionTree (collapsible)
        └── ErrorHighlight (failed steps)
```

### State Management (React Query)

```ts
// Hooks
useTraces()          // Fetch traces with filters
useMetrics()         // Fetch metrics
useLogs()            // Fetch logs
useWebSocket()       // Live data stream

// Example
const { data: traces, isLoading } = useTraces({
    limit: 50,
    offset: 0,
    filter: { statusCode: 401 }
})
```

### Real-time Updates

```ts
// WebSocket connection
const socket = new WebSocket('ws://localhost:8080/api/v1/stream')

socket.onmessage = (event) => {
    const { type, data } = JSON.parse(event.data)
    
    if (type === 'new_trace') {
        queryClient.setQueryData(['traces'], old => [data, ...old])
    }
    if (type === 'metric_update') {
        queryClient.setQueryData(['metrics'], old => ({ ...old, ...data }))
    }
}
```

## 5. Kubernetes Integration

### Deployment Architecture

```yaml
Namespace: gateway-debugger

Pods:
├── gateway-debugger-backend-*    (2-3 replicas)
├── gateway-debugger-frontend-*   (2 replicas)
└── redis-*                       (optional, 1 replica)

Services:
├── gateway-debugger-backend      (ClusterIP, 8080)
├── gateway-debugger-frontend     (ClusterIP, 3000)
└── gateway-debugger              (LoadBalancer/Ingress)

ConfigMaps:
├── debugger-config               (backend config)
└── envoy-patches                 (access logs config)

RBAC:
├── ServiceAccount: gateway-debugger
├── ClusterRole: read-logs, read-events
└── ClusterRoleBinding
```

### Envoy Configuration Patches

**Enable Access Logs (JSON):**

```yaml
# k8s/envoy-config/patch-access-logs.yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: default
spec:
  telemetry:
    accessLog:
      settings:
      - format: |
          {
            "timestamp": "%START_TIME%",
            "request_id": "%REQ(X-REQUEST-ID)%",
            "method": "%REQ(:METHOD)%",
            "path": "%REQ(:PATH)%",
            "status": "%RESPONSE_CODE%",
            "duration_ms": "%DURATION%",
            "upstream": "%UPSTREAM_HOST%",
            "filters_executed": [...]
          }
        sinks:
        - type: File
          file:
            path: "/dev/stdout"
```

**Enable Tracing (Jaeger):**

```yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: default
spec:
  telemetry:
    tracing:
      samplingRate: 100
      provider:
        name: jaeger
        backendRefs:
        - name: jaeger
          namespace: monitoring
          port: 16686
```

## 6. Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     Client Application                            │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Envoy Gateway       │
                    │  - Route matching     │
                    │  - Filters            │
                    │  - Access logs        │
                    │  - Spans (Jaeger)     │
                    └───────────┬───────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
        ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
        │ Access Logs │  │ Jaeger      │  │ Prometheus  │
        │ (JSON)      │  │ Spans       │  │ Metrics     │
        └────┬────────┘  └────┬────────┘  └────┬────────┘
             │                 │                 │
             └────────┬────────┴────────┬────────┘
                      │                 │
                      ▼                 ▼
            ┌──────────────────────────────────┐
            │  Backend Collector (Go)          │
            │  - Parse & correlate             │
            │  - Request flow analysis         │
            │  - Metric aggregation            │
            │  - In-memory/Redis storage       │
            └──────────┬──────────────┬────────┘
                       │              │
           ┌───────────┘              └─────────────┐
           │                                        │
           ▼                                        ▼
    ┌────────────────┐                  ┌────────────────────┐
    │ REST API       │                  │ WebSocket Stream   │
    │ - /api/traces  │                  │ - Live data        │
    │ - /api/metrics │                  │ - Push updates     │
    │ - /api/logs    │                  └────────────────────┘
    └────────┬───────┘                           │
             │                                   │
             └────────────────┬──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Frontend (React) │
                    │ - Dashboard      │
                    │ - Visualizations │
                    └──────────────────┘
                              │
                              ▼
                         ┌─────────┐
                         │  User   │
                         └─────────┘
```

## 7. Error Scenarios

### Scenario 1: JWT Validation Failure

```
Request Flow:
1. Request enters Envoy
2. Route matched: ✅
3. JWT validation filter executes
   - Token extracted from Authorization header
   - Token parsed: OK
   - Expiration checked: ❌ FAIL (exp < now)
4. Response: 401 Unauthorized
5. Client never receives backend response

Debugger Shows:
- Trace with failed JWT span
- Access log showing filter="jwt_auth", status=401
- Flow step showing exact reason (exp < now)
```

### Scenario 2: Circuit Breaker Activation

```
Request Flow:
1. Validations pass: ✅
2. Circuit breaker check
   - Current connections: 500
   - Max allowed: 500
   - Status: ⚠️ AT_LIMIT
   - New connection requested: ❌ REJECTED
3. Response: 503 Service Unavailable

Debugger Shows:
- Circuit breaker state metrics
- Reason: Max connections reached
- Upstream: identity-api:443
- Current load: 500/500
```

### Scenario 3: Backend Timeout

```
Request Flow:
1. All filters pass: ✅
2. Forward to backend: identity-api
3. Wait for response... (5s timeout)
4. Timeout reached: ❌
5. Response: 504 Gateway Timeout

Debugger Shows:
- Trace showing upstream latency > timeout
- No response received tag
- Backend health status at time of request
- Retry policy (if configured)
```

## 8. Performance Considerations

**Scalability:**
- Trace storage: 10K traces/hour typical
- Memory: ~100MB for 10K traces (with retention=1h)
- Redis: ~500MB for full day retention

**Optimization:**
- Only store traces matching criteria (errors, slow requests, etc)
- Aggregate old metrics (hourly, daily)
- Compress trace JSON for storage

## 9. Security

**API Protection:**
- Rate limiting: 100 req/s per client
- API key authentication (optional)
- RBAC: read traces, manage log levels

**Data Privacy:**
- Redact sensitive headers (Authorization, Cookies)
- Redact request bodies
- Audit logs for log level changes

## 10. Monitoring the Debugger

**Self-monitoring:**
- Backend health: /health endpoint
- Storage usage: /metrics
- WebSocket connections: /api/v1/stats
- Error rates in own components
