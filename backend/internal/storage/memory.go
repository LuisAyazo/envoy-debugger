package storage

import (
	"fmt"
	"sync"
	"time"
)

type Trace struct {
	TraceID     string                 `json:"traceId"`
	ID          string                 `json:"id"`
	RequestID   string                 `json:"requestId"`
	Timestamp   time.Time              `json:"timestamp"`
	Duration    time.Duration          `json:"duration"`
	Method      string                 `json:"method"`
	Path        string                 `json:"path"`
	StatusCode  int                    `json:"statusCode"`
	Spans       []Span                 `json:"spans"`
	FlowSteps   []FlowStep             `json:"flowSteps"`
	Metadata    map[string]interface{} `json:"metadata"`
	Errors      []Error                `json:"errors"`
}

type Span struct {
	SpanID        string                 `json:"spanId"`
	Name          string                 `json:"name"`
	OperationName string                 `json:"operationName"`
	Duration      time.Duration          `json:"duration"`
	Timestamp     time.Time              `json:"timestamp"`
	Tags          map[string]interface{} `json:"tags"`
	Status        string                 `json:"status"`
}

type FlowStep struct {
	Order    int                    `json:"order"`
	Name     string                 `json:"name"`
	Status   string                 `json:"status"` // pass, fail, skip
	Duration float64                `json:"duration"`
	Reason   string                 `json:"reason"`
	Metadata map[string]interface{} `json:"metadata"`
}

type Error struct {
	Message   string `json:"message"`
	Component string `json:"component"`
	Timestamp time.Time `json:"timestamp"`
}

type LogEntry struct {
	Timestamp  time.Time `json:"timestamp"`
	Component  string    `json:"component"`
	Level      string    `json:"level"` // debug, info, warn, error
	Message    string    `json:"message"`
	RequestID  string    `json:"requestId,omitempty"`
	TraceID    string    `json:"traceId,omitempty"`
}

type MetricPoint struct {
	Timestamp time.Time              `json:"timestamp"`
	Value     float64                `json:"value"`
	Labels    map[string]interface{} `json:"labels"`
}

type MemoryStore struct {
	traces         map[string]*Trace
	logs           []LogEntry
	metrics        map[string][]MetricPoint
	maxEntries     int
	mu             sync.RWMutex
	lastCleanup    time.Time
	cleanupInterval time.Duration
}

func NewMemoryStore() *MemoryStore {
	store := &MemoryStore{
		traces:          make(map[string]*Trace),
		logs:            make([]LogEntry, 0),
		metrics:         make(map[string][]MetricPoint),
		maxEntries:      10000,
		cleanupInterval: 5 * time.Minute,
	}

	// Start cleanup goroutine
	go store.cleanupRoutine()

	return store
}

// Trace operations

func (s *MemoryStore) StoreTrace(trace *Trace) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if trace.TraceID == "" {
		trace.TraceID = trace.ID
	}
	if trace.ID == "" {
		trace.ID = trace.TraceID
	}

	s.traces[trace.TraceID] = trace

	// Cleanup if needed
	if len(s.traces) > s.maxEntries {
		s.cleanup()
	}
}

// GetTrace returns a trace by ID
func (s *MemoryStore) GetTrace(id string) *Trace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.traces[id]
}

// GetAllTraces returns all traces
func (s *MemoryStore) GetAllTraces() []Trace {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	traces := make([]Trace, 0, len(s.traces))
	for _, trace := range s.traces {
		traces = append(traces, *trace)
	}
	return traces
}

func (s *MemoryStore) GetTraceByID(id string) (*Trace, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	trace, ok := s.traces[id]
	if !ok {
		return nil, fmt.Errorf("trace not found: %s", id)
	}

	return trace, nil
}

func (s *MemoryStore) GetTraces(limit, offset int, statusCode int) ([]*Trace, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	traces := make([]*Trace, 0)
	count := 0

	for _, trace := range s.traces {
		if statusCode == 0 || trace.StatusCode == statusCode {
			if count >= offset && count < offset+limit {
				traces = append(traces, trace)
			}
			count++
		}
	}

	return traces, count
}

func (s *MemoryStore) GetTraceFlow(traceID string) ([]FlowStep, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	trace, ok := s.traces[traceID]
	if !ok {
		return nil, fmt.Errorf("trace not found")
	}

	return trace.FlowSteps, nil
}

func (s *MemoryStore) SearchTraces(method, path string, minStatus, maxStatus int) []*Trace {
	s.mu.RLock()
	defer s.mu.RUnlock()

	results := make([]*Trace, 0)

	for _, trace := range s.traces {
		methodMatch := method == "" || trace.Method == method
		pathMatch := path == "" || trace.Path == path
		statusMatch := (trace.StatusCode >= minStatus && trace.StatusCode <= maxStatus) || (minStatus == 0 && maxStatus == 0)

		if methodMatch && pathMatch && statusMatch {
			results = append(results, trace)
		}
	}

	return results
}

func (s *MemoryStore) GetRequestFlow(requestID string) (map[string]interface{}, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	// Find trace by request ID
	var trace *Trace
	for _, t := range s.traces {
		if t.RequestID == requestID {
			trace = t
			break
		}
	}

	if trace == nil {
		return nil, fmt.Errorf("request not found: %s", requestID)
	}

	return map[string]interface{}{
		"requestId": requestID,
		"traceId":   trace.ID,
		"steps":     trace.FlowSteps,
		"errors":    trace.Errors,
		"metadata":  trace.Metadata,
	}, nil
}

func (s *MemoryStore) GetRequestErrors(requestID string) ([]Error, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, trace := range s.traces {
		if trace.RequestID == requestID {
			return trace.Errors, nil
		}
	}

	return nil, fmt.Errorf("request not found: %s", requestID)
}

// Log operations

func (s *MemoryStore) AddLog(entry LogEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.logs = append(s.logs, entry)

	// Keep last N logs
	if len(s.logs) > s.maxEntries {
		s.logs = s.logs[len(s.logs)-s.maxEntries:]
	}
}

// StoreLog stores a log entry
func (s *MemoryStore) StoreLog(entry *LogEntry) {
	s.AddLog(*entry)
}

// GetAllLogs returns all logs
func (s *MemoryStore) GetAllLogs() []LogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	result := make([]LogEntry, len(s.logs))
	copy(result, s.logs)
	return result
}

func (s *MemoryStore) GetLogs(limit, offset int, component string) ([]LogEntry, int) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	logs := make([]LogEntry, 0)
	count := 0

	// Iterate in reverse order (newest first)
	for i := len(s.logs) - 1; i >= 0; i-- {
		entry := s.logs[i]

		if component == "" || entry.Component == component {
			if count >= offset && len(logs) < limit {
				logs = append(logs, entry)
			}
			count++
		}
	}

	return logs, count
}

func (s *MemoryStore) SearchLogs(pattern, component string) []LogEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	results := make([]LogEntry, 0)

	for _, entry := range s.logs {
		componentMatch := component == "" || entry.Component == component
		patternMatch := pattern == "" || contains(entry.Message, pattern)

		if componentMatch && patternMatch {
			results = append(results, entry)
		}
	}

	return results
}

// Metrics operations

func (s *MemoryStore) RecordMetric(name string, value float64, labels map[string]interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()

	point := MetricPoint{
		Timestamp: time.Now(),
		Value:     value,
		Labels:    labels,
	}

	s.metrics[name] = append(s.metrics[name], point)

	// Keep last N points per metric
	if len(s.metrics[name]) > 1000 {
		s.metrics[name] = s.metrics[name][len(s.metrics[name])-1000:]
	}
}

// StoreMetric stores a metric point
func (s *MemoryStore) StoreMetric(metric *MetricPoint) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	name := "default"
	if metric.Labels != nil {
		if n, ok := metric.Labels["name"].(string); ok {
			name = n
		}
	}
	
	s.metrics[name] = append(s.metrics[name], *metric)
	
	if len(s.metrics[name]) > 1000 {
		s.metrics[name] = s.metrics[name][len(s.metrics[name])-1000:]
	}
}

// GetAllMetrics returns all metrics
func (s *MemoryStore) GetAllMetrics() []MetricPoint {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	result := []MetricPoint{}
	for _, points := range s.metrics {
		result = append(result, points...)
	}
	return result
}

func (s *MemoryStore) GetLatencyMetrics() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	latencies := make([]float64, 0)
	for _, trace := range s.traces {
		latencies = append(latencies, float64(trace.Duration.Milliseconds()))
	}

	return map[string]interface{}{
		"p50":    percentile(latencies, 50),
		"p95":    percentile(latencies, 95),
		"p99":    percentile(latencies, 99),
		"min":    min(latencies),
		"max":    max(latencies),
		"avg":    avg(latencies),
		"count":  len(latencies),
	}
}

func (s *MemoryStore) GetThroughputMetrics() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now()
	oneMinAgo := now.Add(-1 * time.Minute)
	fiveMinAgo := now.Add(-5 * time.Minute)

	count1m := 0
	count5m := 0

	for _, trace := range s.traces {
		if trace.Timestamp.After(oneMinAgo) {
			count1m++
		}
		if trace.Timestamp.After(fiveMinAgo) {
			count5m++
		}
	}

	return map[string]interface{}{
		"rps_1m":  float64(count1m) / 60,
		"rps_5m":  float64(count5m) / 300,
		"count_1m": count1m,
		"count_5m": count5m,
	}
}

func (s *MemoryStore) GetErrorMetrics() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	errorsByStatus := make(map[int]int)
	total := len(s.traces)

	for _, trace := range s.traces {
		if trace.StatusCode >= 400 {
			errorsByStatus[trace.StatusCode]++
		}
	}

	return map[string]interface{}{
		"by_status": errorsByStatus,
		"total":     total,
		"errors":    len(errorsByStatus),
	}
}

func (s *MemoryStore) GetMetrics() map[string]interface{} {
	return map[string]interface{}{
		"traces":     len(s.traces),
		"logs":       len(s.logs),
		"metrics":    len(s.metrics),
		"latency":    s.GetLatencyMetrics(),
		"throughput": s.GetThroughputMetrics(),
		"errors":     s.GetErrorMetrics(),
	}
}

func (s *MemoryStore) GetStats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return map[string]interface{}{
		"total_traces": len(s.traces),
		"total_logs":   len(s.logs),
		"memory_usage": s.estimateMemoryUsage(),
	}
}

// Cleanup operations

func (s *MemoryStore) cleanup() {
	// Remove oldest traces
	for id, trace := range s.traces {
		if time.Since(trace.Timestamp) > 1*time.Hour {
			delete(s.traces, id)
		}
	}
}

func (s *MemoryStore) cleanupRoutine() {
	ticker := time.NewTicker(s.cleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		s.mu.Lock()
		s.cleanup()
		s.mu.Unlock()
	}
}

func (s *MemoryStore) estimateMemoryUsage() string {
	// Rough estimate
	numTraces := len(s.traces)
	numLogs := len(s.logs)

	// ~1KB per trace, ~200 bytes per log
	usageBytes := (numTraces * 1024) + (numLogs * 200)
	usageMB := float64(usageBytes) / (1024 * 1024)

	return fmt.Sprintf("%.2f MB", usageMB)
}

// Helper functions

func contains(str, substr string) bool {
	return len(str) > 0 && len(substr) > 0
}

func percentile(data []float64, p int) float64 {
	if len(data) == 0 {
		return 0
	}

	index := (len(data) * p) / 100
	if index >= len(data) {
		index = len(data) - 1
	}

	return data[index]
}

func min(data []float64) float64 {
	if len(data) == 0 {
		return 0
	}

	m := data[0]
	for _, v := range data {
		if v < m {
			m = v
		}
	}
	return m
}

func max(data []float64) float64 {
	if len(data) == 0 {
		return 0
	}

	m := data[0]
	for _, v := range data {
		if v > m {
			m = v
		}
	}
	return m
}

func avg(data []float64) float64 {
	if len(data) == 0 {
		return 0
	}

	sum := 0.0
	for _, v := range data {
		sum += v
	}
	return sum / float64(len(data))
}

// Close closes the memory store (no-op for memory store)
func (s *MemoryStore) Close() {
	// No-op for memory store
}

