// Package storage provee el almacenamiento en memoria de RequestTrace correlacionados.
// La clave de correlación es request_id (x-request-id de Envoy), que está presente
// tanto en el access log como en todos los logs de Lua.
package storage

import (
	"sort"
	"sync"
	"time"
)

const (
	maxRequestTraces = 1000
	traceExpiry      = 30 * time.Minute
)

// RequestStore almacena y correlaciona RequestTrace por request_id
type RequestStore struct {
	mu     sync.RWMutex
	traces map[string]*RequestTrace // key = request_id
	order  []string                 // mantiene orden de inserción para paginación
}

// NewRequestStore crea un nuevo store
func NewRequestStore() *RequestStore {
	s := &RequestStore{
		traces: make(map[string]*RequestTrace),
		order:  make([]string, 0, maxRequestTraces),
	}
	go s.cleanupLoop()
	return s
}

// Upsert crea o actualiza un RequestTrace por request_id
// Si ya existe, mergea los campos nuevos sin sobreescribir los existentes
func (s *RequestStore) Upsert(rt *RequestTrace) {
	if rt.RequestID == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.traces[rt.RequestID]
	if !ok {
		// Nuevo trace
		s.traces[rt.RequestID] = rt
		s.order = append(s.order, rt.RequestID)

		// Limitar tamaño: eliminar el más antiguo
		if len(s.order) > maxRequestTraces {
			oldest := s.order[0]
			s.order = s.order[1:]
			delete(s.traces, oldest)
		}
		return
	}

	// Mergear: actualizar solo campos que llegaron ahora
	if rt.TraceID != "" && existing.TraceID == "" {
		existing.TraceID = rt.TraceID
	}
	if rt.Traceparent != "" && existing.Traceparent == "" {
		existing.Traceparent = rt.Traceparent
	}
	if rt.Method != "" && existing.Method == "" {
		existing.Method = rt.Method
	}
	if rt.Path != "" && existing.Path == "" {
		existing.Path = rt.Path
	}
	if rt.Authority != "" && existing.Authority == "" {
		existing.Authority = rt.Authority
	}
	if rt.UserAgent != "" && existing.UserAgent == "" {
		existing.UserAgent = rt.UserAgent
	}
	if rt.StatusCode != 0 {
		existing.StatusCode = rt.StatusCode
	}
	if rt.DurationMs != 0 {
		existing.DurationMs = rt.DurationMs
	}
	if rt.BytesSent != 0 {
		existing.BytesSent = rt.BytesSent
	}
	if rt.BytesReceived != 0 {
		existing.BytesReceived = rt.BytesReceived
	}
	if rt.UpstreamHost != "" {
		existing.UpstreamHost = rt.UpstreamHost
	}
	if rt.UpstreamCluster != "" {
		existing.UpstreamCluster = rt.UpstreamCluster
	}
	if rt.ResponseFlags != "" {
		existing.ResponseFlags = rt.ResponseFlags
	}
	if rt.DownstreamIP != "" && existing.DownstreamIP == "" {
		existing.DownstreamIP = rt.DownstreamIP
	}
	if !rt.EndTime.IsZero() {
		existing.EndTime = rt.EndTime
	}
	if rt.AccessLogReceived {
		existing.AccessLogReceived = true
	}

	// Agregar fases nuevas
	if len(rt.Phases) > 0 {
		existing.Phases = append(existing.Phases, rt.Phases...)
	}

	// Mergear RequestHeaders del access log (capturados por Lua filter)
	if len(rt.RequestHeaders) > 0 && len(existing.RequestHeaders) == 0 {
		existing.RequestHeaders = rt.RequestHeaders
	}

	// Mergear JWT claims
	if len(rt.JWTClaims) > 0 {
		if existing.JWTClaims == nil {
			existing.JWTClaims = make(map[string]interface{})
		}
		for k, v := range rt.JWTClaims {
			existing.JWTClaims[k] = v
		}
	}

	// Agregar errores nuevos
	if len(rt.Errors) > 0 {
		existing.Errors = append(existing.Errors, rt.Errors...)
	}
}

// Get retorna un RequestTrace por request_id
func (s *RequestStore) Get(requestID string) (*RequestTrace, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rt, ok := s.traces[requestID]
	return rt, ok
}

// List retorna los últimos N traces ordenados por tiempo (más reciente primero)
func (s *RequestStore) List(limit int) []*RequestTrace {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > len(s.order) {
		limit = len(s.order)
	}

	// Tomar los últimos `limit` del orden de inserción (más recientes)
	start := len(s.order) - limit
	if start < 0 {
		start = 0
	}

	result := make([]*RequestTrace, 0, limit)
	for i := len(s.order) - 1; i >= start; i-- {
		if rt, ok := s.traces[s.order[i]]; ok {
			result = append(result, rt)
		}
	}

	return result
}

// Search filtra traces por método, path, status code
func (s *RequestStore) Search(method, path string, minStatus, maxStatus int) []*RequestTrace {
	s.mu.RLock()
	defer s.mu.RUnlock()

	results := make([]*RequestTrace, 0)
	for _, rt := range s.traces {
		if method != "" && rt.Method != method {
			continue
		}
		if path != "" && rt.Path != path {
			continue
		}
		if minStatus > 0 && rt.StatusCode < minStatus {
			continue
		}
		if maxStatus > 0 && rt.StatusCode > maxStatus {
			continue
		}
		results = append(results, rt)
	}

	// Ordenar por tiempo descendente
	sort.Slice(results, func(i, j int) bool {
		return results[i].StartTime.After(results[j].StartTime)
	})

	return results
}

// Stats retorna estadísticas del store
func (s *RequestStore) Stats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	total := len(s.traces)
	errors := 0
	complete := 0
	var totalDuration int64

	for _, rt := range s.traces {
		if rt.StatusCode >= 400 {
			errors++
		}
		if rt.AccessLogReceived {
			complete++
			totalDuration += rt.DurationMs
		}
	}

	avgDuration := int64(0)
	if complete > 0 {
		avgDuration = totalDuration / int64(complete)
	}

	return map[string]interface{}{
		"total":        total,
		"errors":       errors,
		"complete":     complete,
		"avg_duration": avgDuration,
	}
}

// cleanupLoop elimina traces expirados cada 5 minutos
func (s *RequestStore) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.cleanup()
	}
}

func (s *RequestStore) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-traceExpiry)
	newOrder := make([]string, 0, len(s.order))

	for _, id := range s.order {
		rt, ok := s.traces[id]
		if !ok {
			continue
		}
		if rt.StartTime.Before(cutoff) {
			delete(s.traces, id)
		} else {
			newOrder = append(newOrder, id)
		}
	}
	s.order = newOrder
}
