package clients

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// LokiClient is a client for querying Grafana Loki
type LokiClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewLokiClient creates a new Loki client
func NewLokiClient(baseURL string) *LokiClient {
	return &LokiClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// LogQuery represents a Loki log query
type LogQuery struct {
	Query     string
	Start     time.Time
	End       time.Time
	Limit     int
	Direction string // forward or backward
}

// LogEntry represents a single log entry
type LogEntry struct {
	Timestamp int64             `json:"timestamp"`
	Line      string            `json:"line"`
	Labels    map[string]string `json:"labels"`
}

// LogStream represents a stream of logs
type LogStream struct {
	Stream map[string]string `json:"stream"`
	Values [][]string        `json:"values"`
}

// LokiQueryResponse represents the response from Loki
type LokiQueryResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string      `json:"resultType"`
		Result     []LogStream `json:"result"`
		Stats      interface{} `json:"stats,omitempty"`
	} `json:"data"`
}

// QueryRange executes a range query
func (c *LokiClient) QueryRange(ctx context.Context, query string, start, end time.Time, limit int) ([]LogEntry, error) {
	params := url.Values{}
	params.Add("query", query)
	params.Add("start", fmt.Sprintf("%d", start.UnixNano()))
	params.Add("end", fmt.Sprintf("%d", end.UnixNano()))
	if limit > 0 {
		params.Add("limit", fmt.Sprintf("%d", limit))
	} else {
		params.Add("limit", "1000")
	}
	params.Add("direction", "backward")

	url := fmt.Sprintf("%s/loki/api/v1/query_range?%s", c.baseURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("loki returned status %d: %s", resp.StatusCode, string(body))
	}

	var result LokiQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return convertStreamsToLogEntries(result.Data.Result), nil
}

// QueryByTraceID retrieves logs correlated with a specific trace ID
func (c *LokiClient) QueryByTraceID(ctx context.Context, traceID string) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="envoy-gateway"} | json | trace_id="%s"`, traceID)
	end := time.Now()
	start := end.Add(-24 * time.Hour) // Look back 24 hours

	return c.QueryRange(ctx, query, start, end, 1000)
}

// QueryByRequestID retrieves logs for a specific request ID
func (c *LokiClient) QueryByRequestID(ctx context.Context, requestID string) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="envoy-gateway"} | json | request_id="%s"`, requestID)
	end := time.Now()
	start := end.Add(-24 * time.Hour)

	return c.QueryRange(ctx, query, start, end, 1000)
}

// QueryErrorLogs retrieves error logs
func (c *LokiClient) QueryErrorLogs(ctx context.Context, service string, start, end time.Time) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="%s"} | json | level="error"`, service)
	return c.QueryRange(ctx, query, start, end, 1000)
}

// QueryByStatusCode retrieves logs for a specific HTTP status code
func (c *LokiClient) QueryByStatusCode(ctx context.Context, statusCode string, start, end time.Time) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="envoy-gateway"} | json | status_code="%s"`, statusCode)
	return c.QueryRange(ctx, query, start, end, 1000)
}

// QuerySlowRequests retrieves logs for slow requests
func (c *LokiClient) QuerySlowRequests(ctx context.Context, minDurationMs int, start, end time.Time) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="envoy-gateway"} | json | duration_ms > %d`, minDurationMs)
	return c.QueryRange(ctx, query, start, end, 1000)
}

// QueryJWTFailures retrieves logs for JWT validation failures
func (c *LokiClient) QueryJWTFailures(ctx context.Context, start, end time.Time) ([]LogEntry, error) {
	query := `{service_name="envoy-gateway"} |~ "JWT validation failed"`
	return c.QueryRange(ctx, query, start, end, 1000)
}

// QueryByUserID retrieves logs for a specific user
func (c *LokiClient) QueryByUserID(ctx context.Context, userID string, start, end time.Time) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="envoy-gateway"} | json | x_user_id="%s"`, userID)
	return c.QueryRange(ctx, query, start, end, 1000)
}

// QueryByTenantID retrieves logs for a specific tenant
func (c *LokiClient) QueryByTenantID(ctx context.Context, tenantID string, start, end time.Time) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="envoy-gateway"} | json | x_tenant_id="%s"`, tenantID)
	return c.QueryRange(ctx, query, start, end, 1000)
}

// QueryByRoute retrieves logs for a specific route
func (c *LokiClient) QueryByRoute(ctx context.Context, route string, start, end time.Time) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="envoy-gateway"} | json | path=~"%s.*"`, route)
	return c.QueryRange(ctx, query, start, end, 1000)
}

// QueryLabels retrieves available labels
func (c *LokiClient) QueryLabels(ctx context.Context) ([]string, error) {
	url := fmt.Sprintf("%s/loki/api/v1/labels", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("loki returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Data, nil
}

// QueryLabelValues retrieves values for a specific label
func (c *LokiClient) QueryLabelValues(ctx context.Context, label string) ([]string, error) {
	url := fmt.Sprintf("%s/loki/api/v1/label/%s/values", c.baseURL, label)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("loki returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Status string   `json:"status"`
		Data   []string `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Data, nil
}

// TailLogs streams logs in real-time (WebSocket-based)
func (c *LokiClient) TailLogs(ctx context.Context, query string, callback func(LogEntry)) error {
	// Note: This would require WebSocket implementation
	// For now, we'll use polling as a fallback
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	lastTimestamp := time.Now()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			now := time.Now()
			logs, err := c.QueryRange(ctx, query, lastTimestamp, now, 100)
			if err != nil {
				return err
			}

			for _, log := range logs {
				callback(log)
			}

			lastTimestamp = now
		}
	}
}

// Helper functions

func convertStreamsToLogEntries(streams []LogStream) []LogEntry {
	var entries []LogEntry

	for _, stream := range streams {
		for _, value := range stream.Values {
			if len(value) < 2 {
				continue
			}

			// Parse timestamp (nanoseconds)
			timestamp := int64(0)
			fmt.Sscanf(value[0], "%d", &timestamp)

			entry := LogEntry{
				Timestamp: timestamp,
				Line:      value[1],
				Labels:    stream.Stream,
			}

			entries = append(entries, entry)
		}
	}

	return entries
}

// ParseJSONLog parses a JSON log line
func ParseJSONLog(line string) (map[string]interface{}, error) {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(line), &data); err != nil {
		return nil, err
	}
	return data, nil
}

// CorrelateLogsWithTrace correlates logs with a trace
func (c *LokiClient) CorrelateLogsWithTrace(ctx context.Context, traceID string, trace *Trace) (*CorrelatedData, error) {
	logs, err := c.QueryByTraceID(ctx, traceID)
	if err != nil {
		return nil, err
	}

	correlated := &CorrelatedData{
		TraceID: traceID,
		Trace:   trace,
		Logs:    logs,
	}

	// Group logs by span
	correlated.LogsBySpan = make(map[string][]LogEntry)
	for _, log := range logs {
		// Try to extract span_id from log
		data, err := ParseJSONLog(log.Line)
		if err != nil {
			continue
		}

		if spanID, ok := data["span_id"].(string); ok {
			correlated.LogsBySpan[spanID] = append(correlated.LogsBySpan[spanID], log)
		}
	}

	return correlated, nil
}

// CorrelatedData represents logs correlated with a trace
type CorrelatedData struct {
	TraceID    string                `json:"trace_id"`
	Trace      *Trace                `json:"trace"`
	Logs       []LogEntry            `json:"logs"`
	LogsBySpan map[string][]LogEntry `json:"logs_by_span"`
}

// SearchLogs performs a full-text search across logs
func (c *LokiClient) SearchLogs(ctx context.Context, searchTerm string, start, end time.Time) ([]LogEntry, error) {
	query := fmt.Sprintf(`{service_name="envoy-gateway"} |~ "(?i)%s"`, searchTerm)
	return c.QueryRange(ctx, query, start, end, 1000)
}

// GetLogStatistics retrieves log statistics
func (c *LokiClient) GetLogStatistics(ctx context.Context, start, end time.Time) (*LogStatistics, error) {
	// Query for total logs
	totalQuery := `{service_name="envoy-gateway"}`
	totalLogs, err := c.QueryRange(ctx, totalQuery, start, end, 10000)
	if err != nil {
		return nil, err
	}

	// Query for error logs
	errorQuery := `{service_name="envoy-gateway"} | json | level="error"`
	errorLogs, err := c.QueryRange(ctx, errorQuery, start, end, 10000)
	if err != nil {
		return nil, err
	}

	// Query for warn logs
	warnQuery := `{service_name="envoy-gateway"} | json | level="warn"`
	warnLogs, err := c.QueryRange(ctx, warnQuery, start, end, 10000)
	if err != nil {
		return nil, err
	}

	stats := &LogStatistics{
		TotalLogs: len(totalLogs),
		ErrorLogs: len(errorLogs),
		WarnLogs:  len(warnLogs),
		InfoLogs:  len(totalLogs) - len(errorLogs) - len(warnLogs),
		StartTime: start,
		EndTime:   end,
	}

	if stats.TotalLogs > 0 {
		stats.ErrorRate = float64(stats.ErrorLogs) / float64(stats.TotalLogs)
	}

	return stats, nil
}

// LogStatistics represents log statistics
type LogStatistics struct {
	TotalLogs int       `json:"total_logs"`
	ErrorLogs int       `json:"error_logs"`
	WarnLogs  int       `json:"warn_logs"`
	InfoLogs  int       `json:"info_logs"`
	ErrorRate float64   `json:"error_rate"`
	StartTime time.Time `json:"start_time"`
	EndTime   time.Time `json:"end_time"`
}
