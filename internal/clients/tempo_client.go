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

// TempoClient is a client for querying Grafana Tempo
type TempoClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewTempoClient creates a new Tempo client
func NewTempoClient(baseURL string) *TempoClient {
	return &TempoClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// TraceQuery represents a trace search query
type TraceQuery struct {
	ServiceName string
	Start       time.Time
	End         time.Time
	MinDuration time.Duration
	MaxDuration time.Duration
	Limit       int
	Tags        map[string]string
}

// Trace represents a distributed trace
type Trace struct {
	TraceID           string `json:"traceID"`
	RootServiceName   string `json:"rootServiceName"`
	RootTraceName     string `json:"rootTraceName"`
	StartTimeUnixNano int64  `json:"startTimeUnixNano"`
	DurationMs        int64  `json:"durationMs"`
	SpanCount         int    `json:"spanCount"`
	Spans             []Span `json:"spans,omitempty"`
}

// Span represents a single span in a trace
type Span struct {
	SpanID            string            `json:"spanID"`
	TraceID           string            `json:"traceID"`
	OperationName     string            `json:"operationName"`
	StartTimeUnixNano int64             `json:"startTimeUnixNano"`
	DurationNanos     int64             `json:"durationNanos"`
	Tags              map[string]string `json:"tags"`
	Logs              []SpanLog         `json:"logs"`
	References        []SpanReference   `json:"references"`
}

// SpanLog represents a log entry in a span
type SpanLog struct {
	Timestamp int64             `json:"timestamp"`
	Fields    map[string]string `json:"fields"`
}

// SpanReference represents a reference to another span
type SpanReference struct {
	RefType string `json:"refType"`
	TraceID string `json:"traceID"`
	SpanID  string `json:"spanID"`
}

// ServiceGraph represents service dependencies
type ServiceGraph struct {
	Nodes []ServiceNode `json:"nodes"`
	Edges []ServiceEdge `json:"edges"`
}

// ServiceNode represents a service in the graph
type ServiceNode struct {
	ID          string  `json:"id"`
	ServiceName string  `json:"serviceName"`
	RequestRate float64 `json:"requestRate"`
	ErrorRate   float64 `json:"errorRate"`
	P95Latency  float64 `json:"p95Latency"`
}

// ServiceEdge represents a connection between services
type ServiceEdge struct {
	Source      string  `json:"source"`
	Target      string  `json:"target"`
	RequestRate float64 `json:"requestRate"`
	ErrorRate   float64 `json:"errorRate"`
}

// SearchTraces searches for traces matching the query
func (c *TempoClient) SearchTraces(ctx context.Context, query TraceQuery) ([]Trace, error) {
	// Build query parameters
	params := url.Values{}
	if query.ServiceName != "" {
		params.Add("service.name", query.ServiceName)
	}
	if !query.Start.IsZero() {
		params.Add("start", fmt.Sprintf("%d", query.Start.Unix()))
	}
	if !query.End.IsZero() {
		params.Add("end", fmt.Sprintf("%d", query.End.Unix()))
	}
	if query.MinDuration > 0 {
		params.Add("minDuration", query.MinDuration.String())
	}
	if query.MaxDuration > 0 {
		params.Add("maxDuration", query.MaxDuration.String())
	}
	if query.Limit > 0 {
		params.Add("limit", fmt.Sprintf("%d", query.Limit))
	}

	// Add custom tags
	for key, value := range query.Tags {
		params.Add(key, value)
	}

	// Make request
	url := fmt.Sprintf("%s/api/search?%s", c.baseURL, params.Encode())
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
		return nil, fmt.Errorf("tempo returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var result struct {
		Traces []Trace `json:"traces"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Traces, nil
}

// GetTrace retrieves a specific trace by ID
func (c *TempoClient) GetTrace(ctx context.Context, traceID string) (*Trace, error) {
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
		return nil, fmt.Errorf("tempo returned status %d: %s", resp.StatusCode, string(body))
	}

	var trace Trace
	if err := json.NewDecoder(resp.Body).Decode(&trace); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &trace, nil
}

// GetServiceGraph retrieves the service dependency graph
func (c *TempoClient) GetServiceGraph(ctx context.Context, start, end time.Time) (*ServiceGraph, error) {
	params := url.Values{}
	params.Add("start", fmt.Sprintf("%d", start.Unix()))
	params.Add("end", fmt.Sprintf("%d", end.Unix()))

	url := fmt.Sprintf("%s/api/metrics/service-graph?%s", c.baseURL, params.Encode())
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
		return nil, fmt.Errorf("tempo returned status %d: %s", resp.StatusCode, string(body))
	}

	var graph ServiceGraph
	if err := json.NewDecoder(resp.Body).Decode(&graph); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &graph, nil
}

// SearchTracesByTags searches for traces with specific tags
func (c *TempoClient) SearchTracesByTags(ctx context.Context, tags map[string]string, start, end time.Time) ([]Trace, error) {
	query := TraceQuery{
		Tags:  tags,
		Start: start,
		End:   end,
		Limit: 100,
	}
	return c.SearchTraces(ctx, query)
}

// GetTracesByService retrieves all traces for a specific service
func (c *TempoClient) GetTracesByService(ctx context.Context, serviceName string, start, end time.Time) ([]Trace, error) {
	query := TraceQuery{
		ServiceName: serviceName,
		Start:       start,
		End:         end,
		Limit:       100,
	}
	return c.SearchTraces(ctx, query)
}

// GetSlowTraces retrieves traces that exceed a duration threshold
func (c *TempoClient) GetSlowTraces(ctx context.Context, serviceName string, minDuration time.Duration, start, end time.Time) ([]Trace, error) {
	query := TraceQuery{
		ServiceName: serviceName,
		MinDuration: minDuration,
		Start:       start,
		End:         end,
		Limit:       100,
	}
	return c.SearchTraces(ctx, query)
}
