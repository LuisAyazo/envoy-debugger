# 🔗 Gateway Debugger - Integración con Observabilidad de Envoy

## 📋 Resumen

Este documento describe cómo el **Gateway Debugger** se integra con el stack de observabilidad de Envoy Gateway para:
1. **Consumir traces/metrics/logs** desde Tempo, Jaeger, Prometheus y Loki
2. **Actualizar configuración dinámica** de Envoy Gateway (EnvoyProxy CRD, EnvoyPatchPolicy)
3. **Visualizar el ciclo completo** de requests en tiempo real

## 🎯 Arquitectura de Integración

```
┌─────────────────────────────────────────────────────────────────┐
│                    ENVOY GATEWAY (Data Plane)                   │
│  - Procesa requests HTTP/HTTPS                                  │
│  - Emite traces → OTel Collector                               │
│  - Emite metrics → Prometheus                                   │
│  - Emite logs → Loki                                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│              OBSERVABILITY STACK (Kubernetes)                   │
│  ┌──────────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐ │
│  │ OTel         │  │ Tempo    │  │ Prometheus │  │ Loki     │ │
│  │ Collector    │→ │ (traces) │  │ (metrics)  │  │ (logs)   │ │
│  └──────────────┘  └──────────┘  └────────────┘  └──────────┘ │
│         ↓                ↓              ↓              ↓        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Jaeger (Trace UI)                           │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ (Query APIs)
┌─────────────────────────────────────────────────────────────────┐
│              GATEWAY DEBUGGER (Control Plane)                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Backend (Go)                                             │  │
│  │  - Query Tempo API (traces)                             │  │
│  │  - Query Jaeger API (traces)                            │  │
│  │  - Query Prometheus API (metrics)                       │  │
│  │  - Query Loki API (logs)                                │  │
│  │  - Correlate traces ↔ logs ↔ metrics                    │  │
│  │  - Kubernetes API client (update EnvoyProxy CRD)        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                         ↓                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Frontend (Next.js)                                       │  │
│  │  - Trace Viewer (consume Tempo/Jaeger)                  │  │
│  │  - Metrics Dashboard (consume Prometheus)               │  │
│  │  - Log Viewer (consume Loki)                            │  │
│  │  - Config Editor (update EnvoyProxy via K8s API)        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓ (Update CRDs)
┌─────────────────────────────────────────────────────────────────┐
│              KUBERNETES API SERVER                              │
│  - EnvoyProxy CRD (telemetry config, bootstrap)                │
│  - EnvoyPatchPolicy (dynamic patches)                           │
│  - HTTPRoute, Gateway (routing config)                          │
└─────────────────────────────────────────────────────────────────┘
```

## 🔌 Integración 1: Consumir Observabilidad

### Backend: Query Clients

El backend del Gateway Debugger implementa clientes para consultar cada datasource:

```go
// internal/clients/tempo_client.go
type TempoClient struct {
    baseURL string
    httpClient *http.Client
}

func (c *TempoClient) SearchTraces(ctx context.Context, query TraceQuery) ([]Trace, error)
func (c *TempoClient) GetTrace(ctx context.Context, traceID string) (*Trace, error)
func (c *TempoClient) GetServiceGraph(ctx context.Context, start, end time.Time) (*ServiceGraph, error)

// internal/clients/jaeger_client.go
type JaegerClient struct {
    baseURL string
    httpClient *http.Client
}

func (c *JaegerClient) FindTraces(ctx context.Context, query JaegerQuery) ([]Trace, error)
func (c *JaegerClient) GetTrace(ctx context.Context, traceID string) (*Trace, error)

// internal/clients/prometheus_client.go
type PrometheusClient struct {
    baseURL string
    api v1.API
}

func (c *PrometheusClient) QueryRange(ctx context.Context, query string, start, end time.Time) (model.Value, error)
func (c *PrometheusClient) QueryInstant(ctx context.Context, query string) (model.Value, error)

// internal/clients/loki_client.go
type LokiClient struct {
    baseURL string
    httpClient *http.Client
}

func (c *LokiClient) QueryRange(ctx context.Context, query string, start, end time.Time) ([]LogEntry, error)
func (c *LokiClient) QueryByTraceID(ctx context.Context, traceID string) ([]LogEntry, error)
```

### API Endpoints

```go
// internal/api/handlers.go

// GET /api/v1/traces?service=envoy-gateway&start=...&end=...
func (h *Handler) GetTraces(w http.ResponseWriter, r *http.Request) {
    // Query Tempo/Jaeger
    traces, err := h.tempoClient.SearchTraces(ctx, query)
    // Return traces
}

// GET /api/v1/traces/{traceID}
func (h *Handler) GetTraceDetail(w http.ResponseWriter, r *http.Request) {
    traceID := chi.URLParam(r, "traceID")
    
    // Get trace from Tempo
    trace, err := h.tempoClient.GetTrace(ctx, traceID)
    
    // Get correlated logs from Loki
    logs, err := h.lokiClient.QueryByTraceID(ctx, traceID)
    
    // Combine and return
    response := TraceDetailResponse{
        Trace: trace,
        Logs: logs,
    }
}

// GET /api/v1/metrics/latency?route=/api/users&start=...&end=...
func (h *Handler) GetLatencyMetrics(w http.ResponseWriter, r *http.Request) {
    query := `histogram_quantile(0.95, 
        rate(gateway_request_duration_seconds_bucket{http_route="/api/users"}[5m])
    )`
    
    result, err := h.prometheusClient.QueryRange(ctx, query, start, end)
    // Return metrics
}

// GET /api/v1/logs?trace_id=...&start=...&end=...
func (h *Handler) GetLogs(w http.ResponseWriter, r *http.Request) {
    traceID := r.URL.Query().Get("trace_id")
    
    query := fmt.Sprintf(`{service_name="envoy-gateway"} | json | trace_id="%s"`, traceID)
    logs, err := h.lokiClient.QueryRange(ctx, query, start, end)
    // Return logs
}

// GET /api/v1/service-graph?start=...&end=...
func (h *Handler) GetServiceGraph(w http.ResponseWriter, r *http.Request) {
    graph, err := h.tempoClient.GetServiceGraph(ctx, start, end)
    // Return service graph
}
```

## 🔧 Integración 2: Actualizar Configuración Dinámica

### Kubernetes Client

El backend usa el Kubernetes client-go para actualizar CRDs:

```go
// internal/clients/k8s_client.go
type K8sClient struct {
    clientset *kubernetes.Clientset
    dynamicClient dynamic.Interface
    gatewayClient *gwclient.Clientset
}

// Update EnvoyProxy telemetry configuration
func (c *K8sClient) UpdateEnvoyProxyTelemetry(ctx context.Context, namespace, name string, config TelemetryConfig) error {
    // Get current EnvoyProxy
    envoyProxy, err := c.gatewayClient.GatewayV1alpha1().EnvoyProxies(namespace).Get(ctx, name, metav1.GetOptions{})
    
    // Update telemetry section
    envoyProxy.Spec.Telemetry.Tracing.SamplingRate = config.SamplingRate
    envoyProxy.Spec.Telemetry.Tracing.CustomTags = config.CustomTags
    
    // Apply update
    _, err = c.gatewayClient.GatewayV1alpha1().EnvoyProxies(namespace).Update(ctx, envoyProxy, metav1.UpdateOptions{})
    return err
}

// Create/Update EnvoyPatchPolicy for dynamic patches
func (c *K8sClient) ApplyEnvoyPatch(ctx context.Context, namespace string, patch EnvoyPatch) error {
    // Create EnvoyPatchPolicy
    patchPolicy := &gwv1alpha1.EnvoyPatchPolicy{
        ObjectMeta: metav1.ObjectMeta{
            Name: patch.Name,
            Namespace: namespace,
        },
        Spec: gwv1alpha1.EnvoyPatchPolicySpec{
            Type: gwv1alpha1.JSONPatch,
            JSONPatches: []gwv1alpha1.JSONPatchConfig{
                {
                    Type: gwv1alpha1.ListenerPatch,
                    Name: patch.ListenerName,
                    Operation: gwv1alpha1.JSONPatchOperation{
                        Op: "add",
                        Path: patch.Path,
                        Value: patch.Value,
                    },
                },
            },
        },
    }
    
    // Apply patch
    _, err = c.dynamicClient.Resource(envoyPatchPolicyGVR).Namespace(namespace).
        Create(ctx, unstructured.Unstructured{Object: patchPolicy}, metav1.CreateOptions{})
    return err
}

// Update log level dynamically
func (c *K8sClient) UpdateLogLevel(ctx context.Context, namespace, name string, level string) error {
    // Create EnvoyPatchPolicy to update log level
    patch := EnvoyPatch{
        Name: "dynamic-log-level",
        ListenerName: "http",
        Path: "/admin/logging",
        Value: map[string]interface{}{
            "level": level,
        },
    }
    return c.ApplyEnvoyPatch(ctx, namespace, patch)
}
```

### API Endpoints para Configuración

```go
// POST /api/v1/config/telemetry
func (h *Handler) UpdateTelemetryConfig(w http.ResponseWriter, r *http.Request) {
    var config TelemetryConfig
    json.NewDecoder(r.Body).Decode(&config)
    
    err := h.k8sClient.UpdateEnvoyProxyTelemetry(ctx, "envoy-gateway-system", "envoy-gateway", config)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusOK)
}

// POST /api/v1/config/log-level
func (h *Handler) UpdateLogLevel(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Level string `json:"level"` // debug, info, warn, error
    }
    json.NewDecoder(r.Body).Decode(&req)
    
    err := h.k8sClient.UpdateLogLevel(ctx, "envoy-gateway-system", "envoy-gateway", req.Level)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }
    
    w.WriteHeader(http.StatusOK)
}

// POST /api/v1/config/sampling-rate
func (h *Handler) UpdateSamplingRate(w http.ResponseWriter, r *http.Request) {
    var req struct {
        SamplingRate uint32 `json:"sampling_rate"` // 0-100
    }
    json.NewDecoder(r.Body).Decode(&req)
    
    config := TelemetryConfig{
        SamplingRate: req.SamplingRate,
    }
    
    err := h.k8sClient.UpdateEnvoyProxyTelemetry(ctx, "envoy-gateway-system", "envoy-gateway", config)
    // ...
}

// POST /api/v1/config/custom-tags
func (h *Handler) AddCustomTag(w http.ResponseWriter, r *http.Request) {
    var req struct {
        TagName string `json:"tag_name"`
        TagValue string `json:"tag_value"`
    }
    json.NewDecoder(r.Body).Decode(&req)
    
    // Get current config
    envoyProxy, _ := h.k8sClient.GetEnvoyProxy(ctx, "envoy-gateway-system", "envoy-gateway")
    
    // Add custom tag
    envoyProxy.Spec.Telemetry.Tracing.CustomTags[req.TagName] = gwv1alpha1.CustomTag{
        Literal: &gwv1alpha1.LiteralCustomTag{
            Value: req.TagValue,
        },
    }
    
    // Update
    err := h.k8sClient.UpdateEnvoyProxy(ctx, envoyProxy)
    // ...
}
```

## 📊 Frontend: Visualización

### Trace Viewer Component

```typescript
// frontend/src/app/traces/components/TraceViewer.tsx
'use client';

import { useEffect, useState } from 'react';
import { useTraces } from '@/hooks/useTraces';

export function TraceViewer() {
  const { traces, loading, error } = useTraces({
    service: 'envoy-gateway',
    start: Date.now() - 3600000, // Last hour
    end: Date.now(),
  });

  return (
    <div className="trace-viewer">
      <h2>Envoy Gateway Traces</h2>
      {traces.map(trace => (
        <TraceCard key={trace.traceID} trace={trace} />
      ))}
    </div>
  );
}

// frontend/src/hooks/useTraces.ts
export function useTraces(query: TraceQuery) {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/v1/traces?${new URLSearchParams(query)}`)
      .then(res => res.json())
      .then(data => setTraces(data))
      .finally(() => setLoading(false));
  }, [query]);

  return { traces, loading };
}
```

### Config Editor Component

```typescript
// frontend/src/app/config/components/TelemetryConfig.tsx
'use client';

import { useState } from 'react';

export function TelemetryConfigEditor() {
  const [samplingRate, setSamplingRate] = useState(100);
  const [logLevel, setLogLevel] = useState('info');

  const updateSamplingRate = async () => {
    await fetch('/api/v1/config/sampling-rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampling_rate: samplingRate }),
    });
  };

  const updateLogLevel = async () => {
    await fetch('/api/v1/config/log-level', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: logLevel }),
    });
  };

  return (
    <div className="config-editor">
      <h2>Telemetry Configuration</h2>
      
      <div className="form-group">
        <label>Sampling Rate (%)</label>
        <input 
          type="number" 
          value={samplingRate} 
          onChange={e => setSamplingRate(Number(e.target.value))}
          min="0"
          max="100"
        />
        <button onClick={updateSamplingRate}>Update</button>
      </div>

      <div className="form-group">
        <label>Log Level</label>
        <select value={logLevel} onChange={e => setLogLevel(e.target.value)}>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <button onClick={updateLogLevel}>Update</button>
      </div>
    </div>
  );
}
```

## 🚀 Deployment en Kubernetes

### RBAC para Gateway Debugger

```yaml
# gateway-debugger/k8s/rbac.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: gateway-debugger
  namespace: gateway-debugger
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: gateway-debugger
rules:
  # Read EnvoyProxy CRDs
  - apiGroups: ["gateway.envoyproxy.io"]
    resources: ["envoyproxies"]
    verbs: ["get", "list", "watch"]
  
  # Update EnvoyProxy CRDs
  - apiGroups: ["gateway.envoyproxy.io"]
    resources: ["envoyproxies"]
    verbs: ["update", "patch"]
  
  # Create/Update EnvoyPatchPolicy
  - apiGroups: ["gateway.envoyproxy.io"]
    resources: ["envoypatchpolicies"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
  
  # Read Gateway API resources
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["gateways", "httproutes"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: gateway-debugger
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: gateway-debugger
subjects:
  - kind: ServiceAccount
    name: gateway-debugger
    namespace: gateway-debugger
```

### Deployment con Datasource URLs

```yaml
# gateway-debugger/k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gateway-debugger
  namespace: gateway-debugger
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gateway-debugger
  template:
    metadata:
      labels:
        app: gateway-debugger
    spec:
      serviceAccountName: gateway-debugger
      containers:
        - name: backend
          image: gateway-debugger-backend:latest
          ports:
            - containerPort: 8080
          env:
            # Observability datasources
            - name: TEMPO_URL
              value: "http://tempo.observability.svc.cluster.local:3100"
            - name: JAEGER_URL
              value: "http://jaeger-query.observability.svc.cluster.local:16686"
            - name: PROMETHEUS_URL
              value: "http://prometheus.observability.svc.cluster.local:9090"
            - name: LOKI_URL
              value: "http://loki.observability.svc.cluster.local:3100"
            
            # Kubernetes API
            - name: KUBERNETES_SERVICE_HOST
              value: "kubernetes.default.svc"
            - name: KUBERNETES_SERVICE_PORT
              value: "443"
          
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
        
        - name: frontend
          image: gateway-debugger-frontend:latest
          ports:
            - containerPort: 3000
          env:
            - name: NEXT_PUBLIC_API_URL
              value: "http://localhost:8080"
          resources:
            requests:
              memory: "128Mi"
              cpu: "50m"
            limits:
              memory: "256Mi"
              cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: gateway-debugger
  namespace: gateway-debugger
spec:
  type: LoadBalancer
  selector:
    app: gateway-debugger
  ports:
    - name: frontend
      port: 3000
      targetPort: 3000
    - name: backend
      port: 8080
      targetPort: 8080
```

## 🔄 Flujo Completo: Request → Trace → Debug → Fix

### 1. Request llega a Envoy Gateway

```
Client → Envoy Gateway
  ├─ JWT Validation (span)
  ├─ Lua Transformation (span)
  ├─ Rate Limiting (span)
  └─ Upstream Routing (span)
```

### 2. Envoy emite telemetry

```
Envoy → OTel Collector
  ├─ Trace (OTLP) → Tempo
  ├─ Metrics (Prometheus) → Prometheus
  └─ Logs (JSON) → Loki
```

### 3. Usuario abre Gateway Debugger

```
Frontend → Backend API
  ├─ GET /api/v1/traces → Query Tempo
  ├─ GET /api/v1/metrics → Query Prometheus
  └─ GET /api/v1/logs → Query Loki
```

### 4. Usuario ve error en trace

```
Trace Detail:
  ├─ Span: JWT Validation ❌ FAILED
  │   └─ Error: "Invalid signature"
  ├─ Logs correlacionados:
  │   └─ "JWT validation failed: signature mismatch"
  └─ Metrics:
      └─ Error rate: 15% en /api/users
```

### 5. Usuario ajusta configuración

```
Frontend → POST /api/v1/config/log-level
  └─ Backend → K8s API → Update EnvoyPatchPolicy
      └─ Envoy reconfigura log level a "debug"
```

### 6. Usuario ve logs detallados

```
Frontend → GET /api/v1/logs?level=debug
  └─ Backend → Query Loki
      └─ Logs con detalles de JWT validation
```

## 📈 Casos de Uso Avanzados

### 1. Tail Sampling Dinámico

```go
// Cambiar sampling rate basado en error rate
func (h *Handler) AutoAdjustSampling(ctx context.Context) {
    // Query error rate
    errorRate := h.getErrorRate(ctx)
    
    if errorRate > 0.05 { // > 5% errors
        // Increase sampling to 100%
        h.k8sClient.UpdateEnvoyProxyTelemetry(ctx, "envoy-gateway-system", "envoy-gateway", TelemetryConfig{
            SamplingRate: 100,
        })
    } else {
        // Normal sampling 10%
        h.k8sClient.UpdateEnvoyProxyTelemetry(ctx, "envoy-gateway-system", "envoy-gateway", TelemetryConfig{
            SamplingRate: 10,
        })
    }
}
```

### 2. Custom Tags Dinámicos

```go
// Agregar tag de versión de deployment
func (h *Handler) AddDeploymentVersionTag(ctx context.Context, version string) error {
    return h.k8sClient.AddCustomTag(ctx, "deployment_version", version)
}
```

### 3. Circuit Breaker Monitoring

```go
// Monitor circuit breaker state y ajustar thresholds
func (h *Handler) MonitorCircuitBreakers(ctx context.Context) {
    // Query Prometheus for circuit breaker metrics
    query := `envoy_cluster_circuit_breakers_default_cx_open`
    result, _ := h.prometheusClient.QueryInstant(ctx, query)
    
    // Si hay muchos circuit breakers abiertos, alertar
    if result > threshold {
        h.sendAlert("Circuit breakers open", result)
    }
}
```

## ✅ Checklist de Implementación

- [ ] Implementar clientes de observabilidad (Tempo, Jaeger, Prometheus, Loki)
- [ ] Implementar Kubernetes client para actualizar CRDs
- [ ] Crear API endpoints para queries de observabilidad
- [ ] Crear API endpoints para actualizar configuración
- [ ] Implementar frontend para visualizar traces/metrics/logs
- [ ] Implementar frontend para editar configuración
- [ ] Crear RBAC para Gateway Debugger
- [ ] Crear manifiestos K8s para deployment
- [ ] Documentar flujos de uso
- [ ] Probar integración end-to-end

---

**¡Gateway Debugger ahora consume y controla la observabilidad de Envoy Gateway!** 🚀
