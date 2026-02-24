# 🔧 Guía de Instrumentación del Backend con OpenTelemetry

## 📋 ¿Qué significa "Instrumentar el Backend"?

**Instrumentar** significa agregar código al backend (Go) para que automáticamente:

1. **Genere traces** de cada request HTTP
2. **Envíe métricas** de performance (latencia, errores, throughput)
3. **Emita logs estructurados** correlacionados con traces
4. **Propague contexto** entre servicios (trace_id, span_id)

Todo esto se hace usando el **OpenTelemetry SDK** que ya está configurado en el stack.

---

## 🎯 Objetivo

Transformar el backend actual de:

```go
// Backend SIN instrumentación
func GetTraces(c *gin.Context) {
    traces := store.GetAllTraces()
    c.JSON(200, traces)
}
```

A un backend CON instrumentación:

```go
// Backend CON instrumentación OpenTelemetry
func GetTraces(c *gin.Context) {
    ctx := c.Request.Context()
    tracer := otel.Tracer("gateway-debugger")
    
    // Crear span para esta operación
    ctx, span := tracer.Start(ctx, "GetTraces")
    defer span.End()
    
    // Agregar atributos al span
    span.SetAttributes(
        attribute.String("operation", "get_traces"),
        attribute.Int("limit", 100),
    )
    
    // Ejecutar lógica de negocio
    traces := store.GetAllTraces()
    
    // Registrar métricas
    metrics.RequestCounter.Add(ctx, 1)
    
    // Emitir log correlacionado
    logger.InfoContext(ctx, "Traces retrieved", 
        zap.Int("count", len(traces)))
    
    c.JSON(200, traces)
}
```

---

## 📦 Paso 1: Agregar Dependencias

### 1.1 Actualizar go.mod

```bash
cd backend

# Agregar dependencias de OpenTelemetry
go get go.opentelemetry.io/otel@latest
go get go.opentelemetry.io/otel/sdk@latest
go get go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc@latest
go get go.opentelemetry.io/otel/exporters/prometheus@latest
go get go.opentelemetry.io/otel/metric@latest
go get go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin@latest
go get go.uber.org/zap@latest
```

### 1.2 Verificar go.mod

Tu `go.mod` debería incluir:

```go
module gateway-debugger

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    go.opentelemetry.io/otel v1.24.0
    go.opentelemetry.io/otel/sdk v1.24.0
    go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.24.0
    go.opentelemetry.io/otel/exporters/prometheus v0.46.0
    go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin v0.49.0
    go.uber.org/zap v1.27.0
)
```

---

## 🏗️ Paso 2: Crear Módulo de Inicialización OTel

### 2.1 Crear estructura de directorios

```bash
mkdir -p internal/otel
```

### 2.2 Crear `internal/otel/tracer.go`

```go
package otel

import (
    "context"
    "log"
    "os"
    
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
)

// InitTracer inicializa el tracer de OpenTelemetry
func InitTracer(ctx context.Context) (*sdktrace.TracerProvider, error) {
    // Obtener configuración desde env vars
    serviceName := os.Getenv("OTEL_SERVICE_NAME")
    if serviceName == "" {
        serviceName = "gateway-debugger-backend"
    }
    
    collectorEndpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if collectorEndpoint == "" {
        collectorEndpoint = "otel-collector:4317"
    }
    
    // Crear exporter OTLP
    exporter, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint(collectorEndpoint),
        otlptracegrpc.WithInsecure(), // En producción usar TLS
    )
    if err != nil {
        return nil, err
    }
    
    // Crear resource con metadata del servicio
    res, err := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceName(serviceName),
            semconv.ServiceVersion("1.0.0"),
            semconv.DeploymentEnvironment(os.Getenv("ENVIRONMENT")),
        ),
    )
    if err != nil {
        return nil, err
    }
    
    // Crear TracerProvider
    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(res),
        sdktrace.WithSampler(sdktrace.AlwaysSample()), // En prod usar ParentBased
    )
    
    // Configurar como global
    otel.SetTracerProvider(tp)
    
    // Configurar propagadores (para distributed tracing)
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))
    
    log.Println("✅ OpenTelemetry tracer initialized")
    return tp, nil
}
```

### 2.3 Crear `internal/otel/metrics.go`

```go
package otel

import (
    "context"
    "log"
    
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

// InitMetrics inicializa las métricas de OpenTelemetry
func InitMetrics(ctx context.Context) (*Metrics, error) {
    // Crear exporter de Prometheus
    exporter, err := prometheus.New()
    if err != nil {
        return nil, err
    }
    
    // Crear MeterProvider
    provider := sdkmetric.NewMeterProvider(
        sdkmetric.WithReader(exporter),
    )
    otel.SetMeterProvider(provider)
    
    // Obtener meter
    meter := provider.Meter("gateway-debugger")
    
    // Crear métricas
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
    
    log.Println("✅ OpenTelemetry metrics initialized")
    
    return &Metrics{
        RequestCounter:    requestCounter,
        RequestDuration:   requestDuration,
        ActiveConnections: activeConnections,
        ErrorCounter:      errorCounter,
    }, nil
}
```

---

## 🚀 Paso 3: Actualizar main.go

### 3.1 Modificar `cmd/debugger/main.go`

```go
package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "time"

    "github.com/gin-gonic/gin"
    "go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
    
    "gateway-debugger/internal/api"
    "gateway-debugger/internal/otel"
    "gateway-debugger/internal/storage"
)

func main() {
    ctx := context.Background()
    
    // ========================================
    // 1. Inicializar OpenTelemetry
    // ========================================
    
    // Inicializar tracer
    tp, err := otel.InitTracer(ctx)
    if err != nil {
        log.Fatalf("Failed to initialize tracer: %v", err)
    }
    defer func() {
        if err := tp.Shutdown(ctx); err != nil {
            log.Printf("Error shutting down tracer: %v", err)
        }
    }()
    
    // Inicializar métricas
    metrics, err := otel.InitMetrics(ctx)
    if err != nil {
        log.Fatalf("Failed to initialize metrics: %v", err)
    }
    
    // ========================================
    // 2. Inicializar storage
    // ========================================
    store := storage.NewMemoryStore()
    defer store.Close()
    
    // ========================================
    // 3. Crear router Gin con middleware OTel
    // ========================================
    router := gin.Default()
    
    // Middleware de OpenTelemetry (AUTO-INSTRUMENTACIÓN)
    router.Use(otelgin.Middleware("gateway-debugger"))
    
    // ========================================
    // 4. Crear handlers con métricas
    // ========================================
    handlers := api.NewHandler(store, metrics)
    wsManager := api.NewWSManager()
    
    // Health check
    router.GET("/health", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"status": "healthy"})
    })
    
    // API routes
    apiGroup := router.Group("/api")
    {
        apiGroup.GET("/traces", handlers.GetTraces)
        apiGroup.POST("/traces", handlers.CreateTrace)
        apiGroup.GET("/traces/:id", handlers.GetTraceByID)
        
        apiGroup.GET("/metrics", handlers.GetMetrics)
        apiGroup.POST("/metrics", handlers.CreateMetric)
        
        apiGroup.GET("/logs", handlers.GetLogs)
        apiGroup.POST("/logs", handlers.CreateLog)
        
        apiGroup.GET("/flow/:trace-id", handlers.GetRequestFlow)
        apiGroup.GET("/ws", wsManager.HandleWebSocket)
    }
    
    // Prometheus metrics endpoint
    router.GET("/metrics", gin.WrapH(promhttp.Handler()))
    
    // ========================================
    // 5. Start server
    // ========================================
    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }
    
    srv := &http.Server{
        Addr:    ":" + port,
        Handler: router,
    }
    
    // Start WebSocket manager
    wsCtx, cancel := context.WithCancel(context.Background())
    defer cancel()
    go wsManager.Start(wsCtx)
    
    // Start server
    go func() {
        log.Printf("🚀 Server starting on port %s\n", port)
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("Server error: %s", err)
        }
    }()
    
    // Graceful shutdown
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, os.Interrupt)
    <-quit
    
    log.Println("⏹️  Shutting down server...")
    shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer shutdownCancel()
    
    if err := srv.Shutdown(shutdownCtx); err != nil {
        log.Fatalf("Server shutdown error: %s", err)
    }
    
    log.Println("✅ Server stopped")
}
```

---

## 📝 Paso 4: Instrumentar Handlers

### 4.1 Actualizar `internal/api/handlers.go`

```go
package api

import (
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/attribute"
    "go.opentelemetry.io/otel/metric"
    
    "gateway-debugger/internal/otel"
    "gateway-debugger/internal/storage"
)

type Handler struct {
    store   *storage.MemoryStore
    metrics *otel.Metrics
}

func NewHandler(store *storage.MemoryStore, metrics *otel.Metrics) *Handler {
    return &Handler{
        store:   store,
        metrics: metrics,
    }
}

// GetTraces con instrumentación completa
func (h *Handler) GetTraces(c *gin.Context) {
    start := time.Now()
    ctx := c.Request.Context()
    tracer := otel.Tracer("gateway-debugger")
    
    // Crear span manual (adicional al auto-generado por middleware)
    ctx, span := tracer.Start(ctx, "GetTraces")
    defer span.End()
    
    // Incrementar conexiones activas
    h.metrics.ActiveConnections.Add(ctx, 1,
        metric.WithAttributes(attribute.String("endpoint", "/api/traces")))
    defer h.metrics.ActiveConnections.Add(ctx, -1,
        metric.WithAttributes(attribute.String("endpoint", "/api/traces")))
    
    // Obtener parámetros
    limit := getQueryInt(c, "limit", 100)
    span.SetAttributes(attribute.Int("query.limit", limit))
    
    // Fetch from storage (con child span)
    ctx, fetchSpan := tracer.Start(ctx, "storage.GetAllTraces")
    traces := h.store.GetAllTraces()
    fetchSpan.SetAttributes(attribute.Int("traces.count", len(traces)))
    fetchSpan.End()
    
    // Apply limit
    if len(traces) > limit {
        traces = traces[:limit]
    }
    
    // Registrar métricas
    duration := time.Since(start).Milliseconds()
    h.metrics.RequestDuration.Record(ctx, float64(duration),
        metric.WithAttributes(
            attribute.String("method", c.Request.Method),
            attribute.String("endpoint", "/api/traces"),
            attribute.Int("status", http.StatusOK),
        ))
    
    h.metrics.RequestCounter.Add(ctx, 1,
        metric.WithAttributes(
            attribute.String("method", c.Request.Method),
            attribute.String("endpoint", "/api/traces"),
            attribute.Int("status", http.StatusOK),
        ))
    
    // Response
    c.JSON(http.StatusOK, gin.H{
        "traces": traces,
        "count":  len(traces),
    })
}
```

---

## ✅ Resultado Final

Después de instrumentar, tu backend:

### 1. **Genera Traces Automáticamente**

Cada request HTTP genera un trace con:
- Span principal del request
- Spans hijos de operaciones internas
- Atributos (method, path, status_code, etc)
- Timing preciso de cada operación

### 2. **Emite Métricas**

```promql
# Request rate
rate(http_server_requests_total[5m])

# Latency p95
histogram_quantile(0.95, rate(http_server_duration_bucket[5m]))

# Error rate
rate(http_server_errors_total[5m])

# Active connections
http_server_active_connections
```

### 3. **Logs Correlacionados**

Cada log incluye `trace_id` y `span_id` para correlación:

```json
{
  "level": "info",
  "msg": "Traces retrieved",
  "trace_id": "abc123...",
  "span_id": "def456...",
  "count": 42
}
```

### 4. **Visible en Grafana**

- **Jaeger**: Ver traces completos
- **Tempo**: Service graphs
- **Prometheus**: Métricas en dashboards
- **Loki**: Logs correlacionados

---

## 🎯 Comandos para Probar

```bash
# 1. Build backend con instrumentación
cd backend
go build -o debugger cmd/debugger/main.go

# 2. Run con variables de entorno
OTEL_SERVICE_NAME=gateway-debugger-backend \
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317 \
ENVIRONMENT=development \
./debugger

# 3. Generar requests
curl http://localhost:8080/api/traces

# 4. Ver traces en Jaeger
open http://localhost:16686

# 5. Ver métricas en Prometheus
open http://localhost:9090
```

---

## 📚 Resumen

**"Instrumentar el backend"** significa:

✅ Agregar librerías de OpenTelemetry al código Go  
✅ Inicializar tracer y metrics providers  
✅ Usar middleware para auto-instrumentación  
✅ Agregar spans manuales en operaciones críticas  
✅ Emitir métricas de negocio  
✅ Correlacionar logs con traces  

**Resultado**: Observabilidad completa sin cambiar la lógica de negocio 🚀
