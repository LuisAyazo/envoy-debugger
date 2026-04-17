package storage

import "time"

// RequestTrace es el modelo central de correlación.
// Agrupa TODOS los eventos de un request usando request_id como clave.
// request_id = x-request-id de Envoy (UUID, siempre presente en access log y logs Lua)
type RequestTrace struct {
	// Identificadores de correlación
	RequestID   string `json:"request_id"`  // x-request-id de Envoy (clave primaria)
	TraceID     string `json:"trace_id"`    // trace_id de traceparent W3C (para OTel si está activo)
	Traceparent string `json:"traceparent"` // header traceparent completo

	// Datos del request
	Method    string `json:"method"`
	Path      string `json:"path"`
	Authority string `json:"authority"`
	UserAgent string `json:"user_agent,omitempty"`

	// Timing
	StartTime  time.Time `json:"start_time"`
	EndTime    time.Time `json:"end_time,omitempty"`
	DurationMs int64     `json:"duration_ms,omitempty"`

	// Respuesta (del access log)
	StatusCode      int    `json:"status_code,omitempty"`
	ResponseFlags   string `json:"response_flags,omitempty"`
	BytesSent       int64  `json:"bytes_sent,omitempty"`
	BytesReceived   int64  `json:"bytes_received,omitempty"`
	UpstreamHost    string `json:"upstream_host,omitempty"`
	UpstreamCluster string `json:"upstream_cluster,omitempty"`

	// Fases del pipeline (logs de Lua)
	Phases []PhaseLog `json:"phases"`

	// Headers del request del cliente (capturados por Lua filter antes del JWT)
	// Disponibles incluso en requests 401/403 que son rechazados antes del Lua de transformación
	RequestHeaders map[string]string `json:"request_headers,omitempty"`

	// JWT claims extraídos (si hay filtro JWT)
	JWTClaims map[string]interface{} `json:"jwt_claims,omitempty"`

	// Estado del access log (true cuando llegó el access log final)
	AccessLogReceived bool `json:"access_log_received"`

	// Errores detectados
	Errors []RequestError `json:"errors,omitempty"`

	// Metadata adicional
	DownstreamIP string `json:"downstream_ip,omitempty"`
}

// PhaseLog representa un evento de fase del pipeline Lua
type PhaseLog struct {
	Phase     string    `json:"phase"` // "initial", "final"
	Event     string    `json:"event"` // "phase_start", "phase_end", "jwt_decoded"
	Timestamp time.Time `json:"timestamp"`

	// Headers antes y después de la transformación
	HeadersBefore map[string]string `json:"headers_before,omitempty"`
	HeadersAfter  map[string]string `json:"headers_after,omitempty"`

	// Datos del request en este punto
	Request *RequestSnapshot `json:"request,omitempty"`

	// JWT claims si este evento los contiene
	JWTClaims map[string]interface{} `json:"jwt_claims,omitempty"`

	// Raw del log original para debugging
	RawLog string `json:"raw_log,omitempty"`
}

// RequestSnapshot captura el estado del request en un punto del pipeline
type RequestSnapshot struct {
	Method    string `json:"method"`
	Path      string `json:"path"`
	Authority string `json:"authority"`
}

// RequestError representa un error detectado en el pipeline
type RequestError struct {
	Phase     string    `json:"phase"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

// EnvoyLogLine representa una línea de log parseada de Envoy
// Puede ser un access log o un log de Lua
type EnvoyLogLine struct {
	// Tipo de log detectado
	Type LogLineType `json:"type"`

	// Campos comunes de correlación
	RequestID string `json:"request_id,omitempty"`
	TraceID   string `json:"trace_id,omitempty"`

	// Campos del access log de Envoy
	AccessLog *AccessLogFields `json:"access_log,omitempty"`

	// Campos de un log de Lua
	LuaLog *LuaLogFields `json:"lua_log,omitempty"`

	// Timestamp del log
	Timestamp time.Time `json:"timestamp"`

	// Raw JSON original
	Raw string `json:"raw"`
}

// LogLineType clasifica el tipo de línea de log
type LogLineType string

const (
	LogTypeAccessLog LogLineType = "access_log"
	LogTypeLuaPhase  LogLineType = "lua_phase"
	LogTypeUnknown   LogLineType = "unknown"
)

// AccessLogFields campos del access log de Envoy (JSON format)
type AccessLogFields struct {
	Timestamp       string `json:"timestamp"`
	Method          string `json:"method"`
	Path            string `json:"path"`
	Protocol        string `json:"protocol"`
	ResponseCode    int    `json:"response_code"`
	ResponseFlags   string `json:"response_flags"`
	DurationMs      int64  `json:"duration_ms"`
	BytesSent       int64  `json:"bytes_sent"`
	BytesReceived   int64  `json:"bytes_received"`
	UserAgent       string `json:"user_agent"`
	RequestID       string `json:"request_id"`
	Traceparent     string `json:"traceparent"`
	UpstreamHost    string `json:"upstream_host"`
	UpstreamCluster string `json:"upstream_cluster"`
	Authority       string `json:"authority"`
	DownstreamIP    string `json:"downstream_remote_address"`
	// RequestHeaders capturados por el Lua filter de captura (includeAllHeaders)
	// Contiene todos los headers del request original del cliente
	RequestHeaders map[string]string `json:"request_headers,omitempty"`
	// JWTClaims capturados por el JWT filter de Envoy via DYNAMIC_METADATA
	// Estructura: { "beforeauth_auth0": {...claims}, "afterauth_usertoken": {...claims} }
	JWTClaims map[string]interface{} `json:"jwt_claims,omitempty"`
}

// LuaLogFields campos de un log de Lua (JSON structured)
type LuaLogFields struct {
	Event         string                 `json:"event"`
	RequestID     string                 `json:"request_id"`
	TraceID       string                 `json:"trace_id"`
	ParentSpanID  string                 `json:"parent_span_id,omitempty"`
	Phase         string                 `json:"phase"`
	Timestamp     string                 `json:"timestamp"`
	TimestampUnix int64                  `json:"timestamp_unix"`
	Request       *RequestSnapshot       `json:"request,omitempty"`
	HeadersBefore map[string]string      `json:"headers_before,omitempty"`
	HeadersAfter  map[string]string      `json:"headers_after,omitempty"`
	JWTClaims     map[string]interface{} `json:"jwt_claims,omitempty"`
}
