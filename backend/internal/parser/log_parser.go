// Package parser clasifica y parsea líneas de log de Envoy (access log + logs Lua)
// Todas las líneas son JSON. La clave de clasificación es el campo "event":
//   - Sin "event" → access log de Envoy
//   - "event": "phase_start" | "phase_end" | "jwt_decoded" | "headers_snapshot" → log de Lua
package parser

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"gateway-debugger/internal/storage"

	"go.uber.org/zap"
)

// LogParser parsea líneas de log crudas de Envoy
type LogParser struct {
	logger *zap.Logger
}

// NewLogParser crea un nuevo parser
func NewLogParser(logger *zap.Logger) *LogParser {
	return &LogParser{logger: logger}
}

// rawLine es la estructura genérica para detectar el tipo de log
type rawLine struct {
	// Campos de Lua logs
	Event     string `json:"event"`
	RequestID string `json:"request_id"`
	TraceID   string `json:"trace_id"`
	Phase     string `json:"phase"`

	// Campos de access log de Envoy
	Method       string `json:"method"`
	Path         string `json:"path"`
	ResponseCode *int   `json:"response_code"`
	DurationMs   *int64 `json:"duration_ms"`
	Traceparent  string `json:"traceparent"`

	// Timestamp (presente en ambos tipos)
	Timestamp     string `json:"timestamp"`
	TimestampUnix *int64 `json:"timestamp_unix"`
}

// extractJSON extrae el JSON de una línea de log de Envoy.
// Los logs Lua tienen el formato:
//
//	[timestamp][thread][level][lua] [source/...] script log: {...json...}
//
// Los access logs llegan como JSON puro.
func extractJSON(line string) string {
	// Si ya empieza con '{', es JSON puro (access log)
	if strings.HasPrefix(line, "{") {
		return line
	}
	// Buscar "script log: {" para logs Lua de Envoy
	const marker = "script log: "
	idx := strings.Index(line, marker)
	if idx != -1 {
		candidate := strings.TrimSpace(line[idx+len(marker):])
		if strings.HasPrefix(candidate, "{") {
			return candidate
		}
	}
	return ""
}

// Parse toma una línea de log cruda y la clasifica
func (p *LogParser) Parse(line string) *storage.EnvoyLogLine {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil
	}

	line = extractJSON(line)
	if line == "" {
		return nil
	}

	var raw rawLine
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		// No es JSON válido, ignorar
		return nil
	}

	result := &storage.EnvoyLogLine{
		Raw:       line,
		Timestamp: p.parseTimestamp(raw.Timestamp, raw.TimestampUnix),
	}

	// Clasificar: si tiene "event" es un log de Lua
	if raw.Event != "" {
		result.Type = storage.LogTypeLuaPhase
		result.TraceID = raw.TraceID
		result.LuaLog = p.parseLuaLog(line, raw)
		// Propagar request_id extraído de x-request-id en headers dentro de parseLuaLog
		if result.LuaLog != nil {
			result.RequestID = result.LuaLog.RequestID
		}
		return result
	}

	// Si tiene response_code y duration_ms es un access log de Envoy
	if raw.ResponseCode != nil && raw.DurationMs != nil {
		result.Type = storage.LogTypeAccessLog
		result.RequestID = raw.RequestID
		// Extraer trace_id del traceparent W3C
		result.TraceID = extractTraceIDFromTraceparent(raw.Traceparent)
		result.AccessLog = p.parseAccessLog(line)
		return result
	}

	result.Type = storage.LogTypeUnknown
	return result
}

// parseLuaLog parsea un log de Lua en su estructura tipada
func (p *LogParser) parseLuaLog(line string, raw rawLine) *storage.LuaLogFields {
	// Parsear el JSON completo para extraer campos anidados
	var full map[string]json.RawMessage
	if err := json.Unmarshal([]byte(line), &full); err != nil {
		return nil
	}

	lua := &storage.LuaLogFields{
		Event:     raw.Event,
		RequestID: raw.RequestID,
		TraceID:   raw.TraceID,
		Phase:     raw.Phase,
		Timestamp: raw.Timestamp,
	}

	if raw.TimestampUnix != nil {
		lua.TimestampUnix = *raw.TimestampUnix
	}

	// Extraer parent_span_id si existe
	if v, ok := full["parent_span_id"]; ok {
		json.Unmarshal(v, &lua.ParentSpanID) //nolint:errcheck
	}

	// Extraer request snapshot
	if v, ok := full["request"]; ok {
		var req storage.RequestSnapshot
		if err := json.Unmarshal(v, &req); err == nil {
			lua.Request = &req
		}
	}

	// Si request_id no vino en el top-level, intentar extraerlo de los headers
	// Los logs Lua de Envoy ponen x-request-id dentro de "headers"
	if lua.RequestID == "" {
		if v, ok := full["headers"]; ok {
			var hdrs map[string]string
			if err := json.Unmarshal(v, &hdrs); err == nil {
				if rid, ok := hdrs["x-request-id"]; ok && rid != "" {
					lua.RequestID = rid
				}
			}
		}
	}

	// Extraer headers_before (campo explícito o "headers" en phase_start/response_phase_start/client_request)
	if v, ok := full["headers_before"]; ok {
		var headers map[string]string
		if err := json.Unmarshal(v, &headers); err == nil {
			lua.HeadersBefore = headers
		}
	} else if v, ok := full["headers"]; ok && (raw.Event == "phase_start" || raw.Event == "response_phase_start" || raw.Event == "client_request") {
		var headers map[string]string
		if err := json.Unmarshal(v, &headers); err == nil {
			lua.HeadersBefore = headers
			// Para client_request, también extraer request_id de los headers si no está en top-level
			if raw.Event == "client_request" && lua.RequestID == "" {
				if rid, ok := headers["x-request-id"]; ok && rid != "" {
					lua.RequestID = rid
				}
			}
		}
	}

	// Extraer headers_after (campo explícito o "headers" en phase_end/response_phase_end)
	if v, ok := full["headers_after"]; ok {
		var headers map[string]string
		if err := json.Unmarshal(v, &headers); err == nil {
			lua.HeadersAfter = headers
		}
	} else if v, ok := full["headers"]; ok && (raw.Event == "phase_end" || raw.Event == "response_phase_end") {
		var headers map[string]string
		if err := json.Unmarshal(v, &headers); err == nil {
			lua.HeadersAfter = headers
		}
	}

	// Extraer jwt_claims si existen en el log
	if v, ok := full["jwt_claims"]; ok {
		var claims map[string]interface{}
		if err := json.Unmarshal(v, &claims); err == nil {
			lua.JWTClaims = claims
		}
	}

	// Si no hay jwt_claims, intentar extraerlos del header Authorization
	if lua.JWTClaims == nil {
		// Buscar en headers_before o headers_after
		var authToken string
		if lua.HeadersBefore != nil {
			if v, ok := lua.HeadersBefore["authorization"]; ok {
				authToken = v
			}
		}
		if authToken == "" && lua.HeadersAfter != nil {
			if v, ok := lua.HeadersAfter["authorization"]; ok {
				authToken = v
			}
		}
		if authToken != "" {
			if claims := extractJWTClaims(authToken); claims != nil {
				lua.JWTClaims = claims
			}
		}
	}

	return lua
}

// extractJWTClaims extrae los claims del payload de un JWT sin verificar la firma.
// Soporta formato "Bearer <token>" o el token directo.
func extractJWTClaims(token string) map[string]interface{} {
	// Quitar prefijo "Bearer "
	token = strings.TrimPrefix(token, "Bearer ")
	token = strings.TrimSpace(token)

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil
	}

	// El payload es la segunda parte, codificado en base64url
	payload := parts[1]
	// Añadir padding si es necesario
	switch len(payload) % 4 {
	case 2:
		payload += "=="
	case 3:
		payload += "="
	}

	decoded, err := base64.URLEncoding.DecodeString(payload)
	if err != nil {
		// Intentar con RawURLEncoding (sin padding)
		decoded, err = base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil {
			return nil
		}
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(decoded, &claims); err != nil {
		return nil
	}
	return claims
}

// parseAccessLog parsea un access log de Envoy en su estructura tipada
func (p *LogParser) parseAccessLog(line string) *storage.AccessLogFields {
	var fields storage.AccessLogFields
	if err := json.Unmarshal([]byte(line), &fields); err != nil {
		return nil
	}
	return &fields
}

// parseTimestamp convierte timestamp string o unix a time.Time
func (p *LogParser) parseTimestamp(ts string, unix *int64) time.Time {
	if unix != nil && *unix > 0 {
		return time.Unix(*unix, 0)
	}
	if ts != "" {
		// Intentar formato ISO 8601
		t, err := time.Parse(time.RFC3339, ts)
		if err == nil {
			return t
		}
		// Intentar formato de Envoy: 2026-04-16T18:00:00.000Z
		t, err = time.Parse("2006-01-02T15:04:05.000Z", ts)
		if err == nil {
			return t
		}
	}
	return time.Now()
}

// extractTraceIDFromTraceparent extrae el trace_id del header W3C traceparent
// Formato: 00-{trace_id_32hex}-{parent_id_16hex}-{flags_2hex}
func extractTraceIDFromTraceparent(traceparent string) string {
	if traceparent == "" || traceparent == "-" {
		return ""
	}
	parts := strings.Split(traceparent, "-")
	if len(parts) >= 2 {
		return parts[1]
	}
	return ""
}
