# ✨ Gateway Debugger: Arquitectura de Observabilidad Dinámica End-to-End

Este documento consolida la arquitectura implementada en el sistema para permitir el ciclo completo de debug, recolección de trazas y métricas desde Envoy Puro, interactuando nativamente con los CRDs del Univision Gateway Operator.

## 1. El Problema Base
En escenarios complejos, cuando un Endpoint (`ApiRoute` de K8s) reporta lentitud o errores JWT, la observabilidad general a menudo es insuficiente (ej: por bajo `SamplingRate`). Habilitar logs en `debug` globales para captar un fallo de una ruta colapsaría el clúster.

## 2. La Solución: RouteDebugOverride
La telemetría en el *Gateway Debugger* se maneja como un Override inyectado a nivel de la regla de ruteo individual dentro del CRD `ApiRoute`.

### Estructura en el CRD `ApiRoute`
Hemos agregado una propiedad `debugOverride` directamente a las Reglas (`RouteRule`).

```yaml
spec:
  rules:
    - name: payments
      matches:
        - path: { value: "/api/payments" }
      targetRef: { name: payments-backend }
      debugOverride:
        samplingRate: 100
        logLevel: debug
        customTags:
          debug_session: user_pedro
```

### Respuesta del xDS Controller (`rds_builder.go`)
Cuando el Operator (`rds_builder.go`) lee esta regla con un `DebugOverride`, reacciona inyectando:
1. **Forzado de Muestreo (Trace Bypass):** Adjuntando un Request Header `x-envoy-force-trace: true` (que intercepta Envoy para omitir la muestra aleatoria y generar un Span del 100% de la carga para esta ruta concreta).
2. **Tags Personalizados:** A través del mecanismo de cabeceras en el Route Action `RequestHeadersToAdd`, que luego son extraídos por el Tracing Filter de Envoy o Lua de logging (ej. `x-debug-debug_session: user_pedro`).

## 3. Clientes del Backend del Gateway Debugger

El backend en Go cuenta con clientes oficiales para controlar e interactuar con toda esta infraestructura:

- **`clients/k8s_client.go`**: Permite al UI aplicar ("PATCH") el override dinámico (el bloque `debugOverride`) solo para una Regla (ej. `payments`), sin destruir el CRD, empleando `dynamic.Interface` de la librería `client-go`.
- **`clients/tempo_client.go`**: Interfaz con la API de Tempo (Grafana) para traer los Spans de la sesión recién capturada y armar el mapa de tiempo (Service Graphs).
- **`clients/jaeger_client.go`**: Interfaz opcional o complementaria con la UI de Jaeger, consumiendo traces o convirtiendo los formatos con tags de `debugOverride`.
- **`clients/prometheus_client.go`**: Consulta instantánea o en rangos temporales para analizar Error Rates de un path en específico con `histogram_quantile`.
- **`clients/loki_client.go`**: Permite unir un `TraceID` capturado de Tempo para traerse todos los Access Logs generados durante ese milisegundo por Envoy (vía correlación JSON).

## 4. Flujo End-to-End para el Usuario Final

1. **(UI Debugger)** El desarrollador entra a la plataforma e identifica una falla en `/api/payments`.
2. **(Debugger Backend)** Llama a `ApplyDebugOverride("my-namespace", "my-api-route", "payments", cfg, false)` a través de K8s Client.
3. **(K8s API)** Modifica el YAML interno añadiendo `debugOverride` a la ruta `payments`.
4. **(Operator xDS)** Recalcula y envía un RDS (Route Discovery Service) nuevo a Envoy, forzando `x-envoy-force-trace`.
5. **(Envoy Puro)** Envía Spans de todo el tráfico que pasa por `/api/payments` hacia OTel Collector.
6. **(OTel Collector)** Procesa los datos a Tempo (traces), Loki (logs) y Prometheus (métricas).
7. **(Debugger Backend)** El desarrollador presiona "Analizar". El Backend consume `TempoClient` y `LokiClient`, y expone los Spans al Frontend.
8. **(UI Debugger)** Una vez solucionado, presiona "Detener Debug". El K8s Client ejecuta de nuevo `ApplyDebugOverride(..., true)`, removiendo el override y volviendo todo a la normalidad (sin reinicios del Envoy).

¡Con esto completamos una infraestructura monumetal y pura, 100% cloud-native!