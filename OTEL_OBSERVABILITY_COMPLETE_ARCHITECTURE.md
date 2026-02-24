# 🔭 OpenTelemetry Observability - Arquitectura Completa para Gateway Debugger

## 📋 Resumen Ejecutivo

Este documento describe la arquitectura completa de observabilidad basada en **OpenTelemetry (OTel)** para el Gateway Debugger. Esta es una implementación **monumental** que transforma el debugger en una plataforma de observabilidad de clase empresarial tipo Apigee/Datadog.

### Objetivos

1. **Tracing distribuido completo** con OpenTelemetry
2. **Métricas detalladas** de performance y negocio
3. **Logs estructurados** correlacionados con traces
4. **Dashboards avanzados** en Grafana
5. **Alertas inteligentes** basadas en SLOs
6. **Análisis de flujo** de requests en tiempo real

---

## 🏗️ Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ENVOY GATEWAY                                 │
│  - HTTP Filters (JWT, CORS, Rate Limit, etc)                        │
│  - OTel Instrumentation (auto-tracing)                              │
│  - Access Logs (JSON structured)                                    │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         │ OTLP (gRPC/HTTP)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              OPENTELEMETRY COLLECTOR                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ RECEIVERS                                                     │  │
│  │  - OTLP (gRPC :4317, HTTP :4318)                             │  │
│  │  - Jaeger (legacy :14250)                                    │  │
│  │  - Prometheus (scrape :9090)                                 │  │
│  │  - Filelog (Envoy access logs)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ PROCESSORS                                                    │  │
│  │  - Batch (performance)                                        │  │
│  │  - Memory Limiter (prevent OOM)                               │  │
│  │  - Resource Detection (K8s metadata)                          │  │
│  │  - Attributes (enrich spans)                                  │  │
│  │  - Span Metrics (generate RED metrics from traces)            │  │
│  │  - Tail Sampling (intelligent sampling)                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ EXPORTERS                                                     │  │
│  │  - Jaeger (traces)                                            │  │
│  │  - Prometheus (metrics)                                       │  │
│  │  - Loki (logs)                                                │  │
│  │  - Gateway Debugger Backend (custom)                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┬──────────────────┐
         │               │               │                  │
         ▼               ▼               ▼                  ▼
┌────────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐
│ JAEGER         │ │ PROMETHEUS │ │ LOKI       │ │ DEBUGGER BACKEND │
│ (Traces)       │ │ (Metrics)  │ │ (Logs)     │ │ (Correlation)    │
│                │ │            │ │            │ │                  │
│ - Query UI     │ │ - TSDB     │ │ - LogQL    │ │ - API REST       │
│ - Trace search │ │ - PromQL   │ │ - Labels   │ │ - WebSocket      │
└────────┬───────┘ └─────┬──────┘ └─────┬──────┘ └────────┬─────────┘
         │               │               │                  │
         └───────────────┴───────────────┴──────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   GRAFANA DASHBOARDS    │
                    │                         │
                    │  - Traces Explorer      │
                    │  - Metrics (RED/USE)    │
                    │  - Logs Viewer          │
                    │  - Service Map          │
                    │  - SLO Dashboard        │
                    │  - Alerts Manager       │
                    └─────────────────────────┘
```

---

## 📊 Componentes Principales

### 1. OpenTelemetry Collector

**Configuración completa:**

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
        cors:
          allowed_origins:
            - "*"
  
  jaeger:
    protocols:
      grpc:
        endpoint: 0.0.0.0:14250
      thrift_http:
        endpoint: 0.0.0.0:14268
  
  prometheus:
    config:
      scrape_configs:
        - job_name: 'envoy-gateway'
          static_configs:
            - targets: ['envoy-gateway:9901']
        - job_name: 'debugger-backend'
          static_configs:
            - targets: ['debugger-backend:8080']
  
  filelog:
    include:
      - /var/log/envoy/access.log
    operators:
      - type: json_parser
        timestamp:
          parse_from: attributes.timestamp
          layout: '%Y-%m-%dT%H:%M:%S.%fZ'

processors:
  batch:
    timeout: 10s
    send_batch_size: 1024
  
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128
  
  resource:
    attributes:
      - key: service.name
        value: envoy-gateway
        action: upsert
      - key: deployment.environment
        from_attribute: k8s.namespace.name
        action: insert
  
  attributes:
    actions:
      - key: http.route
        action: insert
        from_attribute: http.target
      - key: request_id
        action: insert
        from_attribute: http.request.header.x-request-id
  
  spanmetrics:
    metrics_exporter: prometheus
    latency_histogram_buckets: [2ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2s, 5s]
    dimensions:
      - name: http.method
      - name: http.status_code
      - name: http.route
  
  tail_sampling:
    decision_wait: 10s
    num_traces: 100
    expected_new_traces_per_sec: 10
    policies:
      - name: errors
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow
        type: latency
        latency:
          threshold_ms: 1000
      - name: sample-rate
        type: probabilistic
        probabilistic:
          sampling_percentage: 10

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true
  
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: gateway
    const_labels:
      environment: production
  
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
    labels:
      resource:
        service.name: "service_name"
        k8s.namespace.name: "namespace"
  
  otlphttp/debugger:
    endpoint: http://debugger-backend:8080/v1/traces
    tls:
      insecure: true

service:
  pipelines:
    traces:
      receivers: [otlp, jaeger]
      processors: [memory_limiter, resource, attributes, batch, tail_sampling, spanmetrics]
      exporters: [jaeger, otlphttp/debugger]
    
    metrics:
      receivers: [otlp, prometheus]
      processors: [memory_limiter, resource, batch]
      exporters: [prometheus]
    
    logs:
      receivers: [otlp, filelog]
      processors: [memory_limiter, resource, batch]
      exporters: [loki]
```

---

### 2. Backend con OpenTelemetry SDK (Go)

**Estructura actualizada:**

```
backend/
├── cmd/debugger/
│   └── main.go
├── internal/
│   ├── otel/
│   │   ├── tracer.go          # OTel tracer setup
│   │   ├── metrics.go         # OTel metrics setup
│   │   ├── logger.go          # OTel logs setup
│   │   └── propagation.go     # Context propagation
│   ├── api/
│   │   ├── handlers.go        # HTTP handlers with tracing
│   │   ├── middleware.go      # OTel middleware
│   │   └── websocket.go
│   ├── collector/
│   │   ├── otlp_receiver.go   # Receive OTLP data
│   │   ├── correlator.go      # Correlate traces/metrics/logs
│   │   └── analyzer.go        # Flow analysis
│   └── storage/
│       ├── memory.go
│       └── redis.go
├── go.mod
└── Dockerfile
```

**Implementación del tracer:**

```go
// internal/otel/tracer.go
package otel

import (
    "context"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
)

func InitTracer(ctx context.Context, serviceName, collectorEndpoint string) (*sdktrace.TracerProvider, error) {
    // Create OTLP exporter
    exporter, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint(collectorEndpoint),
        otlptracegrpc.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }

    // Create resource
    res, err := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceName(serviceName),
            semconv.ServiceVersion("1.0.0"),
            semconv.DeploymentEnvironment("production"),
        ),
    )
    if err != nil {
        return nil, err
    }

    // Create tracer provider
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(res),
        sdktrace.WithSampler(sdktrace.AlwaysSample()),
    )

    // Set global tracer provider
    otel.SetTracerProvider(tp)

    // Set global propagator
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))

    return tp, nil
}
```

**Middleware con tracing:**

```go
// internal/api/middleware.go
package api

import (
    "github.com/gin-gonic/gin"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/trace"
)

func TracingMiddleware() gin.HandlerFunc {
    tracer := otel.Tracer("gateway-debugger")
    
    return func(c *gin.Context) {
        ctx, span := tracer.Start(c.Request.Context(), c.Request.URL.Path,
            trace.WithAttributes(
                attribute.String("http.method", c.Request.Method),
                attribute.String("http.url", c.Request.URL.String()),
                attribute.String("http.user_agent", c.Request.UserAgent()),
            ),
        )
        defer span.End()

        // Inject context
        c.Request = c.Request.WithContext(ctx)

        // Process request
        c.Next()

        // Add response attributes
        span.SetAttributes(
            attribute.Int("http.status_code", c.Writer.Status()),
            attribute.Int("http.response_size", c.Writer.Size()),
        )

        if len(c.Errors) > 0 {
            span.RecordError(c.Errors.Last())
        }
    }
}
```

**Handler con tracing manual:**

```go
// internal/api/handlers.go
func (h *Handler) GetTraces(c *gin.Context) {
    ctx := c.Request.Context()
    tracer := otel.Tracer("gateway-debugger")
    
    ctx, span := tracer.Start(ctx, "GetTraces")
    defer span.End()
    
    // Add custom attributes
    limit := getQueryInt(c, "limit", 100)
    span.SetAttributes(attribute.Int("query.limit", limit))
    
    // Fetch from storage (with child span)
    ctx, fetchSpan := tracer.Start(ctx, "storage.GetAllTraces")
    traces := h.store.GetAllTraces()
    fetchSpan.SetAttributes(attribute.Int("traces.count", len(traces)))
    fetchSpan.End()
    
    // Apply limit
    if len(traces) > limit {
        traces = traces[:limit]
    }
    
    c.JSON(http.StatusOK, gin.H{
        "traces": traces,
        "count":  len(traces),
    })
}
```

---

### 3. Métricas Personalizadas

```go
// internal/otel/metrics.go
package otel

import (
    "context"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/prometheus"
    "go.opentelemetry.io/otel/metric"
    sdkmetric "go.opentelemetry.io/otel/sdk/metric"
)

type Metrics struct {
    RequestCounter    metric.Int64Counter
    RequestDuration   metric.Float64Histogram
    ActiveConnections metric.Int64UpDownCounter
    ErrorCounter      metric.Int64Counter
}

func InitMetrics(ctx context.Context) (*Metrics, error) {
    // Create Prometheus exporter
    exporter, err := prometheus.New()
    if err != nil {
        return nil, err
    }

    // Create meter provider
    provider := sdkmetric.NewMeterProvider(
        sdkmetric.WithReader(exporter),
    )
    otel.SetMeterProvider(provider)

    // Get meter
    meter := provider.Meter("gateway-debugger")

    // Create metrics
    requestCounter, _ := meter.Int64Counter(
        "http.server.requests",
        metric.WithDescription("Total HTTP requests"),
        metric.WithUnit("{request}"),
    )

    requestDuration, _ := meter.Float64Histogram(
        "http.server.duration",
        metric.WithDescription("HTTP request duration"),
        metric.WithUnit("ms"),
    )

    activeConnections, _ := meter.Int64UpDownCounter(
        "http.server.active_connections",
        metric.WithDescription("Active HTTP connections"),
        metric.WithUnit("{connection}"),
    )

    errorCounter, _ := meter.Int64Counter(
        "http.server.errors",
        metric.WithDescription("HTTP errors"),
        metric.WithUnit("{error}"),
    )

    return &Metrics{
        RequestCounter:    requestCounter,
        RequestDuration:   requestDuration,
        ActiveConnections: activeConnections,
        ErrorCounter:      errorCounter,
    }, nil
}
```

**Uso en handlers:**

```go
func (h *Handler) GetTraces(c *gin.Context) {
    start := time.Now()
    
    // Increment active connections
    h.metrics.ActiveConnections.Add(c.Request.Context(), 1,
        metric.WithAttributes(attribute.String("endpoint", "/api/traces")))
    defer h.metrics.ActiveConnections.Add(c.Request.Context(), -1,
        metric.WithAttributes(attribute.String("endpoint", "/api/traces")))
    
    // ... handler logic ...
    
    // Record duration
    duration := time.Since(start).Milliseconds()
    h.metrics.RequestDuration.Record(c.Request.Context(), float64(duration),
        metric.WithAttributes(
            attribute.String("method", c.Request.Method),
            attribute.String("endpoint", "/api/traces"),
            attribute.Int("status", c.Writer.Status()),
        ))
    
    // Increment counter
    h.metrics.RequestCounter.Add(c.Request.Context(), 1,
        metric.WithAttributes(
            attribute.String("method", c.Request.Method),
            attribute.String("endpoint", "/api/traces"),
            attribute.Int("status", c.Writer.Status()),
        ))
}
```

---

### 4. Logs Estructurados con OTel

```go
// internal/otel/logger.go
package otel

import (
    "go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
    "go.opentelemetry.io/otel/log/global"
    sdklog "go.opentelemetry.io/otel/sdk/log"
)

func InitLogger(ctx context.Context, collectorEndpoint string) (*sdklog.LoggerProvider, error) {
    exporter, err := otlploggrpc.New(ctx,
        otlploggrpc.WithEndpoint(collectorEndpoint),
        otlploggrpc.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }

    provider := sdklog.NewLoggerProvider(
        sdklog.WithProcessor(sdklog.NewBatchProcessor(exporter)),
    )

    global.SetLoggerProvider(provider)
    return provider, nil
}
```

---

## 📈 Dashboards de Grafana

### Dashboard 1: Service Overview (RED Metrics)

```json
{
  "dashboard": {
    "title": "Gateway Debugger - Service Overview",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_server_requests_total[5m])",
            "legendFormat": "{{method}} {{endpoint}}"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_server_requests_total{status=~\"5..\"}[5m]) / rate(http_server_requests_total[5m])",
            "legendFormat": "Error %"
          }
        ]
      },
      {
        "title": "Duration (p50, p95, p99)",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(http_server_duration_bucket[5m]))",
            "legendFormat": "p50"
          },
          {
            "expr": "histogram_quantile(0.95, rate(http_server_duration_bucket[5m]))",
            "legendFormat": "p95"
          },
          {
            "expr": "histogram_quantile(0.99, rate(http_server_duration_bucket[5m]))",
            "legendFormat": "p99"
          }
        ]
      }
    ]
  }
}
```

### Dashboard 2: Trace Analysis

- **Service Map**: Visualización de dependencias
- **Trace Timeline**: Waterfall de spans
- **Error Attribution**: Dónde fallan los requests
- **Slow Queries**: Top 10 traces más lentos

### Dashboard 3: SLO Dashboard

```yaml
SLOs:
  - name: "API Availability"
    target: 99.9%
    metric: "success_rate"
    
  - name: "API Latency"
    target: "p95 < 100ms"
    metric: "http_server_duration"
    
  - name: "Error Budget"
    remaining: "45 minutes/month"
```

---

## 🚀 Implementación Paso a Paso

### Fase 1: Setup Básico (Semana 1)

```bash
# 1. Actualizar docker-compose.yml
# 2. Agregar OTel Collector
# 3. Configurar Jaeger + Prometheus + Loki
# 4. Instrumentar backend con OTel SDK
```

### Fase 2: Tracing Completo (Semana 2)

```bash
# 1. Implementar auto-instrumentation
# 2. Agregar spans manuales en puntos críticos
# 3. Configurar tail sampling
# 4. Crear dashboards de traces
```

### Fase 3: Métricas Avanzadas (Semana 3)

```bash
# 1. Implementar métricas personalizadas
# 2. Configurar span metrics processor
# 3. Crear dashboards RED/USE
# 4. Configurar alertas
```

### Fase 4: Logs y Correlación (Semana 4)

```bash
# 1. Integrar logs estructurados
# 2. Correlacionar logs con traces
# 3. Configurar Loki
# 4. Crear dashboards de logs
```

---

## 📦 Docker Compose Actualizado

Ver archivo: `docker-compose-otel.yml`

---

## 🎯 Próximos Pasos

1. ✅ Revisar este documento
2. ⏳ Implementar OTel Collector config
3. ⏳ Actualizar backend con OTel SDK
4. ⏳ Crear dashboards de Grafana
5. ⏳ Configurar alertas
6. ⏳ Testing end-to-end

---

**Este es un trabajo MONUMENTAL pero transformará el Gateway Debugger en una plataforma de observabilidad de clase mundial** 🚀
