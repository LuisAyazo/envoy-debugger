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

// JaegerClient is a client for querying Jaeger
type JaegerClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewJaegerClient creates a new Jaeger client
func NewJaegerClient(baseURL string) *JaegerClient {
	return &JaegerClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// JaegerQuery represents a Jaeger trace search query
type JaegerQuery struct {
	ServiceName string
	Operation   string
	Tags        map[string]string
	Start       time.Time
	End         time.Time
	MinDuration time.Duration
	MaxDuration time.Duration
	Limit       int
}

// JaegerTrace represents a trace in Jaeger format
type JaegerTrace struct {
	TraceID   string                   `json:"traceID"`
	Spans     []JaegerSpan             `json:"spans"`
	Processes map[string]JaegerProcess `json:"processes"`
	Warnings  []string                 `json:"warnings,omitempty"`
}

// JaegerSpan represents a span in Jaeger format
type JaegerSpan struct {
	TraceID       string            `json:"traceID"`
	SpanID        string            `json:"spanID"`
	OperationName string            `json:"operationName"`
	References    []JaegerReference `json:"references"`
	StartTime     int64             `json:"startTime"`
	Duration      int64             `json:"duration"`
	Tags          []JaegerTag       `json:"tags"`
	Logs          []JaegerLog       `json:"logs"`
	ProcessID     string            `json:"processID"`
	Warnings      []string          `json:"warnings,omitempty"`
}

// JaegerReference represents a span reference
type JaegerReference struct {
	RefType string `json:"refType"`
	TraceID string `json:"traceID"`
	SpanID  string `json:"spanID"`
}

// JaegerTag represents a tag on a span
type JaegerTag struct {
	Key   string      `json:"key"`
	Type  string      `json:"type"`
	Value interface{} `json:"value"`
}

// JaegerLog represents a log entry on a span
type JaegerLog struct {
	Timestamp int64       `json:"timestamp"`
	Fields    []JaegerTag `json:"fields"`
}

// JaegerProcess represents a process that created spans
type JaegerProcess struct {
	ServiceName string      `json:"serviceName"`
	Tags        []JaegerTag `json:"tags"`
}

// JaegerService represents a service in Jaeger
type JaegerService struct {
	Name       string   `json:"name"`
	Operations []string `json:"operations"`
}

// FindTraces searches for traces matching the query
func (c *JaegerClient) FindTraces(ctx context.Context, query JaegerQuery) ([]JaegerTrace, error) {
	// Build query parameters
	params := url.Values{}
	if query.ServiceName != "" {
		params.Add("service", query.ServiceName)
	}
	if query.Operation != "" {
		params.Add("operation", query.Operation)
	}
	if !query.Start.IsZero() {
		params.Add("start", fmt.Sprintf("%d", query.Start.UnixMicro()))
	}
	if !query.End.IsZero() {
		params.Add("end", fmt.Sprintf("%d", query.End.UnixMicro()))
	}
	if query.MinDuration > 0 {
		params.Add("minDuration", query.MinDuration.String())
	}
	if query.MaxDuration > 0 {
		params.Add("maxDuration", query.MaxDuration.String())
	}
	if query.Limit > 0 {
		params.Add("limit", fmt.Sprintf("%d", query.Limit))
	} else {
		params.Add("limit", "20")
	}

	// Add tags
	for key, value := range query.Tags {
		params.Add("tags", fmt.Sprintf(`{"%s":"%s"}`, key, value))
	}

	// Make request
	url := fmt.Sprintf("%s/api/traces?%s", c.baseURL, params.Encode())
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
		return nil, fmt.Errorf("jaeger returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var result struct {
		Data []JaegerTrace `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Data, nil
}

// GetTrace retrieves a specific trace by ID
func (c *JaegerClient) GetTrace(ctx context.Context, traceID string) (*JaegerTrace, error) {
	url := fmt.Sprintf("%s/api/traces/%s", c.baseURL, traceID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("trace not found: %s", traceID)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("jaeger returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []JaegerTrace `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("trace not found: %s", traceID)
	}

	return &result.Data[0], nil
}

// GetServices retrieves all services from Jaeger
func (c *JaegerClient) GetServices(ctx context.Context) ([]string, error) {
	url := fmt.Sprintf("%s/api/services", c.baseURL)
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
		return nil, fmt.Errorf("jaeger returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []string `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Data, nil
}

// GetOperations retrieves all operations for a service
func (c *JaegerClient) GetOperations(ctx context.Context, serviceName string) ([]string, error) {
	params := url.Values{}
	params.Add("service", serviceName)

	url := fmt.Sprintf("%s/api/services/%s/operations?%s", c.baseURL, serviceName, params.Encode())
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
		return nil, fmt.Errorf("jaeger returned status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []struct {
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	operations := make([]string, len(result.Data))
	for i, op := range result.Data {
		operations[i] = op.Name
	}

	return operations, nil
}

// GetErrorTraces retrieves traces with errors
func (c *JaegerClient) GetErrorTraces(ctx context.Context, serviceName string, start, end time.Time) ([]JaegerTrace, error) {
	query := JaegerQuery{
		ServiceName: serviceName,
		Tags: map[string]string{
			"error": "true",
		},
		Start: start,
		End:   end,
		Limit: 100,
	}
	return c.FindTraces(ctx, query)
}

// GetSlowTraces retrieves traces that exceed a duration threshold
func (c *JaegerClient) GetSlowTraces(ctx context.Context, serviceName string, minDuration time.Duration, start, end time.Time) ([]JaegerTrace, error) {
	query := JaegerQuery{
		ServiceName: serviceName,
		MinDuration: minDuration,
		Start:       start,
		End:         end,
		Limit:       100,
	}
	return c.FindTraces(ctx, query)
}

// ConvertToTrace converts a JaegerTrace to the common Trace format
func (jt *JaegerTrace) ConvertToTrace() *Trace {
	if jt == nil {
		return nil
	}

	trace := &Trace{
		TraceID: jt.TraceID,
		Spans:   make([]Span, len(jt.Spans)),
	}

	// Find root span
	for _, span := range jt.Spans {
		if len(span.References) == 0 || span.References[0].RefType != "CHILD_OF" {
			trace.RootServiceName = jt.Processes[span.ProcessID].ServiceName
			trace.RootTraceName = span.OperationName
			trace.StartTimeUnixNano = span.StartTime * 1000 // Convert microseconds to nanoseconds
			break
		}
	}

	// Convert spans
	for i, jspan := range jt.Spans {
		span := Span{
			SpanID:            jspan.SpanID,
			TraceID:           jspan.TraceID,
			OperationName:     jspan.OperationName,
			StartTimeUnixNano: jspan.StartTime * 1000,
			DurationNanos:     jspan.Duration * 1000,
			Tags:              make(map[string]string),
			References:        make([]SpanReference, len(jspan.References)),
		}

		// Convert tags
		for _, tag := range jspan.Tags {
			span.Tags[tag.Key] = fmt.Sprintf("%v", tag.Value)
		}

		// Convert references
		for j, ref := range jspan.References {
			span.References[j] = SpanReference{
				RefType: ref.RefType,
				TraceID: ref.TraceID,
				SpanID:  ref.SpanID,
			}
		}

		trace.Spans[i] = span
		trace.SpanCount++

		// Calculate total duration
		spanDuration := jspan.Duration / 1000 // Convert to milliseconds
		if spanDuration > trace.DurationMs {
			trace.DurationMs = spanDuration
		}
	}

	return trace
}
