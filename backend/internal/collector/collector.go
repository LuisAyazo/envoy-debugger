// Package collector implementa la correlación real de logs de Envoy.
// El Correlator recibe líneas de log crudas, las parsea y las agrupa
// por request_id en un RequestTrace completo.
package collector

import (
	"context"
	"time"

	"gateway-debugger/internal/parser"
	"gateway-debugger/internal/storage"

	"go.uber.org/zap"
)

// Correlator correlaciona logs de Envoy por request_id.
// Recibe líneas de log crudas via Feed() y las agrupa en RequestTrace.
type Correlator struct {
	store    *storage.RequestStore
	parser   *parser.LogParser
	logger   *zap.Logger
	logCh    chan string // líneas de log crudas
	updateCh chan string // request_id actualizado (para WebSocket)
}

// NewCorrelator crea un nuevo correlator
func NewCorrelator(store *storage.RequestStore, logger *zap.Logger) *Correlator {
	return &Correlator{
		store:    store,
		parser:   parser.NewLogParser(logger),
		logger:   logger,
		logCh:    make(chan string, 10000),
		updateCh: make(chan string, 1000),
	}
}

// Feed envía una línea de log cruda al correlator (non-blocking)
func (c *Correlator) Feed(line string) {
	select {
	case c.logCh <- line:
	default:
		c.logger.Warn("Log channel full, dropping line")
	}
}

// Updates retorna el canal de notificaciones de actualizaciones (para WebSocket)
func (c *Correlator) Updates() <-chan string {
	return c.updateCh
}

// Start inicia el loop de correlación en background
func (c *Correlator) Start(ctx context.Context) {
	go c.processLoop(ctx)
}

// processLoop procesa líneas de log del canal y las correlaciona
func (c *Correlator) processLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case line, ok := <-c.logCh:
			if !ok {
				return
			}
			c.processLine(line)
		}
	}
}

// processLine parsea una línea y la agrega al RequestTrace correspondiente
func (c *Correlator) processLine(line string) {
	parsed := c.parser.Parse(line)
	if parsed == nil || parsed.RequestID == "" {
		return
	}

	var rt *storage.RequestTrace

	switch parsed.Type {
	case storage.LogTypeAccessLog:
		rt = c.buildFromAccessLog(parsed)
	case storage.LogTypeLuaPhase:
		rt = c.buildFromLuaLog(parsed)
	default:
		return
	}

	if rt == nil {
		return
	}

	c.store.Upsert(rt)

	// Notificar actualización (non-blocking)
	select {
	case c.updateCh <- rt.RequestID:
	default:
	}
}

// buildFromAccessLog construye un RequestTrace parcial desde un access log
func (c *Correlator) buildFromAccessLog(parsed *storage.EnvoyLogLine) *storage.RequestTrace {
	al := parsed.AccessLog
	if al == nil {
		return nil
	}

	rt := &storage.RequestTrace{
		RequestID:         parsed.RequestID,
		TraceID:           parsed.TraceID,
		Traceparent:       al.Traceparent,
		Method:            al.Method,
		Path:              al.Path,
		Authority:         al.Authority,
		UserAgent:         al.UserAgent,
		StatusCode:        al.ResponseCode,
		DurationMs:        al.DurationMs,
		BytesSent:         al.BytesSent,
		BytesReceived:     al.BytesReceived,
		UpstreamHost:      al.UpstreamHost,
		UpstreamCluster:   al.UpstreamCluster,
		ResponseFlags:     al.ResponseFlags,
		DownstreamIP:      al.DownstreamIP,
		AccessLogReceived: true,
		EndTime:           parsed.Timestamp,
		// Headers del cliente capturados por el Lua filter de captura (includeAllHeaders)
		RequestHeaders: al.RequestHeaders,
		// JWT claims capturados por el JWT filter via DYNAMIC_METADATA (payload_in_metadata)
		JWTClaims: al.JWTClaims,
	}

	// Detectar errores por status code
	if al.ResponseCode >= 400 {
		rt.Errors = append(rt.Errors, storage.RequestError{
			Phase:     "upstream",
			Message:   statusMessage(al.ResponseCode),
			Timestamp: parsed.Timestamp,
		})
	}

	// Detectar errores por response flags (UH=upstream unhealthy, UF=upstream failure, etc.)
	if al.ResponseFlags != "" && al.ResponseFlags != "-" {
		rt.Errors = append(rt.Errors, storage.RequestError{
			Phase:     "envoy",
			Message:   "Response flags: " + al.ResponseFlags,
			Timestamp: parsed.Timestamp,
		})
	}

	// Calcular StartTime desde EndTime - DurationMs
	if al.DurationMs > 0 {
		rt.StartTime = parsed.Timestamp.Add(-time.Duration(al.DurationMs) * time.Millisecond)
	} else {
		rt.StartTime = parsed.Timestamp
	}

	c.logger.Debug("Access log correlated",
		zap.String("request_id", rt.RequestID),
		zap.String("method", rt.Method),
		zap.String("path", rt.Path),
		zap.Int("status", rt.StatusCode),
		zap.Int64("duration_ms", rt.DurationMs),
	)

	return rt
}

// buildFromLuaLog construye un RequestTrace parcial desde un log de Lua
func (c *Correlator) buildFromLuaLog(parsed *storage.EnvoyLogLine) *storage.RequestTrace {
	lua := parsed.LuaLog
	if lua == nil {
		return nil
	}

	rt := &storage.RequestTrace{
		RequestID: parsed.RequestID,
		TraceID:   parsed.TraceID,
		StartTime: parsed.Timestamp,
	}

	// Evento especial: client_request captura los headers originales del cliente
	// ANTES de cualquier procesamiento JWT/WASM — no se agrega como fase
	if lua.Event == "client_request" {
		if len(lua.HeadersBefore) > 0 {
			rt.RequestHeaders = lua.HeadersBefore
			// Extraer method/path/authority de los headers del cliente
			if m, ok := lua.HeadersBefore[":method"]; ok {
				rt.Method = m
			}
			if p, ok := lua.HeadersBefore[":path"]; ok {
				rt.Path = p
			}
			if a, ok := lua.HeadersBefore[":authority"]; ok {
				rt.Authority = a
			}
		}
		c.logger.Debug("Client request headers captured",
			zap.String("request_id", rt.RequestID),
			zap.Int("headers_count", len(lua.HeadersBefore)),
		)
		return rt
	}

	// Extraer datos del request si están disponibles
	if lua.Request != nil {
		rt.Method = lua.Request.Method
		rt.Path = lua.Request.Path
		rt.Authority = lua.Request.Authority
	}

	// Construir la fase
	phase := storage.PhaseLog{
		Phase:     lua.Phase,
		Event:     lua.Event,
		Timestamp: parsed.Timestamp,
		RawLog:    parsed.Raw,
	}

	if lua.Request != nil {
		phase.Request = lua.Request
	}
	if len(lua.HeadersBefore) > 0 {
		phase.HeadersBefore = lua.HeadersBefore
	}
	if len(lua.HeadersAfter) > 0 {
		phase.HeadersAfter = lua.HeadersAfter
	}
	if len(lua.JWTClaims) > 0 {
		phase.JWTClaims = lua.JWTClaims
		rt.JWTClaims = lua.JWTClaims
	}
	if lua.ResponseBody != "" {
		phase.ResponseBody = lua.ResponseBody
	}
	if lua.ResponseBodySkipped != "" {
		phase.ResponseBodySkipped = lua.ResponseBodySkipped
	}

	rt.Phases = []storage.PhaseLog{phase}

	c.logger.Debug("Lua log correlated",
		zap.String("request_id", rt.RequestID),
		zap.String("event", lua.Event),
		zap.String("phase", lua.Phase),
	)

	return rt
}

// statusMessage retorna un mensaje descriptivo para un status code HTTP
func statusMessage(code int) string {
	messages := map[int]string{
		400: "Bad Request",
		401: "Unauthorized - JWT validation failed",
		403: "Forbidden",
		404: "Not Found",
		429: "Too Many Requests - Rate limit exceeded",
		500: "Internal Server Error",
		502: "Bad Gateway - Upstream error",
		503: "Service Unavailable",
		504: "Gateway Timeout",
	}
	if msg, ok := messages[code]; ok {
		return msg
	}
	if code >= 400 && code < 500 {
		return "Client Error"
	}
	if code >= 500 {
		return "Server Error"
	}
	return "Unknown Error"
}
