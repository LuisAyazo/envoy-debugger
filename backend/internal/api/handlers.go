package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"gateway-debugger/internal/storage"

	"github.com/gin-gonic/gin"
)

// Handler maneja los endpoints HTTP del Gateway Debugger.
// Expone dos conjuntos de endpoints:
//  1. /api/requests/* - RequestTrace correlacionados (nuevo sistema)
//  2. /api/traces/*   - Traces legacy (compatibilidad hacia atrás)
type Handler struct {
	store        *storage.MemoryStore
	requestStore *storage.RequestStore
}

// NewHandler crea un handler con solo el MemoryStore legacy
func NewHandler(store *storage.MemoryStore) *Handler {
	return &Handler{
		store: store,
	}
}

// NewHandlerWithRequestStore crea un handler con ambos stores
func NewHandlerWithRequestStore(store *storage.MemoryStore, requestStore *storage.RequestStore) *Handler {
	return &Handler{
		store:        store,
		requestStore: requestStore,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// RequestTrace endpoints (nuevo sistema de correlación)
// ─────────────────────────────────────────────────────────────────────────────

// GetRequests retorna los últimos N RequestTrace correlacionados
// GET /api/requests?limit=50
func (h *Handler) GetRequests(c *gin.Context) {
	if h.requestStore == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "request store not initialized"})
		return
	}

	limit := getQueryInt(c, "limit", 50)
	if limit > 500 {
		limit = 500
	}

	traces := h.requestStore.List(limit)
	c.JSON(http.StatusOK, gin.H{
		"requests": traces,
		"count":    len(traces),
	})
}

// GetRequestByID retorna un RequestTrace por request_id
// GET /api/requests/:id
func (h *Handler) GetRequestByID(c *gin.Context) {
	if h.requestStore == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "request store not initialized"})
		return
	}

	id := c.Param("id")
	rt, ok := h.requestStore.Get(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found", "request_id": id})
		return
	}
	c.JSON(http.StatusOK, rt)
}

// SearchRequests busca RequestTrace por método, path y status code
// GET /api/requests/search?method=GET&path=/api/v1/foo&min_status=400&max_status=599
func (h *Handler) SearchRequests(c *gin.Context) {
	if h.requestStore == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "request store not initialized"})
		return
	}

	method := strings.ToUpper(c.Query("method"))
	path := c.Query("path")
	minStatus := getQueryInt(c, "min_status", 0)
	maxStatus := getQueryInt(c, "max_status", 0)

	results := h.requestStore.Search(method, path, minStatus, maxStatus)
	c.JSON(http.StatusOK, gin.H{
		"requests": results,
		"count":    len(results),
	})
}

// GetRequestStats retorna estadísticas del store de requests
// GET /api/requests/stats
func (h *Handler) GetRequestStats(c *gin.Context) {
	if h.requestStore == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "request store not initialized"})
		return
	}

	stats := h.requestStore.Stats()
	c.JSON(http.StatusOK, stats)
}

// GetRequestFlow retorna el flujo de fases de un request específico
// GET /api/requests/:id/flow
func (h *Handler) GetRequestFlow(c *gin.Context) {
	if h.requestStore == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "request store not initialized"})
		return
	}

	id := c.Param("id")
	rt, ok := h.requestStore.Get(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "request not found", "request_id": id})
		return
	}

	// Construir respuesta de flujo enriquecida
	flow := buildFlowResponse(rt)
	c.JSON(http.StatusOK, flow)
}

// buildFlowResponse construye la respuesta de flujo para el frontend
func buildFlowResponse(rt *storage.RequestTrace) map[string]interface{} {
	// Indexar los phase_start y response_phase_start por nombre de fase
	// para poder cruzarlos con sus respectivos phase_end / response_phase_end
	phaseStartHeaders := map[string]map[string]string{}
	respPhaseStartHeaders := map[string]map[string]string{}
	for _, p := range rt.Phases {
		if p.Event == "phase_start" && len(p.HeadersBefore) > 0 {
			phaseStartHeaders[p.Phase] = p.HeadersBefore
		}
		if p.Event == "response_phase_start" && len(p.HeadersBefore) > 0 {
			respPhaseStartHeaders[p.Phase] = p.HeadersBefore
		}
	}

	phases := make([]map[string]interface{}, 0, len(rt.Phases))
	for _, p := range rt.Phases {
		phase := map[string]interface{}{
			"phase":     p.Phase,
			"event":     p.Event,
			"timestamp": p.Timestamp,
		}
		if p.Request != nil {
			phase["request"] = p.Request
		}
		if len(p.HeadersBefore) > 0 {
			phase["headers_before"] = p.HeadersBefore
		}
		if len(p.HeadersAfter) > 0 {
			phase["headers_after"] = p.HeadersAfter
		}
		// Para phase_end: inyectar headers_before del phase_start correspondiente
		// Esto permite al frontend calcular el diff interno (qué cambió en esta fase)
		if p.Event == "phase_end" && len(p.HeadersBefore) == 0 {
			if startHdrs, ok := phaseStartHeaders[p.Phase]; ok {
				phase["headers_before"] = startHdrs
			}
		}
		// Para response_phase_end: inyectar headers_before del response_phase_start correspondiente
		if p.Event == "response_phase_end" && len(p.HeadersBefore) == 0 {
			if startHdrs, ok := respPhaseStartHeaders[p.Phase]; ok {
				phase["headers_before"] = startHdrs
			}
		}
		if len(p.JWTClaims) > 0 {
			phase["jwt_claims"] = p.JWTClaims
		}
		// Incluir request_body si está disponible (solo en phase_start)
		if p.RequestBody != "" {
			phase["request_body"] = p.RequestBody
		}
		// Incluir response_body si está disponible (solo en response_phase_end)
		if p.ResponseBody != "" {
			phase["response_body"] = p.ResponseBody
		}
		// Incluir mensaje cuando el body existe pero supera 32KB
		if p.ResponseBodySkipped != "" {
			phase["response_body_skipped"] = p.ResponseBodySkipped
		}
		phases = append(phases, phase)
	}

	result := map[string]interface{}{
		"request_id":          rt.RequestID,
		"trace_id":            rt.TraceID,
		"traceparent":         rt.Traceparent,
		"method":              rt.Method,
		"path":                rt.Path,
		"authority":           rt.Authority,
		"user_agent":          rt.UserAgent,
		"status_code":         rt.StatusCode,
		"duration_ms":         rt.DurationMs,
		"start_time":          rt.StartTime,
		"end_time":            rt.EndTime,
		"upstream_host":       rt.UpstreamHost,
		"upstream_cluster":    rt.UpstreamCluster,
		"response_flags":      rt.ResponseFlags,
		"downstream_ip":       rt.DownstreamIP,
		"jwt_claims":          rt.JWTClaims,
		"request_headers":     rt.RequestHeaders,
		"phases":              phases,
		"errors":              rt.Errors,
		"access_log_received": rt.AccessLogReceived,
	}
	if rt.ErrorResponseBody != "" {
		result["error_response_body"] = rt.ErrorResponseBody
	}
	return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy endpoints (compatibilidad hacia atrás con el frontend existente)
// ─────────────────────────────────────────────────────────────────────────────

// GetTraces returns all traces (legacy)
func (h *Handler) GetTraces(c *gin.Context) {
	limit := getQueryInt(c, "limit", 100)
	traces := h.store.GetAllTraces()

	// Apply limit
	if len(traces) > limit {
		traces = traces[:limit]
	}

	c.JSON(http.StatusOK, gin.H{
		"traces": traces,
		"count":  len(traces),
	})
}

// CreateTrace creates a new trace (legacy)
func (h *Handler) CreateTrace(c *gin.Context) {
	var trace storage.Trace
	if err := c.BindJSON(&trace); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set timestamp if not provided
	if trace.Timestamp.IsZero() {
		trace.Timestamp = time.Now()
	}

	h.store.StoreTrace(&trace)
	c.JSON(http.StatusCreated, gin.H{
		"message": "trace created",
		"id":      trace.TraceID,
	})
}

// GetTraceByID returns a trace by ID (legacy)
func (h *Handler) GetTraceByID(c *gin.Context) {
	id := c.Param("id")
	trace := h.store.GetTrace(id)
	if trace == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
		return
	}
	c.JSON(http.StatusOK, trace)
}

// GetMetrics returns all metrics (legacy)
func (h *Handler) GetMetrics(c *gin.Context) {
	metrics := h.store.GetAllMetrics()
	c.JSON(http.StatusOK, gin.H{
		"metrics": metrics,
		"count":   len(metrics),
	})
}

// CreateMetric creates a new metric (legacy)
func (h *Handler) CreateMetric(c *gin.Context) {
	var metric storage.MetricPoint
	if err := c.BindJSON(&metric); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if metric.Timestamp.IsZero() {
		metric.Timestamp = time.Now()
	}

	h.store.StoreMetric(&metric)
	c.JSON(http.StatusCreated, gin.H{"message": "metric created"})
}

// GetLogs returns all logs (legacy)
func (h *Handler) GetLogs(c *gin.Context) {
	limit := getQueryInt(c, "limit", 100)
	level := c.Query("level")

	logs := h.store.GetAllLogs()

	// Filter by level if provided
	if level != "" {
		filtered := []storage.LogEntry{}
		for _, log := range logs {
			if log.Level == level {
				filtered = append(filtered, log)
			}
		}
		logs = filtered
	}

	// Apply limit
	if len(logs) > limit {
		logs = logs[:limit]
	}

	c.JSON(http.StatusOK, gin.H{
		"logs":  logs,
		"count": len(logs),
	})
}

// CreateLog creates a new log entry (legacy)
func (h *Handler) CreateLog(c *gin.Context) {
	var log storage.LogEntry
	if err := c.BindJSON(&log); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if log.Timestamp.IsZero() {
		log.Timestamp = time.Now()
	}

	h.store.StoreLog(&log)
	c.JSON(http.StatusCreated, gin.H{"message": "log created"})
}

// Helper functions
func getQueryInt(c *gin.Context, key string, defaultVal int) int {
	val := c.Query(key)
	if val == "" {
		return defaultVal
	}
	result, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return result
}
