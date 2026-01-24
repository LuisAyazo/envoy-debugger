package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gateway-debugger/internal/storage"
)

type Handler struct {
	store *storage.MemoryStore
}

func NewHandler(store *storage.MemoryStore) *Handler {
	return &Handler{
		store: store,
	}
}

// GetTraces returns all traces
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

// CreateTrace creates a new trace
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

// GetTraceByID returns a trace by ID
func (h *Handler) GetTraceByID(c *gin.Context) {
	id := c.Param("id")
	trace := h.store.GetTrace(id)
	if trace == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
		return
	}
	c.JSON(http.StatusOK, trace)
}

// GetMetrics returns all metrics
func (h *Handler) GetMetrics(c *gin.Context) {
	metrics := h.store.GetAllMetrics()
	c.JSON(http.StatusOK, gin.H{
		"metrics": metrics,
		"count":   len(metrics),
	})
}

// CreateMetric creates a new metric
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

// GetLogs returns all logs
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

// CreateLog creates a new log entry
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

// GetRequestFlow returns the request flow for a trace
func (h *Handler) GetRequestFlow(c *gin.Context) {
	traceID := c.Param("trace-id")
	trace := h.store.GetTrace(traceID)
	if trace == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
		return
	}
	
	// Build flow steps from spans
	flow := []map[string]interface{}{}
	for _, span := range trace.Spans {
		step := map[string]interface{}{
			"span_id":   span.SpanID,
			"operation": span.OperationName,
			"duration":  span.Duration.Milliseconds(),
			"status":    span.Status,
			"tags":      span.Tags,
		}
		flow = append(flow, step)
	}
	
	c.JSON(http.StatusOK, gin.H{
		"trace_id": traceID,
		"flow":     flow,
		"count":    len(flow),
	})
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
