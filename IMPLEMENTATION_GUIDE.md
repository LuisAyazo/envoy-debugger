# 🚀 Guía de Implementación - OpenTelemetry Observability Stack

## 📋 Resumen

Esta guía te llevará paso a paso para implementar el stack completo de observabilidad con OpenTelemetry para el Gateway Debugger.

---

## 🎯 Objetivos

Al finalizar esta guía tendrás:

1. ✅ Stack completo de observabilidad corriendo localmente
2. ✅ OpenTelemetry Collector configurado
3. ✅ Jaeger, Prometheus, Loki, Tempo y Grafana integrados
4. ✅ Backend instrumentado con OTel SDK
5. ✅ Dashboards de Grafana funcionando
6. ✅ Traces, métricas y logs correlacionados

---

## 📦 Prerequisitos

### Software Requerido

```bash
# Docker y Docker Compose
docker --version  # >= 20.10
docker-compose --version  # >= 2.0

# Go (para desarrollo del backend)
go version  # >= 1.21

# Node.js (para desarrollo del frontend)
node --version  # >= 18.0
npm --version   # >= 9.0

# Make (opcional pero recomendado)
make --version
```

### Recursos del Sistema

- **RAM**: Mínimo 8GB (recomendado 16GB)
- **CPU**: Mínimo 4 cores
- **Disco**: 10GB libres

---

## 🏗️ Fase 1: Setup Inicial (15 minutos)

### 1.1 Clonar y Preparar el Proyecto

```bash
cd gateway-debugger

# Verificar que todos los archivos de configuración existen
ls -la *.yaml *.yml
# Deberías ver:
# - docker-compose-otel.yml
# - otel-collector-config.yaml
# - prometheus-otel.yml
# - loki-config.yaml
# - tempo-config.yaml
```

### 1.2 Crear Directorios Necesarios

```bash
# Crear directorios para logs y datos
mkdir -p logs
mkdir -p grafana/dashboards
mkdir -p grafana/provisioning/datasources
mkdir -p grafana/provisioning/dashboards

# Verificar estructura
tree -L 2 grafana/
```

### 1.3 Configurar Variables de Entorno

```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Editar variables
cat > .env << 'EOF'
# Environment
ENVIRONMENT=development

# Ports
BACKEND_PORT=8080
FRONTEND_PORT=3000
GRAFANA_PORT=3001
PROMETHEUS_PORT=9090
JAEGER_PORT=16686
LOKI_PORT=3100
OTEL_COLLECTOR_PORT=4317

# OpenTelemetry
OTEL_SERVICE_NAME=gateway-debugger
OTEL_LOG_LEVEL=debug
EOF
```

---

## 🐳 Fase 2: Levantar el Stack (10 minutos)

### 2.1 Iniciar Servicios de Observabilidad

```bash
# Iniciar solo los servicios de observabilidad primero
docker-compose -f docker-compose-otel.yml up -d \
  otel-collector \
  jaeger \
  prometheus \
  loki \
  tempo \
  grafana

# Verificar que están corriendo
docker-compose -f docker-compose-otel.yml ps

# Ver logs
docker-compose -f docker-compose-otel.yml logs -f otel-collector
```

### 2.2 Verificar Health Checks

```bash
# OpenTelemetry Collector
curl http://localhost:13133/

# Jaeger
curl http://localhost:14269/

# Prometheus
curl http://localhost:9090/-/healthy

# Loki
curl http://localhost:3100/ready

# Tempo
curl http://localhost:3200/ready

# Grafana
curl http://localhost:3001/api/health
```

### 2.3 Acceder a las UIs

Abre en tu navegador:

- **Grafana**: http://localhost:3001 (admin/admin)
- **Jaeger**: http://localhost:16686
- **Prometheus**: http://localhost:9090
- **OTel Collector zPages**: http://localhost:55679/debug/tracez

---

## 🔧 Fase 3: Instrumentar el Backend (30 minutos)

### 3.1 Actualizar go.mod

```bash
cd backend

# Agregar dependencias de OpenTelemetry
go get go.opentelemetry.io/otel@latest
go get go.opentelemetry.io/otel/sdk@latest
go get go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc@latest
go get go.opentelemetry.io/otel/exporters/prometheus@latest
go get go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin@latest
```

### 3.2 Crear Módulo de OTel

```bash
# Crear directorio
mkdir -p internal/otel

# Crear archivo tracer.go
cat > internal/otel/tracer.go << 'EOF'
package otel

import (
    "context"
    "log"
    
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
    "go.opentelemetry.io/otel/propagation"
    "go.opentelemetry.io/otel/sdk/resource"
    sdktrace "go.opentelemetry.io/otel/sdk/trace"
    semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
)

func InitTracer(ctx context.Context, serviceName, endpoint string) (*sdktrace.TracerProvider, error) {
    exporter, err := otlptracegrpc.New(ctx,
        otlptracegrpc.WithEndpoint(endpoint),
        otlptracegrpc.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }

    res, err := resource.New(ctx,
        resource.WithAttributes(
            semconv.ServiceName(serviceName),
            semconv.ServiceVersion("1.0.0"),
        ),
    )
    if err != nil {
        return nil, err
    }

    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(res),
        sdktrace.WithSampler(sdktrace.AlwaysSample()),
    )

    otel.SetTracerProvider(tp)
    otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
        propagation.TraceContext{},
        propagation.Baggage{},
    ))

    log.Println("✅ OpenTelemetry tracer initialized")
    return tp, nil
}
EOF
```

### 3.3 Actualizar main.go

```bash
# Editar cmd/debugger/main.go para inicializar OTel
# Ver ejemplo completo en OTEL_OBSERVABILITY_COMPLETE_ARCHITECTURE.md
```

### 3.4 Agregar Middleware de Tracing

```bash
# Usar otelgin para auto-instrumentación
# En tu router Gin:
# router.Use(otelgin.Middleware("gateway-debugger"))
```

### 3.5 Build y Run

```bash
# Build
go build -o debugger cmd/debugger/main.go

# Run localmente (para testing)
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317 ./debugger

# O con docker-compose
cd ..
docker-compose -f docker-compose-otel.yml up -d backend
```

---

## 📊 Fase 4: Configurar Dashboards (20 minutos)

### 4.1 Verificar Datasources en Grafana

```bash
# Login a Grafana: http://localhost:3001
# Usuario: admin
# Password: admin

# Ir a Configuration > Data Sources
# Deberías ver:
# - Prometheus (default)
# - Loki
# - Jaeger
# - Tempo
```

### 4.2 Importar Dashboard de RED Metrics

1. En Grafana, ir a **Dashboards > Import**
2. Usar ID: **13639** (RED Metrics Dashboard)
3. Seleccionar datasource: **Prometheus**
4. Click **Import**

### 4.3 Crear Dashboard Personalizado

```bash
# Crear archivo de dashboard
cat > grafana/dashboards/gateway-overview.json << 'EOF'
{
  "dashboard": {
    "title": "Gateway Debugger - Overview",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_server_requests_total[5m])",
            "legendFormat": "{{method}} {{endpoint}}"
          }
        ]
      }
    ]
  }
}
EOF
```

### 4.4 Verificar Dashboards

- Ir a **Dashboards > Browse**
- Deberías ver la carpeta "Gateway Debugger"
- Abrir el dashboard y verificar que muestra datos

---

## 🧪 Fase 5: Testing End-to-End (15 minutos)

### 5.1 Generar Tráfico de Prueba

```bash
# Script para generar requests
cat > test-traffic.sh << 'EOF'
#!/bin/bash

echo "🚀 Generando tráfico de prueba..."

for i in {1..100}; do
  # Request exitoso
  curl -s http://localhost:8080/api/traces > /dev/null
  
  # Request con error (404)
  curl -s http://localhost:8080/api/nonexistent > /dev/null
  
  # Request lento (simulado)
  curl -s http://localhost:8080/api/slow > /dev/null
  
  echo "Request $i enviado"
  sleep 0.1
done

echo "✅ Tráfico generado"
EOF

chmod +x test-traffic.sh
./test-traffic.sh
```

### 5.2 Verificar Traces en Jaeger

1. Abrir http://localhost:16686
2. Seleccionar servicio: **gateway-debugger-backend**
3. Click **Find Traces**
4. Deberías ver los traces generados
5. Click en un trace para ver detalles

### 5.3 Verificar Métricas en Prometheus

```bash
# Query en Prometheus
# http://localhost:9090/graph

# Queries de ejemplo:
rate(http_server_requests_total[5m])
histogram_quantile(0.95, rate(http_server_duration_bucket[5m]))
```

### 5.4 Verificar Logs en Loki

1. En Grafana, ir a **Explore**
2. Seleccionar datasource: **Loki**
3. Query: `{service_name="gateway-debugger"}`
4. Deberías ver logs estructurados

### 5.5 Verificar Correlación

1. En Grafana Explore, seleccionar **Jaeger**
2. Buscar un trace
3. Click en "Logs for this span" → debería abrir Loki con logs correlacionados
4. Click en "Metrics for this span" → debería mostrar métricas en Prometheus

---

## 📈 Fase 6: Dashboards Avanzados (Opcional)

### 6.1 Service Map

En Grafana:
1. Ir a **Explore**
2. Seleccionar **Tempo** o **Jaeger**
3. Buscar traces
4. Click en **Node Graph** para ver el service map

### 6.2 SLO Dashboard

```bash
# Crear dashboard de SLOs
# Ver ejemplo en grafana/dashboards/slo-dashboard.json
```

---

## 🐛 Troubleshooting

### Problema: OTel Collector no recibe traces

```bash
# Verificar logs
docker-compose -f docker-compose-otel.yml logs otel-collector

# Verificar que el backend está enviando a la dirección correcta
# Debe ser: otel-collector:4317 (dentro de Docker)
# O: localhost:4317 (si backend corre fuera de Docker)

# Verificar zPages
curl http://localhost:55679/debug/tracez
```

### Problema: Grafana no muestra datos

```bash
# Verificar datasources
curl http://localhost:3001/api/datasources

# Verificar que Prometheus tiene datos
curl http://localhost:9090/api/v1/query?query=up

# Verificar logs de Grafana
docker-compose -f docker-compose-otel.yml logs grafana
```

### Problema: Alto uso de memoria

```bash
# Ajustar límites en otel-collector-config.yaml
# memory_limiter:
#   limit_mib: 256  # Reducir de 512

# Ajustar retención en prometheus-otel.yml
# --storage.tsdb.retention.time=7d  # Reducir de 30d

# Restart servicios
docker-compose -f docker-compose-otel.yml restart
```

---

## 📚 Próximos Pasos

1. **Producción**: Migrar a Kubernetes (ver k8s/)
2. **Alertas**: Configurar Alertmanager
3. **Long-term Storage**: Configurar Cortex o Thanos
4. **Custom Metrics**: Agregar métricas de negocio
5. **Advanced Sampling**: Ajustar tail sampling policies

---

## 🎓 Recursos Adicionales

- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Grafana Dashboards](https://grafana.com/grafana/dashboards/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)

---

## ✅ Checklist de Implementación

- [ ] Stack de observabilidad corriendo
- [ ] Backend instrumentado con OTel
- [ ] Traces visibles en Jaeger
- [ ] Métricas en Prometheus
- [ ] Logs en Loki
- [ ] Dashboards en Grafana
- [ ] Correlación funcionando
- [ ] Testing end-to-end exitoso

---

**¡Felicidades! Ahora tienes un stack de observabilidad de clase mundial** 🎉
