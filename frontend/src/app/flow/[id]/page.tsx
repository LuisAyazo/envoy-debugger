"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, Play, AlertTriangle, ArrowLeft,
  Download, Network, Layers, Activity, BarChart3, Copy, Code,
  RefreshCw, Search, Eye, EyeOff, Filter, Diff, Server, Globe, ChevronsUpDown
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ─── Helpers ────────────────────────────────────────────────────────────────

const SENSITIVE_HEADERS = new Set([
  "authorization", "x-vix-user-token", "cookie", "set-cookie",
  "x-api-key", "x-auth-token", "proxy-authorization",
]);

// Headers que son JWT y se pueden decodificar (aunque sean "sensibles", se decodifican si showSensitive=true)
const JWT_HEADERS = new Set([
  "authorization", "x-vix-user-token",
]);

const BASE64_HEADERS = new Set([
  "x-vix-subscription-info", "x-vix-gty", "x-vix-available-profile-ids",
  "profile-id", "x-vix-profile", "x-vix-user-info",
  "x-vix-advertising-token", "x-vix-subscription-info-user-token",
  "profile-extended",
]);

// Mapa de nombres de fases para mostrar nombres más amigables
const PHASE_NAME_MAP: Record<string, string> = {
  "Initial Transformation (After JWT BeforeAuth)": "Transformación Inicial (Post-JWT BeforeAuth)",
  "Final Transformation (After JWT AfterAuth)": "Transformación Final (Post-JWT AfterAuth)",
};

function friendlyPhaseName(name: string): string {
  return PHASE_NAME_MAP[name] ?? name;
}

// Lista BLANCA de headers que el cliente puede enviar originalmente.
// Todo lo que no esté aquí es considerado agregado por Envoy/JWT/Lua.
const CLIENT_HEADERS_WHITELIST = new Set([
  // Pseudo-headers HTTP/2
  ":authority", ":method", ":path", ":scheme", ":status",
  // Headers HTTP estándar que el cliente envía
  "accept", "accept-encoding", "accept-language", "accept-charset",
  "authorization", "cache-control", "connection", "content-encoding",
  "content-length", "content-type", "cookie", "host",
  "if-match", "if-modified-since", "if-none-match", "if-range",
  "if-unmodified-since", "origin", "pragma", "range",
  "referer", "te", "transfer-encoding", "upgrade",
  "user-agent", "via",
  // Headers de aplicación que el cliente envía explícitamente
  "x-vix-user-token", "x-vix-api-key", "x-vix-country-code",
  "x-vix-country-code-override", "x-vix-country-code-ssr",
  "x-vix-web-client-ip", "x-vix-platform",
  "fastly-client-ip", "x-real-ip",
  // Headers de correlación que el cliente puede enviar
  "x-correlation-id", "x-trace-id",
]);

function isEnvoyInternal(key: string): boolean {
  const k = key.toLowerCase();
  // Si está en la lista blanca, NO es interno de Envoy
  if (CLIENT_HEADERS_WHITELIST.has(k)) return false;
  // Todo lo demás es considerado agregado por Envoy/JWT/Lua
  return true;
}

function tryDecodeBase64(value: string): { decoded: string; isJson: boolean } | null {
  try {
    const cleaned = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
    const decoded = atob(padded);
    try {
      const parsed = JSON.parse(decoded);
      return { decoded: JSON.stringify(parsed, null, 2), isJson: true };
    } catch {
      return { decoded, isJson: false };
    }
  } catch {
    return null;
  }
}

function tryDecodeJWT(token: string): { decoded: string } | null {
  try {
    const t = token.replace(/^Bearer\s+/i, "").trim();
    const parts = t.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);
    return { decoded: JSON.stringify(parsed, null, 2) };
  } catch {
    return null;
  }
}

const TRUNCATE_LEN = 120;

// Detecta si un valor de header es vacío/inútil: "", "[]", "{}", "null", "undefined"
function isEmptyHeaderValue(value: string): boolean {
  const v = value.trim();
  return v === "" || v === "[]" || v === "{}" || v === "null" || v === "undefined" || v === "W10=" /* [] en base64 */;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Mapa de response_flags de Envoy con descripción
const RESPONSE_FLAGS_MAP: Record<string, string> = {
  "NR": "No Route — Envoy no encontró ruta al upstream (path no configurado o no coincide con ninguna ruta)",
  "UH": "Upstream Unhealthy — No hay hosts sanos en el cluster upstream",
  "UF": "Upstream Connection Failure — Fallo al conectar con el upstream",
  "UO": "Upstream Overflow — Circuit breaker abierto",
  "URX": "Upstream Retry Exhausted — Se agotaron los reintentos al upstream",
  "NC": "No Cluster — El cluster upstream no existe",
  "DT": "Duration Timeout — Timeout de duración máxima del request",
  "UT": "Upstream Request Timeout — Timeout esperando respuesta del upstream",
  "LR": "Local Reset — Envoy cerró la conexión localmente",
  "RL": "Rate Limited — Request limitado por rate limiting",
  "UAEX": "Unauthorized External Service — ExtAuth rechazó el request",
  "RLSE": "Rate Limit Service Error — Error en el servicio de rate limiting",
  "IH": "Invalid Header — Header inválido en el request",
  "SI": "Stream Idle Timeout — Timeout de stream inactivo",
  "DPE": "Downstream Protocol Error — Error de protocolo del cliente",
  "-": "Sin flags — Request completado normalmente",
};

function getResponseFlagInfo(flag: string): { desc: string; isError: boolean } {
  const desc = RESPONSE_FLAGS_MAP[flag] ?? `Flag: ${flag}`;
  const isError = flag !== "-" && flag !== "";
  return { desc, isError };
}

// ─── Syntax highlighting para JSON ───────────────────────────────────────────
function JsonHighlight({ json }: { json: string }) {
  const lines = json.split("\n");
  return (
    <code className="font-mono text-xs">
      {lines.map((line, i) => {
        // Colorear tokens: keys, strings, numbers, booleans, null
        const parts: React.ReactNode[] = [];
        let rest = line;
        let key = 0;
        // key: "word":
        rest = rest.replace(/^(\s*)("(?:[^"\\]|\\.)*")(\s*:)/g, (_, sp, k, colon) => {
          parts.push(<span key={key++} className="text-gray-300">{sp}</span>);
          parts.push(<span key={key++} className="text-cyan-300">{k}</span>);
          parts.push(<span key={key++} className="text-gray-400">{colon}</span>);
          return "\x00";
        });
        if (rest.includes("\x00")) {
          // value after colon
          const after = rest.replace("\x00", "");
          parts.push(...tokenizeValue(after, key));
        } else {
          parts.push(...tokenizeValue(rest, key));
        }
        return <div key={i}>{parts.length ? parts : line}</div>;
      })}
    </code>
  );
}

function tokenizeValue(text: string, startKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let k = startKey;
  // Match tokens: string, number, true, false, null, punctuation, whitespace
  const re = /("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|([{}\[\],])|(\s+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={k++} className="text-gray-300">{text.slice(last, m.index)}</span>);
    if (m[1]) parts.push(<span key={k++} className="text-green-400">{m[1]}</span>);
    else if (m[2]) parts.push(<span key={k++} className="text-yellow-400">{m[2]}</span>);
    else if (m[3]) parts.push(<span key={k++} className="text-orange-400">{m[3]}</span>);
    else if (m[4]) parts.push(<span key={k++} className="text-red-400">{m[4]}</span>);
    else parts.push(<span key={k++} className="text-gray-400">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={k++} className="text-gray-300">{text.slice(last)}</span>);
  return parts;
}

export default function FlowPage() {
  const params = useParams();
  const requestId = params.id as string;

  const [flowData, setFlowData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [selectedView, setSelectedView] = useState<"phases" | "raw">("phases");
  const [showSensitive, setShowSensitive] = useState(true);
  const [globalDecode, setGlobalDecode] = useState(true);
  const [globalSearch, setGlobalSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<"all" | "phase_start" | "phase_end" | "response_phase_start" | "response_phase_end" | "error">("all");
  const [clientExpanded, setClientExpanded] = useState(true);
  const [upstreamExpanded, setUpstreamExpanded] = useState(false);
  const [responseExpanded, setResponseExpanded] = useState(false);

  const fetchFlow = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/requests/${encodeURIComponent(requestId)}/flow`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Request no encontrado");
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setFlowData(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    fetchFlow();
  }, [fetchFlow]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-cyan-400">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span>Cargando flujo del request...</span>
        </div>
      </div>
    );
  }

  if (error || !flowData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <AlertTriangle className="w-16 h-16 text-red-400 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Error al cargar el request</h1>
        <p className="text-gray-400 mb-6">{error || "No se encontraron datos"}</p>
        <Link href="/requests">
          <button className="px-6 py-3 rounded-xl glass-strong hover:bg-white/10 text-white font-semibold flex items-center gap-2">
            <ArrowLeft className="w-5 h-5" />
            Volver a Requests
          </button>
        </Link>
      </div>
    );
  }

  // Helper components
  function ViewTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all ${
          active 
            ? 'glass-strong border-2 border-cyan-400 glow-cyan text-white' 
            : 'glass hover:glass-strong text-gray-400 hover:text-white'
        }`}
      >
        {icon}
        <span className="font-semibold">{label}</span>
      </motion.button>
    );
  }

  return (
    <div className="min-h-screen">
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-white/10 glass-strong backdrop-blur-xl sticky top-0 z-50"
      >
        <div className="max-w-screen-2xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/requests">
                <motion.button 
                  whileHover={{ scale: 1.1, x: -5 }}
                  className="w-10 h-10 rounded-xl glass hover:glass-strong flex items-center justify-center glow-cyan"
                >
                  <ArrowLeft className="w-5 h-5 text-cyan-400" />
                </motion.button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold gradient-text">Request Flow</h1>
                <p className="text-sm text-purple-300/60">
                  <span className="text-gray-400">{flowData.method}</span> <code className="text-cyan-400">{flowData.path}</code> • 
                  ID: <code className="text-cyan-400">{flowData.request_id}</code>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`px-4 py-2 rounded-lg glass-strong text-sm ${
                flowData.status_code >= 200 && flowData.status_code < 300 ? "glow-green" :
                flowData.status_code >= 400 ? "glow-red" : ""
              }`}>
                <span className={`font-semibold ${
                  flowData.status_code >= 200 && flowData.status_code < 300 ? "text-green-300" :
                  flowData.status_code >= 400 ? "text-red-300" : "text-yellow-300"
                }`}>
                  {flowData.status_code >= 200 && flowData.status_code < 300 ? "✅" : "❌"} {flowData.status_code}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-screen-2xl mx-auto px-4 py-8 space-y-6">
        
        {/* Request Metadata Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-strong rounded-2xl p-6"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                <Activity className="w-3 h-3" />
                Trace ID
              </div>
              <code className="text-sm text-cyan-400 font-mono">{flowData.trace_id || "—"}</code>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Total Duration
              </div>
              <div className="text-sm text-purple-400 font-bold">{flowData.duration_ms}ms</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                <Network className="w-3 h-3" />
                Upstream
              </div>
              <div className="text-sm text-white truncate" title={flowData.upstream_cluster}>{flowData.upstream_cluster || "—"}</div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:glass-strong text-sm"
                onClick={() => navigator.clipboard.writeText(JSON.stringify(flowData, null, 2))}
              >
                <Download className="w-4 h-4 text-green-400" />
                <span>Export JSON</span>
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* JWT Claims Panel — cada claim etiquetado con su stage/provider */}
        {/* Panel JWT Claims: mostrar si hay jwt_claims O si hay request_headers con algún JWT */}
        {(() => {
          // Detectar si hay algún JWT en request_headers (cualquier header que sea un Bearer token o JWT)
          const reqHdrs = flowData.request_headers as Record<string, string> | null;
          const hasJwtInReqHeaders = reqHdrs && Object.values(reqHdrs).some(v =>
            typeof v === "string" && (v.startsWith("Bearer ") || (v.split(".").length === 3 && v.length > 50))
          );
          const rawJwtClaims = flowData.jwt_claims as Record<string, any> | null;
          const hasJwtClaims = rawJwtClaims && Object.keys(rawJwtClaims).length > 0;
          if (!hasJwtClaims && !hasJwtInReqHeaders) return null;

          const phases = flowData.phases ?? [];

          function findHeaderInPhases(headerName: string): string | null {
            for (const p of phases) {
              const hdrs = p.headers_after ?? p.headers_before ?? {};
              if (hdrs[headerName]) return hdrs[headerName];
            }
            for (const p of phases) {
              if (p.headers_before?.[headerName]) return p.headers_before[headerName];
            }
            if (flowData.request_headers?.[headerName]) return flowData.request_headers[headerName];
            return null;
          }

          function decodeJWTPayload(token: string): Record<string, any> | null {
            try {
              const t = token.replace(/^Bearer\s+/i, "").trim();
              const parts = t.split(".");
              if (parts.length !== 3) return null;
              const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
              const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
              return JSON.parse(atob(padded));
            } catch { return null; }
          }

          // ── Estrategia 1: usar jwt_claims del operador (nuevo formato con PayloadInMetadata) ──
          // Estructura: { "beforeauth_auth0": {...}, "beforeauth_selfminted": {...}, "afterauth_usertoken": {...} }
          // ── Estrategia 2 (fallback): decodificar tokens directamente desde request_headers ──

          let beforeAuthClaims: Record<string, any> = {};
          let afterAuthClaims: Record<string, any> = {};
          let beforeProvider = "beforeAuth";
          let afterProvider = "usertoken";

          // Detectar si jwt_claims tiene el nuevo formato de providers (keys con beforeauth_/afterauth_)
          const hasProviderFormat = hasJwtClaims && Object.keys(rawJwtClaims!).some(k =>
            k.startsWith("beforeauth_") || k.startsWith("afterauth_")
          );

          if (hasProviderFormat && rawJwtClaims) {
            // Nuevo formato: extraer claims por provider
            for (const [key, claims] of Object.entries(rawJwtClaims)) {
              if (key.startsWith("beforeauth_") && typeof claims === "object" && claims !== null) {
                // Mergear claims de todos los beforeauth providers
                beforeAuthClaims = { ...beforeAuthClaims, ...(claims as Record<string, any>) };
                // Inferir provider name desde el key (e.g., "beforeauth_auth0" → "auth0")
                const pname = key.replace("beforeauth_", "");
                if (!beforeProvider || beforeProvider === "beforeAuth") beforeProvider = pname;
              } else if (key.startsWith("afterauth_") && typeof claims === "object" && claims !== null) {
                afterAuthClaims = { ...afterAuthClaims, ...(claims as Record<string, any>) };
                afterProvider = key.replace("afterauth_", "");
              }
            }
            // Refinar beforeProvider desde claim "sub" si está disponible
            const sub = String(beforeAuthClaims["sub"] ?? "");
            if (sub.startsWith("auth0|")) beforeProvider = "auth0";
            else if (sub) beforeProvider = "selfminted";
          } else {
            // Fallback: decodificar tokens directamente desde headers
            const authToken = findHeaderInPhases("authorization");
            const userToken = findHeaderInPhases("x-vix-user-token");
            beforeAuthClaims = authToken ? (decodeJWTPayload(authToken) ?? {}) : {};
            afterAuthClaims = userToken ? (decodeJWTPayload(userToken) ?? {}) : {};
            const beforeSub = String(beforeAuthClaims["sub"] ?? "");
            beforeProvider = beforeSub.startsWith("auth0|") ? "auth0" : beforeSub ? "selfminted" : "beforeAuth";
          }

          const hasStageInfo = Object.keys(beforeAuthClaims).length > 0 || Object.keys(afterAuthClaims).length > 0;

          function ClaimCard({ claimKey, value, color }: { claimKey: string; value: any; color: string }) {
            return (
              <div className={`border rounded-lg p-2.5 ${color}`}>
                <div className="text-[10px] text-gray-400 font-mono mb-1 truncate" title={claimKey}>{claimKey}</div>
                <code className="text-xs text-yellow-300 font-mono break-all">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </code>
              </div>
            );
          }

          if (!hasStageInfo) {
            // Sin tokens encontrados: mostrar jwt_claims global plano
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="glass-strong rounded-2xl p-6 border-2 border-yellow-500/20"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Code className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-xl font-bold gradient-text">JWT Claims Extraídos</h3>
                  <span className="text-xs text-gray-400">{Object.keys(flowData.jwt_claims).length} claims</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {Object.entries(flowData.jwt_claims).map(([k, v]) => (
                    <ClaimCard key={k} claimKey={k} value={v} color="bg-black/30 border-white/5" />
                  ))}
                </div>
              </motion.div>
            );
          }

          return (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass-strong rounded-2xl p-6 border-2 border-yellow-500/20"
            >
              <div className="flex items-center gap-3 mb-5">
                <Code className="w-5 h-5 text-yellow-400" />
                <h3 className="text-xl font-bold gradient-text">JWT Claims Extraídos</h3>
                <span className="text-xs text-gray-400">
                  {Object.keys(beforeAuthClaims).length + Object.keys(afterAuthClaims).length} claims
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* BeforeAuth — authorization header */}
                {Object.keys(beforeAuthClaims).length > 0 && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block"></span>
                      <span className="text-sm font-bold text-blue-300">BeforeAuth</span>
                      <span className="text-xs text-blue-400/70 font-mono">· {beforeProvider}</span>
                      <span className="ml-auto text-[10px] text-gray-500">{Object.keys(beforeAuthClaims).length} claims</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {Object.entries(beforeAuthClaims).map(([k, v]) => (
                        <ClaimCard key={k} claimKey={k} value={v} color="bg-blue-500/5 border-blue-500/10" />
                      ))}
                    </div>
                  </div>
                )}

                {/* AfterAuth — x-vix-user-token header */}
                {Object.keys(afterAuthClaims).length > 0 && (
                  <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block"></span>
                      <span className="text-sm font-bold text-purple-300">AfterAuth</span>
                      <span className="text-xs text-purple-400/70 font-mono">· {afterProvider}</span>
                      <span className="ml-auto text-[10px] text-gray-500">{Object.keys(afterAuthClaims).length} claims</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {Object.entries(afterAuthClaims).map(([k, v]) => (
                        <ClaimCard key={k} claimKey={k} value={v} color="bg-purple-500/5 border-purple-500/10" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })()}

        {/* Error Alert */}
        {flowData.errors && flowData.errors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="glass-strong rounded-2xl p-6 border-2 border-red-500/30 glow-red"
          >
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-8 h-8 text-red-400 flex-shrink-0 animate-pulse" />
              <div className="w-full">
                <div className="text-red-300 font-bold text-lg mb-4">⚠️ Errores Detectados ({flowData.errors.length})</div>
                <div className="space-y-3">
                  {flowData.errors.map((err: any, idx: number) => (
                    <div key={idx} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-bold text-red-400 uppercase">{err.phase}</span>
                        <span className="text-xs text-gray-400">{new Date(err.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-sm text-red-200">{err.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Toolbar: View Selector + Sensitive Toggle + Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex flex-wrap items-center gap-3"
        >
          <ViewTab icon={<Layers className="w-4 h-4" />} label="Fases Lua" active={selectedView === "phases"} onClick={() => setSelectedView("phases")} />
          <ViewTab icon={<BarChart3 className="w-4 h-4" />} label="Raw JSON" active={selectedView === "raw"} onClick={() => setSelectedView("raw")} />

          <div className="flex-1" />

          {/* Sensitive toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSensitive(s => !s)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
              showSensitive
                ? "glass-strong border border-yellow-400/50 text-yellow-300"
                : "glass text-gray-400 hover:text-white"
            }`}
            title={showSensitive ? "Ocultar headers sensibles" : "Mostrar headers sensibles"}
          >
            {showSensitive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{showSensitive ? "Ocultar sensibles" : "Mostrar sensibles"}</span>
          </motion.button>

          {/* Global decode toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setGlobalDecode(d => !d)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
              globalDecode
                ? "glass-strong border border-green-400/50 text-green-300"
                : "glass text-gray-400 hover:text-white"
            }`}
            title={globalDecode ? "Ocultar decodificación de base64/JWT" : "Decodificar automáticamente base64/JWT en todos los headers"}
          >
            <Code className="w-4 h-4" />
            <span>{globalDecode ? "Ocultar decode" : "Decodificar todo"}</span>
          </motion.button>

          {/* Global search */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar header..."
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-xl glass text-sm text-white placeholder-gray-500 border border-white/10 focus:border-cyan-400/50 outline-none w-48"
            />
          </div>
        </motion.div>

        {/* Fases Lua View */}
        {selectedView === "phases" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-strong rounded-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10 bg-white/5">
              <GitBranch className="w-6 h-6 text-cyan-400" />
              <h2 className="text-2xl font-bold gradient-text">Pipeline de Fases Lua</h2>
              <span className="ml-auto text-xs text-gray-400">{flowData.phases?.length ?? 0} eventos</span>
            </div>

            {/* Timeline visual — usa índice ordinal #N cuando todos los timestamps son iguales */}
            {flowData.phases && flowData.phases.length > 0 && (() => {
              const allSameTs = flowData.phases.every((p: any) => p.timestamp === flowData.phases[0].timestamp);
              return (
                <div className="px-6 pt-4 pb-2 flex items-center gap-0 overflow-x-auto">
                  {flowData.phases.map((phase: any, idx: number) => {
                    const isIncomplete = phase.event === "phase_start" &&
                      !flowData.phases.slice(idx + 1).some((p: any) => p.phase === phase.phase && p.event === "phase_end");
                    const isResponse = phase.event === "response_phase_start" || phase.event === "response_phase_end";
                    const t0 = new Date(flowData.phases[0].timestamp).getTime();
                    const relMs = new Date(phase.timestamp).getTime() - t0;
                    return (
                      <div key={idx} className="flex items-center">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full border-2 ${
                            isIncomplete ? "border-yellow-400 bg-yellow-400/30" :
                            phase.event === "phase_end" ? "border-green-400 bg-green-400/30" :
                            phase.event === "response_phase_end" ? "border-orange-400 bg-orange-400/30" :
                            phase.event === "response_phase_start" ? "border-amber-400 bg-amber-400/30" :
                            phase.event === "error" ? "border-red-400 bg-red-400/30" :
                            "border-blue-400 bg-blue-400/30"
                          }`} />
                          <div className="text-[9px] text-gray-500 mt-1 whitespace-nowrap">
                            {allSameTs ? `#${idx + 1}` : `+${relMs}ms`}
                          </div>
                          <div className="text-[9px] text-gray-400 whitespace-nowrap max-w-[70px] truncate">{phase.phase}</div>
                        </div>
                        {idx < flowData.phases.length - 1 && (
                          <div className="w-8 h-px bg-white/20 mx-1" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Event filter chips */}
            <div className="px-6 pb-2 flex items-center gap-2 flex-wrap">
              <Filter className="w-3 h-3 text-gray-500" />
              {([
                { key: "all", label: "Todos", activeClass: "bg-cyan-500/30 border-cyan-400/60 text-cyan-300" },
                { key: "phase_start", label: "Request Start", activeClass: "bg-blue-500/30 border-blue-400/60 text-blue-300" },
                { key: "phase_end", label: "Request End", activeClass: "bg-green-500/30 border-green-400/60 text-green-300" },
                { key: "response_phase_start", label: "Response Start", activeClass: "bg-amber-500/30 border-amber-400/60 text-amber-300" },
                { key: "response_phase_end", label: "Response End", activeClass: "bg-orange-500/30 border-orange-400/60 text-orange-300" },
                { key: "error", label: "Errores", activeClass: "bg-red-500/30 border-red-400/60 text-red-300" },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setEventFilter(f.key as any)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                    eventFilter === f.key
                      ? f.activeClass
                      : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <div className="flex-1" />
              {/* Expand/collapse all */}
              <button
                onClick={() => {
                  const phases = flowData.phases ?? [];
                  if (expandedSteps.size === phases.length) {
                    setExpandedSteps(new Set());
                  } else {
                    setExpandedSteps(new Set(phases.map((_: any, i: number) => i)));
                  }
                }}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-all"
              >
                <ChevronsUpDown className="w-3 h-3" />
                {expandedSteps.size === (flowData.phases?.length ?? 0) ? "Colapsar todo" : "Expandir todo"}
              </button>
            </div>

            {/* Fase sintética: Request del Cliente — siempre visible (incluso en 4xx/5xx sin fases) */}
            {(() => {
              const phases = flowData.phases ?? [];
              const firstPhase = phases.find((p: any) => p.event === "phase_start" && p.headers_before);
              const luaHeaders = firstPhase?.headers_before ?? {};

              // Prioridad de fuentes de headers del cliente:
              // 1. request_headers del access log (captura TODOS los headers reales del cliente)
              // 2. headers_before de la primera fase Lua (lista parcial)
              // 3. Pseudo-headers básicos del access log
              let displayHeaders: Record<string, string> = {};
              let sourceLabel = "";

              if (flowData.request_headers && Object.keys(flowData.request_headers).length > 0) {
                // Fuente principal: access log con todos los headers
                displayHeaders = flowData.request_headers as Record<string, string>;
                sourceLabel = "access log";
              } else if (Object.keys(luaHeaders).length > 0) {
                // Fallback: headers de la primera fase Lua
                displayHeaders = Object.fromEntries(
                  Object.entries(luaHeaders).filter(([k]) => !isEnvoyInternal(k))
                ) as Record<string, string>;
                sourceLabel = "lua phase";
              } else {
                // Último recurso: datos básicos del access log
                if (flowData.method) displayHeaders[":method"] = flowData.method;
                if (flowData.path) displayHeaders[":path"] = flowData.path;
                if (flowData.authority) displayHeaders[":authority"] = flowData.authority;
                if (flowData.user_agent) displayHeaders["user-agent"] = flowData.user_agent;
                if (flowData.downstream_ip) displayHeaders["x-forwarded-for"] = flowData.downstream_ip;
                if (flowData.trace_id) displayHeaders["x-request-id"] = flowData.trace_id;
                sourceLabel = "básico";
              }
              const hasDisplayHeaders = Object.keys(displayHeaders).length > 0;
              const isFromAccessLog = sourceLabel === "access log";

              return (
                <div className="px-6 pb-2">
                  <div className="glass rounded-xl border-l-4 border-cyan-500/70 bg-cyan-500/5 overflow-hidden">
                    <div
                      className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => setClientExpanded(x => !x)}
                    >
                      <Globe className="w-6 h-6 text-cyan-400 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">Request del Cliente</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">ENTRADA</span>
                          {hasDisplayHeaders && <span className="text-[10px] text-gray-500">{Object.keys(displayHeaders).length} headers</span>}
                          {flowData.status_code >= 400 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                              {flowData.status_code}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          <span className="text-cyan-300 font-mono font-bold">{flowData.method}</span>{" "}
                          <span className="text-gray-300">{flowData.path}</span>
                          {flowData.authority && <span className="ml-2 text-gray-500">→ {flowData.authority}</span>}
                        </div>
                      </div>
                      <motion.div animate={{ rotate: clientExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {clientExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-white/10 bg-black/20 px-4 py-3"
                        >
                          <div className="space-y-1">
                            {Object.entries(displayHeaders).map(([k, v]) => (
                              <HeaderRow key={k} headerKey={k} value={String(v)} showSensitive={showSensitive} globalDecode={globalDecode} />
                            ))}
                          </div>
                          {isFromAccessLog && (
                            <div className="mt-2 text-[10px] text-gray-600 italic">* Headers capturados por Lua filter (access log)</div>
                          )}
                          {!isFromAccessLog && hasDisplayHeaders && (
                            <div className="mt-2 text-[10px] text-gray-600 italic">* Solo datos básicos del access log disponibles</div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })()}

            {/* Fases de REQUEST (phase_start / phase_end) */}
            {flowData.phases && flowData.phases.length > 0 && (() => {
              const requestPhases = flowData.phases.filter((p: any) =>
                p.event === "phase_start" || p.event === "phase_end"
              );
              const filteredRequest = requestPhases.filter((p: any) => eventFilter === "all" || p.event === eventFilter);
              if (filteredRequest.length === 0) return null;
              const allSameTs = flowData.phases.every((p: any) => p.timestamp === flowData.phases[0].timestamp);
              return (
                <div className="p-6 space-y-4">
                  {filteredRequest.map((phase: any, filteredIdx: number) => {
                    const idx = flowData.phases.indexOf(phase);
                    const prevPhase = idx > 0 ? flowData.phases[idx - 1] : null;
                    const hasMorePhases = idx < flowData.phases.length - 1;
                    const isIncomplete = phase.event === "phase_start" && hasMorePhases &&
                      !flowData.phases.slice(idx + 1).some((p: any) => p.phase === phase.phase && p.event === "phase_end");
                    const t0 = new Date(flowData.phases[0].timestamp).getTime();
                    const relMs = new Date(phase.timestamp).getTime() - t0;
                    return (
                      <FlowStep
                        key={idx}
                        step={phase}
                        index={filteredIdx}
                        ordinal={idx + 1}
                        allSameTs={allSameTs}
                        isExpanded={expandedSteps.has(idx)}
                        onToggle={() => {
                          setExpandedSteps(prev => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            return next;
                          });
                        }}
                        showSensitive={showSensitive}
                        globalDecode={globalDecode}
                        globalSearch={globalSearch}
                        relativeMs={relMs}
                        prevPhase={prevPhase}
                        isIncomplete={isIncomplete}
                      />
                    );
                  })}
                </div>
              );
            })()}

            {/* Separador UPSTREAM — servidor backend respondió */}
            {flowData.phases && flowData.phases.length > 0 && (() => {
              const lastRequestEnd = [...flowData.phases].reverse().find((p: any) => p.event === "phase_end" && p.headers_after);
              const upstreamHeaders = lastRequestEnd?.headers_after;
              return (
                <div className="px-6 pb-2">
                  <div className="glass rounded-xl border-l-4 border-indigo-500/70 bg-indigo-500/5 overflow-hidden">
                    <div
                      className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => setUpstreamExpanded(x => !x)}
                    >
                      <Server className="w-6 h-6 text-indigo-400 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">Upstream Backend</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">UPSTREAM</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            flowData.status_code >= 200 && flowData.status_code < 300 ? "bg-green-500/20 text-green-300" :
                            flowData.status_code >= 400 ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"
                          }`}>{flowData.status_code}</span>
                          {upstreamHeaders && <span className="text-[10px] text-gray-500">{Object.keys(upstreamHeaders).length} headers recibidos</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                          {flowData.upstream_cluster && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">→</span>
                              <span className="text-indigo-300 font-mono text-[11px] font-bold">{flowData.upstream_cluster}</span>
                            </div>
                          )}
                          {flowData.upstream_host && (
                            <div className="text-[10px] text-gray-500 font-mono">{flowData.upstream_host}</div>
                          )}
                        </div>
                        {flowData.response_flags && flowData.response_flags !== "-" && (() => {
                          const { desc, isError: flagIsError } = getResponseFlagInfo(flowData.response_flags);
                          return (
                            <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${flagIsError ? "bg-orange-500/10 border border-orange-500/30" : "bg-gray-500/10"}`}>
                              <span className={`font-bold font-mono ${flagIsError ? "text-orange-400" : "text-gray-400"}`}>
                                ⚑ {flowData.response_flags}
                              </span>
                              <span className="ml-2 text-gray-300">{desc}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <motion.div animate={{ rotate: upstreamExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {upstreamExpanded && upstreamHeaders && Object.keys(upstreamHeaders).length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-white/10 bg-black/20 px-4 py-3"
                        >
                          <div className="space-y-1">
                            {Object.entries(upstreamHeaders).map(([k, v]) => (
                              <HeaderRow key={k} headerKey={k} value={String(v)} showSensitive={showSensitive} globalDecode={globalDecode} />
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })()}

            {/* Fases de RESPONSE (response_phase_start / response_phase_end) */}
            {flowData.phases && flowData.phases.length > 0 && (() => {
              const responsePhases = flowData.phases.filter((p: any) =>
                p.event === "response_phase_start" || p.event === "response_phase_end"
              );
              const filteredResponse = responsePhases.filter((p: any) => eventFilter === "all" || p.event === eventFilter);
              if (filteredResponse.length === 0) return null;
              const allSameTs = flowData.phases.every((p: any) => p.timestamp === flowData.phases[0].timestamp);
              return (
                <div className="p-6 space-y-4">
                  {filteredResponse.map((phase: any, filteredIdx: number) => {
                    const idx = flowData.phases.indexOf(phase);
                    const prevPhase = idx > 0 ? flowData.phases[idx - 1] : null;
                    const hasMorePhases = idx < flowData.phases.length - 1;
                    const isIncomplete = phase.event === "response_phase_start" && hasMorePhases &&
                      !flowData.phases.slice(idx + 1).some((p: any) => p.phase === phase.phase && p.event === "response_phase_end");
                    const t0 = new Date(flowData.phases[0].timestamp).getTime();
                    const relMs = new Date(phase.timestamp).getTime() - t0;
                    return (
                      <FlowStep
                        key={idx}
                        step={phase}
                        index={filteredIdx}
                        ordinal={idx + 1}
                        allSameTs={allSameTs}
                        isExpanded={expandedSteps.has(idx)}
                        onToggle={() => {
                          setExpandedSteps(prev => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            return next;
                          });
                        }}
                        showSensitive={showSensitive}
                        globalDecode={globalDecode}
                        globalSearch={globalSearch}
                        relativeMs={relMs}
                        prevPhase={prevPhase}
                        isIncomplete={isIncomplete}
                      />
                    );
                  })}
                </div>
              );
            })()}

            {/* Card final: Response al Cliente (salida) — expandible con dos secciones */}
            {flowData.phases && flowData.phases.length > 0 && (() => {
              // ── Headers de RESPUESTA HTTP ──────────────────────────────────────────
              // headers_after del último response_phase_end = headers HTTP de respuesta que recibe el cliente
              const lastResponseEnd = [...flowData.phases].reverse().find((p: any) => p.event === "response_phase_end");
              // headers_before del primer response_phase_start = lo que llegó del upstream (antes de que Lua lo modifique)
              const firstResponseStart = flowData.phases.find((p: any) => p.event === "response_phase_start" && p.headers_before);

              // ── Headers de REQUEST enviados al Upstream ────────────────────────────
              // headers_after del último phase_end = headers de request que se enviaron al upstream
              const lastRequestEnd = [...flowData.phases].reverse().find((p: any) => p.event === "phase_end" && p.headers_after);
              // headers_before del primer phase_start = headers originales del cliente
              const firstRequestStart = flowData.phases.find((p: any) => p.event === "phase_start" && p.headers_before);

              // Headers de respuesta finales (lo que el cliente recibe como HTTP response headers)
              const finalRespHeaders: Record<string, string> = lastResponseEnd?.headers_after ?? {};
              // Headers del upstream antes de que Lua los modifique
              const upstreamRespHeaders: Record<string, string> = firstResponseStart?.headers_before ?? {};

              // Headers de request finales (lo que se envió al upstream)
              const finalReqHeaders: Record<string, string> = lastRequestEnd?.headers_after ?? {};
              // Headers de request originales del cliente
              const origReqHeaders: Record<string, string> = firstRequestStart?.headers_before ?? {};

              // Diff de headers de RESPUESTA (upstream → cliente)
              const allRespKeys = new Set([...Object.keys(upstreamRespHeaders), ...Object.keys(finalRespHeaders)]);
              const respDiffRows: { key: string; value: string; status: "added" | "removed" | "changed" | "same" }[] = [];
              allRespKeys.forEach(k => {
                const before = upstreamRespHeaders[k];
                const after = finalRespHeaders[k];
                if (before === undefined) {
                  respDiffRows.push({ key: k, value: after, status: "added" });
                } else if (after === undefined) {
                  respDiffRows.push({ key: k, value: before, status: "removed" });
                } else if (before !== after) {
                  respDiffRows.push({ key: k, value: after, status: "changed" });
                } else {
                  respDiffRows.push({ key: k, value: after, status: "same" });
                }
              });
              respDiffRows.sort((a, b) => {
                const order = { added: 0, removed: 1, changed: 2, same: 3 };
                return order[a.status] - order[b.status] || a.key.localeCompare(b.key);
              });

              // Diff de headers de REQUEST (cliente original → upstream)
              const allReqKeys = new Set([...Object.keys(origReqHeaders), ...Object.keys(finalReqHeaders)]);
              const reqDiffRows: { key: string; value: string; status: "added" | "removed" | "changed" | "same" }[] = [];
              allReqKeys.forEach(k => {
                const before = origReqHeaders[k];
                const after = finalReqHeaders[k];
                if (before === undefined) {
                  reqDiffRows.push({ key: k, value: after, status: "added" });
                } else if (after === undefined) {
                  reqDiffRows.push({ key: k, value: before, status: "removed" });
                } else if (before !== after) {
                  reqDiffRows.push({ key: k, value: after, status: "changed" });
                } else {
                  reqDiffRows.push({ key: k, value: after, status: "same" });
                }
              });
              reqDiffRows.sort((a, b) => {
                const order = { added: 0, removed: 1, changed: 2, same: 3 };
                return order[a.status] - order[b.status] || a.key.localeCompare(b.key);
              });

              const respAdded = respDiffRows.filter(r => r.status === "added").length;
              const respRemoved = respDiffRows.filter(r => r.status === "removed").length;
              const respChanged = respDiffRows.filter(r => r.status === "changed").length;

              return (
                <div className="px-6 pb-6">
                  <div className="glass rounded-xl border-l-4 border-purple-500/70 bg-purple-500/5 overflow-hidden">
                    <div
                      className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors"
                      onClick={() => setResponseExpanded(x => !x)}
                    >
                      <Server className="w-6 h-6 text-purple-400 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">Response al Cliente</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">SALIDA</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            flowData.status_code >= 200 && flowData.status_code < 300 ? "bg-green-500/20 text-green-300" :
                            flowData.status_code >= 400 ? "bg-red-500/20 text-red-300" : "bg-yellow-500/20 text-yellow-300"
                          }`}>{flowData.status_code}</span>
                          {Object.keys(finalRespHeaders).length > 0 && (
                            <span className="text-[10px] text-gray-500">{Object.keys(finalRespHeaders).length} resp headers</span>
                          )}
                          {respAdded > 0 && <span className="text-[10px] font-bold text-green-400">+{respAdded}</span>}
                          {respRemoved > 0 && <span className="text-[10px] font-bold text-red-400">-{respRemoved}</span>}
                          {respChanged > 0 && <span className="text-[10px] font-bold text-yellow-400">~{respChanged}</span>}
                          {Object.keys(finalReqHeaders).length > 0 && (
                            <span className="text-[10px] text-gray-400 ml-2">· {Object.keys(finalReqHeaders).length} req headers al upstream</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          Headers HTTP de respuesta al cliente · Headers de request enviados al upstream
                        </div>
                      </div>
                      <motion.div animate={{ rotate: responseExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {responseExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-white/10 bg-black/20"
                        >
                          {/* Sección 1: Headers de RESPUESTA HTTP (lo que el cliente recibe) */}
                          {respDiffRows.length > 0 && (
                            <div className="px-4 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">↓ Headers de Respuesta HTTP</span>
                                <span className="text-[10px] text-gray-500">Lo que el cliente recibe del gateway</span>
                                {respAdded > 0 && <span className="text-[10px] font-bold text-green-400">+{respAdded} añadidos</span>}
                                {respRemoved > 0 && <span className="text-[10px] font-bold text-red-400">-{respRemoved} eliminados</span>}
                                {respChanged > 0 && <span className="text-[10px] font-bold text-yellow-400">~{respChanged} modificados</span>}
                              </div>
                              <div className="space-y-1">
                                {respDiffRows.map(r => (
                                  <HeaderRow
                                    key={r.key}
                                    headerKey={r.key}
                                    value={r.value}
                                    showSensitive={showSensitive}
                                    globalDecode={globalDecode}
                                    added={r.status === "added"}
                                    removed={r.status === "removed"}
                                    changed={r.status === "changed"}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Sección 2: Headers de REQUEST enviados al Upstream */}
                          {reqDiffRows.length > 0 && (
                            <div className="px-4 py-3 border-t border-white/5">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">→ Headers de Request al Upstream</span>
                                <span className="text-[10px] text-gray-500">Headers que el gateway envió al backend</span>
                                {reqDiffRows.filter(r => r.status === "added").length > 0 && <span className="text-[10px] font-bold text-green-400">+{reqDiffRows.filter(r => r.status === "added").length} añadidos</span>}
                                {reqDiffRows.filter(r => r.status === "removed").length > 0 && <span className="text-[10px] font-bold text-red-400">-{reqDiffRows.filter(r => r.status === "removed").length} eliminados</span>}
                                {reqDiffRows.filter(r => r.status === "changed").length > 0 && <span className="text-[10px] font-bold text-yellow-400">~{reqDiffRows.filter(r => r.status === "changed").length} modificados</span>}
                              </div>
                              <div className="space-y-1">
                                {reqDiffRows.map(r => (
                                  <HeaderRow
                                    key={r.key}
                                    headerKey={r.key}
                                    value={r.value}
                                    showSensitive={showSensitive}
                                    globalDecode={globalDecode}
                                    added={r.status === "added"}
                                    removed={r.status === "removed"}
                                    changed={r.status === "changed"}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Sección 3: Body de la Respuesta del Upstream */}
                          {(lastResponseEnd?.response_body || lastResponseEnd?.response_body_skipped) && (
                            <div className="px-4 py-3 border-t border-white/5">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">📄 Body de Respuesta</span>
                                {lastResponseEnd?.response_body && (
                                  <span className="text-[10px] text-gray-500">JSON del upstream ({lastResponseEnd.response_body.length} bytes)</span>
                                )}
                                {lastResponseEnd?.response_body_skipped && (
                                  <span className="text-[10px] text-yellow-500">⚠ no capturado</span>
                                )}
                              </div>
                              {lastResponseEnd?.response_body ? (
                                <div className="bg-black/30 rounded-lg p-3 overflow-auto max-h-96">
                                  <JsonHighlight json={(() => {
                                    try {
                                      return JSON.stringify(JSON.parse(lastResponseEnd.response_body), null, 2);
                                    } catch {
                                      return lastResponseEnd.response_body;
                                    }
                                  })()} />
                                </div>
                              ) : (
                                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-xs text-yellow-300">
                                  {lastResponseEnd?.response_body_skipped}
                                </div>
                              )}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}

        {/* Raw JSON View — con syntax highlighting y decode inline */}
        {selectedView === "raw" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong rounded-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/5">
              <div className="flex items-center gap-3">
                <Code className="w-6 h-6 text-cyan-400" />
                <h2 className="text-2xl font-bold gradient-text">Raw RequestTrace JSON</h2>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => navigator.clipboard.writeText(JSON.stringify(flowData, null, 2))}
                className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:glass-strong text-sm"
              >
                <Copy className="w-4 h-4 text-green-400" />
                <span className="text-gray-300">Copiar</span>
              </motion.button>
            </div>
            <div className="p-6">
              <pre className="text-xs bg-black/60 p-4 rounded-lg overflow-x-auto border border-cyan-400/20 font-mono leading-relaxed">
                <JsonHighlight json={JSON.stringify(flowData, null, 2)} />
              </pre>
            </div>
          </motion.div>
        )}

        {/* Access Log Info Card */}
        {flowData.access_log && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass-strong rounded-2xl p-6 border border-purple-500/20"
          >
            <div className="flex items-center gap-3 mb-4">
              <Server className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-bold gradient-text">Access Log</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { label: "Downstream IP", key: "downstream_remote_address" },
                { label: "Response Flags", key: "response_flags" },
                { label: "Upstream Host", key: "upstream_host" },
                { label: "Traceparent", key: "traceparent" },
                { label: "Start Time", key: "start_time" },
                { label: "End Time", key: "end_time" },
              ].map(({ label, key }) => flowData.access_log[key] ? (
                <div key={key} className="bg-black/30 rounded-xl p-3">
                  <div className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">{label}</div>
                  <code className="text-xs text-purple-300 font-mono break-all">{String(flowData.access_log[key])}</code>
                </div>
              ) : null)}
            </div>
          </motion.div>
        )}

      </main>
    </div>
  );
}

// ─── HeaderValue: renders a single header value with truncation, base64, JWT ──

function HeaderValue({ headerKey, value, showSensitive, globalDecode = true }: {
  headerKey: string; value: string; showSensitive: boolean; globalDecode?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // null = usar globalDecode, true = forzar mostrar, false = forzar ocultar
  const [localOverride, setLocalOverride] = useState<boolean | null>(null);

  const keyLower = headerKey.toLowerCase();
  const isSensitive = SENSITIVE_HEADERS.has(keyLower);
  const isBase64H = BASE64_HEADERS.has(keyLower);
  // JWT: authorization Bearer o cualquier header en JWT_HEADERS
  const isJWT = JWT_HEADERS.has(keyLower) && (
    keyLower === "authorization" ? value.toLowerCase().startsWith("bearer ") : true
  );
  const canDecode = (isJWT || isBase64H) && (!isSensitive || showSensitive);
  // Si hay override local, usarlo; si no, usar globalDecode
  const effectiveShowDecoded = localOverride !== null ? localOverride : (globalDecode && canDecode);

  // Cuando globalDecode cambia, resetear el override local
  // (no necesitamos useEffect, el render lo maneja)

  // Mask sensitive
  const displayRaw = isSensitive && !showSensitive ? "••••••••••••" : value;

  // Decoded value — siempre intentar decodificar si showSensitive o no es sensitive
  let decoded: string | null = null;
  if (canDecode) {
    if (isJWT) {
      const r = tryDecodeJWT(value);
      decoded = r ? r.decoded : null;
    } else if (isBase64H) {
      const r = tryDecodeBase64(value);
      decoded = r ? r.decoded : null;
    }
  }

  const needsTruncate = displayRaw.length > TRUNCATE_LEN && !isSensitive;
  const shown = needsTruncate && !expanded ? displayRaw.slice(0, TRUNCATE_LEN) + "…" : displayRaw;

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Si está decodificado: mostrar SOLO el decoded, no el raw */}
      {canDecode && decoded && effectiveShowDecoded ? (
        <div className="flex flex-col gap-1">
          <pre className="text-[10px] bg-black/50 border border-yellow-400/20 rounded p-2 text-yellow-200 overflow-x-auto max-h-48 whitespace-pre-wrap">
            {decoded}
          </pre>
          <button
            onClick={e => {
              e.stopPropagation();
              setLocalOverride(false);
            }}
            className="text-[10px] text-yellow-400 hover:text-yellow-300 underline whitespace-nowrap self-start"
          >
            ocultar decode
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-1 flex-wrap">
          <span className="text-gray-300 break-all font-mono text-xs">{shown}</span>
          {needsTruncate && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 underline whitespace-nowrap"
            >
              {expanded ? "colapsar" : "ver más"}
            </button>
          )}
          {canDecode && decoded && (
            <button
              onClick={e => {
                e.stopPropagation();
                setLocalOverride(true);
              }}
              className="text-[10px] text-yellow-400 hover:text-yellow-300 underline whitespace-nowrap"
            >
              🔓 decodificar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── HeaderRow: one header entry ─────────────────────────────────────────────

function HeaderRow({ headerKey, value, showSensitive, globalDecode, changed, removed, added }: {
  headerKey: string; value: string; showSensitive: boolean; globalDecode?: boolean;
  changed?: boolean; removed?: boolean; added?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isSensitive = SENSITIVE_HEADERS.has(headerKey.toLowerCase());
  const bg = removed ? "bg-red-500/10 border border-red-500/20"
    : added ? "bg-green-500/10 border border-green-500/20"
    : changed ? "bg-yellow-500/10 border border-yellow-500/20"
    : "bg-black/40";
  const keyColor = removed ? "text-red-400" : added ? "text-green-400" : changed ? "text-yellow-400" : "text-cyan-400";

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={`group flex items-start gap-2 text-xs rounded px-3 py-2 ${bg}`}>
      <span className={`${keyColor} font-mono font-semibold min-w-[140px] shrink-0`}>
        {removed ? "−" : added ? "+" : changed ? "~" : " "} {headerKey}:
        {isSensitive && <span className="ml-1 text-[9px] text-yellow-500 uppercase">sensitive</span>}
      </span>
      <div className="flex-1 min-w-0">
        <HeaderValue headerKey={headerKey} value={value} showSensitive={showSensitive} globalDecode={globalDecode} />
      </div>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-white/10"
        title="Copiar valor"
      >
        {copied
          ? <CheckCircle className="w-3 h-3 text-green-400" />
          : <Copy className="w-3 h-3 text-gray-400 hover:text-white" />
        }
      </button>
    </div>
  );
}

// ─── FlowStep ────────────────────────────────────────────────────────────────

function FlowStep({
  step, index, ordinal, allSameTs, isExpanded, onToggle,
  showSensitive, globalDecode, globalSearch, relativeMs, prevPhase, isIncomplete,
}: {
  step: any; index: number; ordinal: number; allSameTs: boolean;
  isExpanded: boolean; onToggle: () => void;
  showSensitive: boolean; globalDecode: boolean; globalSearch: string; relativeMs: number;
  prevPhase: any | null; isIncomplete: boolean;
}) {
  const isError = step.event === "error";
  const isEnd = step.event === "phase_end";
  const isResponseStart = step.event === "response_phase_start";
  const isResponseEnd = step.event === "response_phase_end";
  const isResponse = isResponseStart || isResponseEnd;
  const search = globalSearch.toLowerCase().trim();

  function filterHeaders(headers: Record<string, string> | null): [string, string][] {
    if (!headers) return [];
    const entries = Object.entries(headers);
    if (!search) return entries;
    return entries.filter(([k, v]) => k.toLowerCase().includes(search) || v.toLowerCase().includes(search));
  }

  function computeDiff(before: Record<string, string> | null, after: Record<string, string> | null) {
    const allKeys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    const rows: { key: string; value: string; status: "same" | "changed" | "added" | "removed" }[] = [];
    allKeys.forEach(k => {
      const bv = before?.[k];
      const av = after?.[k];
      // Ignorar si ambos son vacíos
      const bvEmpty = bv === undefined || isEmptyHeaderValue(bv);
      const avEmpty = av === undefined || isEmptyHeaderValue(av);
      if (bvEmpty && avEmpty) return; // ambos vacíos, ignorar
      if (bvEmpty && !avEmpty) rows.push({ key: k, value: av!, status: "added" });
      else if (!bvEmpty && avEmpty) rows.push({ key: k, value: bv!, status: "removed" });
      else if (bv !== av) rows.push({ key: k, value: av!, status: "changed" });
      else rows.push({ key: k, value: av!, status: "same" });
    });
    return rows;
  }

  const beforeEntries = filterHeaders(step.headers_before);
  const afterEntries = filterHeaders(step.headers_after);

  // Solo mostrar diff de transición si la fase anterior tiene headers_after (no usar headers_before como base)
  // Esto evita mostrar todos los headers del cliente como "removidos" en la primera fase
  const phaseDiff = prevPhase && prevPhase.headers_after
    ? computeDiff(prevPhase.headers_after, step.headers_before)
    : null;

  const internalDiff = step.headers_before && step.headers_after
    ? computeDiff(step.headers_before, step.headers_after)
    : null;

  const filteredPhaseDiff = phaseDiff?.filter(r => !search || r.key.toLowerCase().includes(search) || r.value.toLowerCase().includes(search));
  const filteredInternalDiff = internalDiff?.filter(r => !search || r.key.toLowerCase().includes(search) || r.value.toLowerCase().includes(search));

  // Badge diff counts for collapsed header
  const diffCounts = internalDiff ? {
    added: internalDiff.filter(r => r.status === "added").length,
    changed: internalDiff.filter(r => r.status === "changed").length,
    removed: internalDiff.filter(r => r.status === "removed").length,
  } : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={`glass rounded-xl border-l-4 ${
        isIncomplete ? "border-yellow-500/70 bg-yellow-500/5" :
        isError ? "border-red-500/50 bg-red-500/10" :
        isResponseEnd ? "border-orange-500/50 bg-orange-500/5" :
        isResponseStart ? "border-amber-500/50 bg-amber-500/5" :
        isEnd ? "border-green-500/50 bg-green-500/5" :
        "border-blue-500/50 bg-blue-500/5"
      } overflow-hidden`}
    >
      <motion.div
        whileHover={{ x: 5 }}
        className="p-5 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div whileHover={{ scale: 1.2 }} transition={{ duration: 0.2 }}>
              {isIncomplete ? <AlertTriangle className="w-6 h-6 text-yellow-400" /> :
               isError ? <XCircle className="w-6 h-6 text-red-400" /> :
               isResponseEnd ? <CheckCircle className="w-6 h-6 text-orange-400" /> :
               isResponseStart ? <Play className="w-6 h-6 text-amber-400" /> :
               isEnd ? <CheckCircle className="w-6 h-6 text-green-400" /> :
               <Play className="w-6 h-6 text-blue-400" />}
            </motion.div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-lg text-white">{friendlyPhaseName(step.phase)}</span>
                {isResponse && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    RESPONSE
                  </span>
                )}
                {isIncomplete && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                    ⚠ SIN PHASE_END
                  </span>
                )}
                {/* Diff badge en header colapsado */}
                {!isExpanded && diffCounts && (diffCounts.added > 0 || diffCounts.changed > 0 || diffCounts.removed > 0) && (
                  <span className="flex items-center gap-1 text-[10px] font-mono">
                    {diffCounts.added > 0 && <span className="text-green-400">+{diffCounts.added}</span>}
                    {diffCounts.changed > 0 && <span className="text-yellow-400">~{diffCounts.changed}</span>}
                    {diffCounts.removed > 0 && <span className="text-red-400">-{diffCounts.removed}</span>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(step.timestamp).toLocaleTimeString()}</span>
                  <span className="text-purple-400 font-mono">
                    {allSameTs ? `#${ordinal}` : `+${relativeMs}ms`}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  isError ? "bg-red-500/20 text-red-300" :
                  isResponseEnd ? "bg-orange-500/20 text-orange-300" :
                  isResponseStart ? "bg-amber-500/20 text-amber-300" :
                  isEnd ? "bg-green-500/20 text-green-300" :
                  "bg-blue-500/20 text-blue-300"
                }`}>
                  {step.event.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
            {isExpanded ? <ChevronDown className="w-5 h-5 text-purple-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
          </motion.div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-white/10 bg-black/20"
          >
            <div className="p-5 space-y-6">

              {/* JWT Claims de esta fase */}
              {step.jwt_claims && Object.keys(step.jwt_claims).length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-yellow-300 mb-3 flex items-center gap-2">
                    <Code className="w-4 h-4" /> JWT Claims de esta fase
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(step.jwt_claims).map(([k, v]) => (
                      <div key={k} className="bg-yellow-500/5 border border-yellow-500/20 rounded px-3 py-2">
                        <div className="text-[10px] text-gray-400 mb-0.5">{k}</div>
                        <code className="text-xs text-yellow-300 font-mono break-all">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Diff entre fase anterior y esta (transición) */}
              {filteredPhaseDiff && filteredPhaseDiff.some(r => r.status !== "same") && (
                <div>
                  <h4 className="text-sm font-bold text-orange-300 mb-3 flex items-center gap-2">
                    <Filter className="w-4 h-4" /> Cambios desde fase anterior
                  </h4>
                  <div className="space-y-1">
                    {filteredPhaseDiff.filter(r => r.status !== "same").map(r => (
                      <HeaderRow
                        key={r.key}
                        headerKey={r.key}
                        value={r.value}
                        showSensitive={showSensitive}
                        globalDecode={globalDecode}
                        added={r.status === "added"}
                        removed={r.status === "removed"}
                        changed={r.status === "changed"}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Diff interno: headers_before → headers_after */}
              {filteredInternalDiff && filteredInternalDiff.some(r => r.status !== "same") && (
                <div>
                  <h4 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isResponse ? "text-orange-300" : "text-cyan-300"}`}>
                    <Diff className="w-4 h-4" /> {isResponse ? "Transformaciones de Response" : "Transformaciones en esta fase"}
                  </h4>
                  <div className="space-y-1">
                    {filteredInternalDiff.filter(r => r.status !== "same").map(r => (
                      <HeaderRow
                        key={r.key}
                        headerKey={r.key}
                        value={r.value}
                        showSensitive={showSensitive}
                        globalDecode={globalDecode}
                        added={r.status === "added"}
                        removed={r.status === "removed"}
                        changed={r.status === "changed"}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Headers Before: solo mostrar en phase_start / response_phase_start (no en *_end donde ya se ve el diff) */}
              {beforeEntries.length > 0 && !isEnd && !isResponseEnd && (
                <div>
                  <h4 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isResponse ? "text-amber-300" : "text-purple-300"}`}>
                    <Layers className="w-4 h-4" /> {isResponse ? "Response Headers (antes)" : "Request Headers"} ({beforeEntries.length})
                  </h4>
                  <div className="space-y-1">
                    {beforeEntries.map(([k, v]) => (
                      <HeaderRow key={k} headerKey={k} value={String(v)} showSensitive={showSensitive} globalDecode={globalDecode} />
                    ))}
                  </div>
                </div>
              )}

              {/* Headers After */}
              {afterEntries.length > 0 && (
                <div>
                  <h4 className={`text-sm font-bold mb-3 flex items-center gap-2 ${
                    isResponseEnd ? "text-orange-300" :
                    isResponseStart ? "text-amber-300" :
                    "text-green-300"
                  }`}>
                    <Layers className="w-4 h-4" /> {
                      isResponseEnd ? "Response Headers Finales" :
                      isResponseStart ? "Response Headers (después)" :
                      isEnd ? "Headers Finales" : "Response Headers"
                    } ({afterEntries.length})
                    {/* Resumen de cambios */}
                    {step.headers_before && (() => {
                      const added = afterEntries.filter(([k]) => !(k in step.headers_before)).length;
                      const changed = afterEntries.filter(([k, v]) => k in step.headers_before && step.headers_before[k] !== v).length;
                      const removed = Object.keys(step.headers_before).filter(k => !afterEntries.find(([ak]) => ak === k)).length;
                      return (
                        <span className="flex items-center gap-1 ml-1">
                          {added > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-400">+{added}</span>}
                          {changed > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/20 text-yellow-400">~{changed}</span>}
                          {removed > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">-{removed}</span>}
                        </span>
                      );
                    })()}
                  </h4>
                  <div className="space-y-1">
                    {afterEntries.map(([k, v]) => {
                      const isChanged = step.headers_before && step.headers_before[k] !== v;
                      const isAdded = step.headers_before && !(k in step.headers_before);
                      return (
                        <HeaderRow
                          key={k}
                          headerKey={k}
                          value={String(v)}
                          showSensitive={showSensitive}
                          globalDecode={globalDecode}
                          changed={isChanged && !isAdded}
                          added={isAdded}
                        />
                      );
                    })}
                    {/* Headers eliminados (estaban en before pero no en after) */}
                    {step.headers_before && Object.entries(step.headers_before)
                      .filter(([k]) => !afterEntries.find(([ak]) => ak === k))
                      .map(([k, v]) => (
                        <HeaderRow
                          key={`removed-${k}`}
                          headerKey={k}
                          value={String(v)}
                          showSensitive={showSensitive}
                          globalDecode={globalDecode}
                          removed={true}
                        />
                      ))
                    }
                  </div>
                </div>
              )}

              {/* No headers match search */}
              {search && beforeEntries.length === 0 && afterEntries.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-4">
                  No hay headers que coincidan con "{globalSearch}"
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
