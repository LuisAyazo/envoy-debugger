package clients

import (
	"context"
	"fmt"
	"time"

	"github.com/prometheus/client_golang/api"
	v1 "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/common/model"
)

// PrometheusClient is a client for querying Prometheus
type PrometheusClient struct {
	baseURL string
	api     v1.API
}

// NewPrometheusClient creates a new Prometheus client
func NewPrometheusClient(baseURL string) (*PrometheusClient, error) {
	client, err := api.NewClient(api.Config{
		Address: baseURL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create prometheus client: %w", err)
	}

	return &PrometheusClient{
		baseURL: baseURL,
		api:     v1.NewAPI(client),
	}, nil
}

// MetricQuery represents a Prometheus query
type MetricQuery struct {
	Query string
	Start time.Time
	End   time.Time
	Step  time.Duration
}

// MetricResult represents a metric query result
type MetricResult struct {
	Metric map[string]string `json:"metric"`
	Values []MetricValue     `json:"values"`
}

// MetricValue represents a single metric value
type MetricValue struct {
	Timestamp int64   `json:"timestamp"`
	Value     float64 `json:"value"`
}

// QueryRange executes a range query
func (c *PrometheusClient) QueryRange(ctx context.Context, query string, start, end time.Time, step time.Duration) ([]MetricResult, error) {
	r := v1.Range{
		Start: start,
		End:   end,
		Step:  step,
	}

	result, warnings, err := c.api.QueryRange(ctx, query, r)
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}

	if len(warnings) > 0 {
		fmt.Printf("Prometheus warnings: %v\n", warnings)
	}

	return convertMatrixToMetricResults(result), nil
}

// QueryInstant executes an instant query
func (c *PrometheusClient) QueryInstant(ctx context.Context, query string, ts time.Time) ([]MetricResult, error) {
	result, warnings, err := c.api.Query(ctx, query, ts)
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}

	if len(warnings) > 0 {
		fmt.Printf("Prometheus warnings: %v\n", warnings)
	}

	return convertVectorToMetricResults(result), nil
}

// GetLatencyMetrics retrieves latency metrics for a specific route
func (c *PrometheusClient) GetLatencyMetrics(ctx context.Context, route string, start, end time.Time) ([]MetricResult, error) {
	query := fmt.Sprintf(`histogram_quantile(0.95, 
		rate(gateway_request_duration_seconds_bucket{http_route="%s"}[5m])
	)`, route)

	return c.QueryRange(ctx, query, start, end, time.Minute)
}

// GetThroughputMetrics retrieves throughput metrics
func (c *PrometheusClient) GetThroughputMetrics(ctx context.Context, service string, start, end time.Time) ([]MetricResult, error) {
	query := fmt.Sprintf(`rate(gateway_requests_total{service="%s"}[5m])`, service)
	return c.QueryRange(ctx, query, start, end, time.Minute)
}

// GetErrorRateMetrics retrieves error rate metrics
func (c *PrometheusClient) GetErrorRateMetrics(ctx context.Context, service string, start, end time.Time) ([]MetricResult, error) {
	query := fmt.Sprintf(`rate(gateway_requests_total{service="%s",status_code=~"5.."}[5m])`, service)
	return c.QueryRange(ctx, query, start, end, time.Minute)
}

// GetActiveConnections retrieves active connection count
func (c *PrometheusClient) GetActiveConnections(ctx context.Context, service string) (float64, error) {
	query := fmt.Sprintf(`gateway_active_connections{service="%s"}`, service)
	results, err := c.QueryInstant(ctx, query, time.Now())
	if err != nil {
		return 0, err
	}

	if len(results) == 0 || len(results[0].Values) == 0 {
		return 0, nil
	}

	return results[0].Values[0].Value, nil
}

// GetCircuitBreakerStatus retrieves circuit breaker status
func (c *PrometheusClient) GetCircuitBreakerStatus(ctx context.Context, cluster string) (float64, error) {
	query := fmt.Sprintf(`envoy_cluster_circuit_breakers_default_cx_open{cluster="%s"}`, cluster)
	results, err := c.QueryInstant(ctx, query, time.Now())
	if err != nil {
		return 0, err
	}

	if len(results) == 0 || len(results[0].Values) == 0 {
		return 0, nil
	}

	return results[0].Values[0].Value, nil
}

// GetRequestRateByStatusCode retrieves request rate grouped by status code
func (c *PrometheusClient) GetRequestRateByStatusCode(ctx context.Context, service string, start, end time.Time) (map[string][]MetricResult, error) {
	query := fmt.Sprintf(`sum by (status_code) (rate(gateway_requests_total{service="%s"}[5m]))`, service)
	results, err := c.QueryRange(ctx, query, start, end, time.Minute)
	if err != nil {
		return nil, err
	}

	// Group by status code
	grouped := make(map[string][]MetricResult)
	for _, result := range results {
		statusCode := result.Metric["status_code"]
		grouped[statusCode] = append(grouped[statusCode], result)
	}

	return grouped, nil
}

// GetUpstreamLatency retrieves upstream service latency
func (c *PrometheusClient) GetUpstreamLatency(ctx context.Context, upstream string, start, end time.Time) ([]MetricResult, error) {
	query := fmt.Sprintf(`histogram_quantile(0.95, 
		rate(envoy_cluster_upstream_rq_time_bucket{cluster="%s"}[5m])
	)`, upstream)

	return c.QueryRange(ctx, query, start, end, time.Minute)
}

// GetMemoryUsage retrieves memory usage metrics
func (c *PrometheusClient) GetMemoryUsage(ctx context.Context, pod string, start, end time.Time) ([]MetricResult, error) {
	query := fmt.Sprintf(`container_memory_usage_bytes{pod="%s"}`, pod)
	return c.QueryRange(ctx, query, start, end, time.Minute)
}

// GetCPUUsage retrieves CPU usage metrics
func (c *PrometheusClient) GetCPUUsage(ctx context.Context, pod string, start, end time.Time) ([]MetricResult, error) {
	query := fmt.Sprintf(`rate(container_cpu_usage_seconds_total{pod="%s"}[5m])`, pod)
	return c.QueryRange(ctx, query, start, end, time.Minute)
}

// GetJWTValidationMetrics retrieves JWT validation metrics
func (c *PrometheusClient) GetJWTValidationMetrics(ctx context.Context, start, end time.Time) (map[string][]MetricResult, error) {
	query := `sum by (result) (rate(gateway_jwt_validation_total[5m]))`
	results, err := c.QueryRange(ctx, query, start, end, time.Minute)
	if err != nil {
		return nil, err
	}

	// Group by result (success/failure)
	grouped := make(map[string][]MetricResult)
	for _, result := range results {
		resultType := result.Metric["result"]
		grouped[resultType] = append(grouped[resultType], result)
	}

	return grouped, nil
}

// GetRateLimitMetrics retrieves rate limiting metrics
func (c *PrometheusClient) GetRateLimitMetrics(ctx context.Context, start, end time.Time) ([]MetricResult, error) {
	query := `rate(gateway_rate_limit_exceeded_total[5m])`
	return c.QueryRange(ctx, query, start, end, time.Minute)
}

// Helper functions to convert Prometheus model types to our types

func convertMatrixToMetricResults(value model.Value) []MetricResult {
	if value == nil {
		return []MetricResult{}
	}

	matrix, ok := value.(model.Matrix)
	if !ok {
		return []MetricResult{}
	}

	results := make([]MetricResult, len(matrix))
	for i, stream := range matrix {
		results[i] = MetricResult{
			Metric: convertMetric(stream.Metric),
			Values: convertSamplePairs(stream.Values),
		}
	}

	return results
}

func convertVectorToMetricResults(value model.Value) []MetricResult {
	if value == nil {
		return []MetricResult{}
	}

	vector, ok := value.(model.Vector)
	if !ok {
		return []MetricResult{}
	}

	results := make([]MetricResult, len(vector))
	for i, sample := range vector {
		results[i] = MetricResult{
			Metric: convertMetric(sample.Metric),
			Values: []MetricValue{
				{
					Timestamp: int64(sample.Timestamp),
					Value:     float64(sample.Value),
				},
			},
		}
	}

	return results
}

func convertMetric(metric model.Metric) map[string]string {
	result := make(map[string]string)
	for k, v := range metric {
		result[string(k)] = string(v)
	}
	return result
}

func convertSamplePairs(pairs []model.SamplePair) []MetricValue {
	values := make([]MetricValue, len(pairs))
	for i, pair := range pairs {
		values[i] = MetricValue{
			Timestamp: int64(pair.Timestamp),
			Value:     float64(pair.Value),
		}
	}
	return values
}

// GetServiceHealth retrieves overall service health metrics
func (c *PrometheusClient) GetServiceHealth(ctx context.Context, service string) (*ServiceHealth, error) {
	now := time.Now()
	fiveMinAgo := now.Add(-5 * time.Minute)

	// Get error rate
	errorRateResults, err := c.GetErrorRateMetrics(ctx, service, fiveMinAgo, now)
	if err != nil {
		return nil, err
	}

	// Get throughput
	throughputResults, err := c.GetThroughputMetrics(ctx, service, fiveMinAgo, now)
	if err != nil {
		return nil, err
	}

	// Get latency
	latencyResults, err := c.GetLatencyMetrics(ctx, "", fiveMinAgo, now)
	if err != nil {
		return nil, err
	}

	health := &ServiceHealth{
		Service:   service,
		Timestamp: now,
	}

	// Calculate averages
	if len(errorRateResults) > 0 && len(errorRateResults[0].Values) > 0 {
		health.ErrorRate = errorRateResults[0].Values[len(errorRateResults[0].Values)-1].Value
	}

	if len(throughputResults) > 0 && len(throughputResults[0].Values) > 0 {
		health.RequestRate = throughputResults[0].Values[len(throughputResults[0].Values)-1].Value
	}

	if len(latencyResults) > 0 && len(latencyResults[0].Values) > 0 {
		health.P95Latency = latencyResults[0].Values[len(latencyResults[0].Values)-1].Value
	}

	// Determine health status
	if health.ErrorRate > 0.05 { // > 5% error rate
		health.Status = "unhealthy"
	} else if health.ErrorRate > 0.01 { // > 1% error rate
		health.Status = "degraded"
	} else {
		health.Status = "healthy"
	}

	return health, nil
}

// ServiceHealth represents the health status of a service
type ServiceHealth struct {
	Service     string    `json:"service"`
	Status      string    `json:"status"` // healthy, degraded, unhealthy
	ErrorRate   float64   `json:"error_rate"`
	RequestRate float64   `json:"request_rate"`
	P95Latency  float64   `json:"p95_latency"`
	Timestamp   time.Time `json:"timestamp"`
}
