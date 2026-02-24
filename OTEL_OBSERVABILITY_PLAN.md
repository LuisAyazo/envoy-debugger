# 🔭 Plan de Observabilidad con OpenTelemetry para Gateway Debugger

## 📋 Resumen Ejecutivo

Este documento describe la arquitectura y plan de implementación para integrar **OpenTelemetry (OTel)** completo en el Gateway Debugger, transformándolo en una plataforma de observabilidad de clase empresarial con:

- ✅ **Distributed Tracing** con OTel SDK
- ✅ **Metrics** con exportadores a Prometheus/Grafana
- ✅ **Logs** estructurados con correlación automática
- ✅ **Dashboards** avanzados (Grafana, Jaeger UI)
- ✅ **Alerting** basado en métricas y traces
- ✅ **Sampling inteligente** para reducir overhead
- ✅ **Context propagation** automático

---

## 🎯 Objetivos

### Objetivo Principal
Implementar observabilidad completa usando OpenTelemetry para capturar, correlacionar y visualizar **traces, metrics y logs** del Envoy Gateway en tiempo real.

### Objetivos Específicos
1. **Tracing**: Capturar 100% de requests con sampling inteligente
2. **Metrics**: Exportar métricas de latencia, throughput, errores a Prometheus
3. **Logs**: Correlacionar logs con traces usando trace-id
4. **Dashboards**: Crear dashboards en Grafana para visualización
5. **Alerting**: Configurar alertas para anomalías y errores
6. **Performance**: Mantener overhead < 5% en latencia

---

## 🏗️ Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Application                          │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │   Envoy Gateway        │
                    │  + OTel Collector      │
                    │  + Access Logs (JSON)  │
                    └────────────┬───────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
        ┌────────────────┐ ┌──────────┐ ┌──────────────┐
        │ OTel Collector │ │ Envoy    │ │ Prometheus   │
        │ (Sidecar)      │ │ Metrics  │ │ (Scrape)     │
        │ - Traces       │ │ (Stats)  │ │              │
        │ - Metrics      │ │          │ │              │
        │ - Logs         │ │          │ │              │
        └────────┬───────┘ └────┬─────┘ └──────┬───────┘
                 │               │              │
                 └───────┬───────┴──────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │  OTel Collector (Central)  │
            │  - Receive OTLP            │
            │  - Process & Transform     │
            │  - Export to backends      │
            └────────────┬───────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌────────────────┐ ┌──────────┐ ┌──────────────┐
│ Jaeger         │ │ Grafana  │ │ Loki         │
│ (Traces)       │ │ (Metrics)│ │ (Logs)       │
└────────────────┘ └──────────┘ └──────────────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                         ▼
            ┌────────────────────────────┐
            │  Gateway Debugger UI       │
            │  - Unified Dashboard       │
            │  - Trace Viewer            │
            │  - Metrics Charts          │
            │  - Log Correlation         │
            └────────────────────────────┘
```

---

## 📦 Componentes Principales

### 1. OpenTelemetry Collector (Central)

**Propósito**: Recibir, procesar y exportar telemetría desde múltiples fuentes.

**Configuración**:
```yaml
# gateway-debugger/otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  
  # Receive from Envoy access logs
  filelog:
    include: [/var/log/envoy/access.log]
    operators:
      - type: json_parser
        timestamp:
          parse_from: attributes.timestamp
          layout: '%Y-%m-%dT%H:%M:%S.%fZ'
  
  # Prometheus scraping
  prometheus:
    config:
      scrape_configs:
        - job_name: 'envoy-gateway'
          static_configs:
            - targets: ['envoy-gateway:9901']

processors:
  # Batch for efficiency
  batch:
    timeout: 10s
    send_batch_size: 1024
  
  # Add resource attributes
  resource:
    attributes:
      - key: service.name
        value: envoy-gateway
        action: upsert
      - key: deployment.environment
        from_attribute: env
        action: insert
  
  # Sampling for traces
  probabilistic_sampler:
    sampling_percentage: 10  # Sample 10% of traces
  
  # Tail sampling (keep all errors)
  tail_sampling:
    policies:
      - name: errors-policy
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow-requests
        type: latency
        latency:
          threshold_ms: 1000
      - name: sample-policy
        type: probabilistic
        probabilistic:
          sampling_percentage: 10

  # Attributes processor
  attributes:
    actions:
      - key: http.request.header.authorization
        action: delete  # Remove sensitive data
      - key: http.request.header.cookie
        action: delete

exporters:
  # Export traces to Jaeger
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true
  
  # Export metrics to Prometheus
  prometheus:
    endpoint: 0.0.0.0:8889
    namespace: envoy_gateway
  
  # Export logs to Loki
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
    labels:
      resource:
        service.name: "service_name"
        deployment.environment: "env"
  
  # Export to Gateway Debugger backend
  otlphttp:
    endpoint: http://gateway-debugger-backend:8080/v1/traces
    headers:
      X-API-Key: "${DEBUGGER_API_KEY}"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, resource, tail_sampling, attributes]
      exporters: [jaeger, otlphttp]
    
    metrics:
      receivers: [otlp, prometheus]
      processors: [batch, resource]
      exporters: [prometheus]
    
    logs:
      receivers: [otlp, filelog]
      processors: [batch, resource, attributes]
      exporters: [loki, otlphttp]
```

### 2. Envoy Gateway OTel Integration

**Configuración de Tracing en Envoy**:
```yaml
# k8s/envoy-otel-config.yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: otel-tracing
  namespace: envoy-gateway-system
spec:
  telemetry:
    # OpenTelemetry Tracing
    tracing:
      samplingRate: 100  # 100% sampling at Envoy level
      customTags:
        - literal:
            tag: environment
            value: production
        - requestHeader:
            tag: user-agent
            name: User-Agent
        - metadata:
            tag: route-name
            kind:
              route: {}
            metadataKey:
              key: envoy.route_name
      
      provider:
        type: OpenTelemetry
        backendRefs:
          - name: otel-collector
            namespace: observability
            port: 4317
        
    # Access Logs (JSON format)
    accessLog:
      settings:
        - format:
            type: JSON
            json:
              timestamp: "%START_TIME%"
              trace_id: "%REQ(X-B3-TRACEID)%"
              span_id: "%REQ(X-B3-SPANID)%"
              request_id: "%REQ(X-REQUEST-ID)%"
              method: "%REQ(:METHOD)%"
              path: "%REQ(:PATH)%"
              protocol: "%PROTOCOL%"
              response_code: "%RESPONSE_CODE%"
              response_flags: "%RESPONSE_FLAGS%"
              bytes_received: "%BYTES_RECEIVED%"
              bytes_sent: "%BYTES_SENT%"
              duration_ms: "%DURATION%"
              upstream_service_time: "%RESP(X-ENVOY-UPSTREAM-SERVICE-TIME)%"
              upstream_host: "%UPSTREAM_HOST%"
              upstream_cluster: "%UPSTREAM_CLUSTER%"
              user_agent: "%REQ(USER-AGENT)%"
              x_forwarded_for: "%REQ(X-FORWARDED-FOR)%"
              request_headers: "%REQ(:AUTHORITY)%"
              route_name: "%ROUTE_NAME%"
          sinks:
            - type: OpenTelemetry
              openTelemetry:
                host: otel-collector.observability.svc.cluster.local
                port: 4317
                resourceAttributes:
                  service.name: envoy-gateway
                  deployment.environment: production
```

### 3. Gateway Debugger Backend - OTel Integration

**Actualizar Backend para recibir OTLP**:

```go
// backend/internal/otel/receiver.go
package otel

import (
    "context"
    "go.opentelemetry.io/collector/pdata/ptrace"
    "go.opentelemetry.io/collector/pdata/pmetric"
    "go.opentelemetry.io/collector/pdata/plog"
    "gateway-debugger/internal/storage"
)

type OTelReceiver struct {
    store *storage.MemoryStore
}

func NewOTelReceiver(store *storage.MemoryStore) *OTelReceiver {
    return &OTelReceiver{store: store}
}

// ReceiveTraces handles incoming OTLP traces
func (r *OTelReceiver) ReceiveTraces(ctx context.Context, td ptrace.Traces) error {
    resourceSpans := td.ResourceSpans()
    
    for i := 0; i < resourceSpans.Len(); i++ {
        rs := resourceSpans.At(i)
        scopeSpans := rs.ScopeSpans()
        
        for j := 0; j < scopeSpans.Len(); j++ {
            ss := scopeSpans.At(j)
            spans := ss.Spans()
            
            for k := 0; k < spans.Len(); k++ {
                span := spans.At(k)
                
                // Convert to internal trace format
                trace := r.convertSpanToTrace(span)
                r.store.StoreTrace(trace)
            }
        }
    }
    
    return nil
}

// ReceiveMetrics handles incoming OTLP metrics
func (r *OTelReceiver) ReceiveMetrics(ctx context.Context, md pmetric.Metrics) error {
    resourceMetrics := md.ResourceMetrics()
    
    for i := 0; i < resourceMetrics.Len(); i++ {
        rm := resourceMetrics.At(i)
        scopeMetrics := rm.ScopeMetrics()
        
        for j := 0; j < scopeMetrics.Len(); j++ {
            sm := scopeMetrics.At(j)
            metrics := sm.Metrics()
            
            for k := 0; k < metrics.Len(); k++ {
                metric := metrics.At(k)
                
                // Convert and store
                metricPoint := r.convertMetric(metric)
                r.store.StoreMetric(metricPoint)
            }
        }
    }
    
    return nil
}

// ReceiveLogs handles incoming OTLP logs
func (r *OTelReceiver) ReceiveLogs(ctx context.Context, ld plog.Logs) error {
    resourceLogs := ld.ResourceLogs()
    
    for i := 0; i < resourceLogs.Len(); i++ {
        rl := resourceLogs.At(i)
        scopeLogs := rl.ScopeLogs()
        
        for j := 0; j < scopeLogs.Len(); j++ {
            sl := scopeLogs.At(j)
            logs := sl.LogRecords()
            
            for k := 0; k < logs.Len(); k++ {
                log := logs.At(k)
                
                // Convert and store
                logEntry := r.convertLog(log)
                r.store.StoreLog(logEntry)
            }
        }
    }
    
    return nil
}

func (r *OTelReceiver) convertSpanToTrace(span ptrace.Span) *storage.Trace {
    // Extract trace context
    traceID := span.TraceID().String()
    spanID := span.SpanID().String()
    
    // Extract attributes
    attrs := span.Attributes()
    requestID := ""
    if val, ok := attrs.Get("http.request_id"); ok {
        requestID = val.Str()
    }
    
    return &storage.Trace{
        TraceID:   traceID,
        RequestID: requestID,
        Timestamp: span.StartTimestamp().AsTime(),
        Duration:  span.EndTimestamp().AsTime().Sub(span.StartTimestamp().AsTime()),
        Spans: []storage.Span{
            {
                SpanID:        spanID,
                OperationName: span.Name(),
                Duration:      span.EndTimestamp().AsTime().Sub(span.StartTimestamp().AsTime()),
                Status:        span.Status().Code().String(),
                Tags:          convertAttributes(attrs),
            },
        },
    }
}
```

**Actualizar main.go para OTLP endpoint**:

```go
// backend/cmd/debugger/main.go
import (
    "go.opentelemetry.io/collector/receiver/otlpreceiver"
    "gateway-debugger/internal/otel"
)

func main() {
    // ... existing code ...
    
    // Create OTel receiver
    otelReceiver := otel.NewOTelReceiver(store)
    
    // OTLP endpoints
    apiGroup.POST("/v1/traces", func(c *gin.Context) {
        // Handle OTLP trace data
        var traceData []byte
        c.BindJSON(&traceData)
        // Process with otelReceiver
    })
    
    apiGroup.POST("/v1/metrics", func(c *gin.Context) {
        // Handle OTLP metrics
    })
    
    apiGroup.POST("/v1/logs", func(c *gin.Context) {
        // Handle OTLP logs
    })
    
    // ... rest of code ...
}
```

---

## 📊 Dashboards en Grafana

### Dashboard 1: Gateway Overview

```json
{
  "dashboard": {
    "title": "Envoy Gateway - Overview",
    "panels": [
      {
        "title": "Request Rate (RPS)",
        "targets": [
          {
            "expr": "rate(envoy_gateway_http_requests_total[5m])"
          }
        ],
        "type": "graph"
      },
      {
        "title": "P95 Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(envoy_gateway_http_request_duration_seconds_bucket[5m]))"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(envoy_gateway_http_requests_total{status_code=~\"5..\"}[5m])"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Active Connections",
        "targets": [
          {
            "expr": "envoy_gateway_downstream_cx_active"
          }
        ],
        "type": "stat"
      }
    ]
  }
}
```

### Dashboard 2: Trace Analysis

```json
{
  "dashboard": {
    "title": "Envoy Gateway - Trace Analysis",
    "panels": [
      {
        "title": "Trace Duration Distribution",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, rate(envoy_gateway_trace_duration_bucket[5m]))",
            "legendFormat": "p50"
          },
          {
            "expr": "histogram_quantile(0.95, rate(envoy_gateway_trace_duration_bucket[5m]))",
            "legendFormat": "p95"
          },
          {
            "expr": "histogram_quantile(0.99, rate(envoy_gateway_trace_duration_bucket[5m]))",
            "legendFormat": "p99"
          }
        ]
      },
      {
        "title": "Traces by Status",
        "targets": [
          {
            "expr": "sum by (status_code) (rate(envoy_gateway_traces_total[5m]))"
          }
        ],
        "type": "piechart"
      },
      {
        "title": "Failed Traces (Top Routes)",
        "targets": [
          {
            "expr": "topk(10, sum by (route) (rate(envoy_gateway_traces_total{status_code=~\"5..\"}[5m])))"
          }
        ],
        "type": "table"
      }
    ]
  }
}
```

### Dashboard 3: Filter Performance

```json
{
  "dashboard": {
    "title": "Envoy Gateway - Filter Performance",
    "panels": [
      {
        "title": "JWT Filter Latency",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(envoy_gateway_filter_duration_seconds_bucket{filter=\"jwt_auth\"}[5m]))"
          }
        ]
      },
      {
        "title": "JWT Validation Failures",
        "targets": [
          {
            "expr": "rate(envoy_gateway_jwt_validation_failures_total[5m])"
          }
        ]
      },
      {
        "title": "Circuit Breaker State",
        "targets": [
          {
            "expr": "envoy_gateway_circuit_breaker_open"
          }
        ],
        "type": "stat"
      }
    ]
  }
}
```

---

## 🚨 Alerting Rules

```yaml
# gateway-debugger/prometheus-alerts.yaml
groups:
  - name: envoy_gateway_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          rate(envoy_gateway_http_requests_total{status_code=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} for {{ $labels.route }}"
      
      # High latency
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, rate(envoy_gateway_http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "P95 latency is {{ $value }}s for {{ $labels.route }}"
      
      # JWT validation failures
      - alert: JWTValidationFailures
        expr: |
          rate(envoy_gateway_jwt_validation_failures_total[5m]) > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High JWT validation failure rate"
          description: "JWT failures: {{ $value }} per second"
      
      # Circuit breaker open
      - alert: CircuitBreakerOpen
        expr: |
          envoy_gateway_circuit_breaker_open == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Circuit breaker is open"
          description: "Circuit breaker for {{ $labels.upstream }} is open"
      
      # Low throughput
      - alert: LowThroughput
        expr: |
          rate(envoy_gateway_http_requests_total[5m]) < 1
        for: 10m
        labels:
          severity: info
        annotations:
          summary: "Low request throughput"
          description: "Request rate is {{ $value }} RPS"
```

---

## 🔧 Implementación por Fases

### Fase 1: Setup Básico (Semana 1-2)
- [x] Analizar arquitectura actual
- [ ] Instalar OTel Collector central
- [ ] Configurar Jaeger backend
- [ ] Configurar Prometheus + Grafana
- [ ] Configurar Loki para logs
- [ ] Crear docker-compose con stack completo

### Fase 2: Envoy Integration (Semana 3-4)
- [ ] Configurar Envoy tracing con OTel
- [ ] Configurar access logs en formato JSON
- [ ] Configurar métricas de Envoy
- [ ] Implementar context propagation
- [ ] Probar trace correlation

### Fase 3: Backend Integration (Semana 5-6)
- [ ] Implementar OTLP receiver en backend
- [ ] Actualizar storage para traces OTel
- [ ] Implementar correlación automática
- [ ] Crear API para queries de traces
- [ ] Implementar sampling inteligente

### Fase 4: Dashboards (Semana 7-8)
- [ ] Crear dashboard de overview
- [ ] Crear dashboard de trace analysis
- [ ] Crear dashboard de filter performance
- [ ] Crear dashboard de errors
