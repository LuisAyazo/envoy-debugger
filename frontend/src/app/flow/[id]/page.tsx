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
          parts.push(<span key={key++} className="text-foreground/60">{sp}</span>);
          parts.push(<span key={key++} className="text-blue-600 dark:text-blue-400">{k}</span>);
          parts.push(<span key={key++} className="text-muted-foreground">{colon}</span>);
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
    if (m.index > last) parts.push(<span key={k++} className="text-foreground/70">{text.slice(last, m.index)}</span>);
    if (m[1]) parts.push(<span key={k++} className="text-emerald-600 dark:text-emerald-400">{m[1]}</span>);
    else if (m[2]) parts.push(<span key={k++} className="text-amber-600 dark:text-amber-400">{m[2]}</span>);
    else if (m[3]) parts.push(<span key={k++} className="text-orange-600 dark:text-orange-400">{m[3]}</span>);
    else if (m[4]) parts.push(<span key={k++} className="text-red-600 dark:text-red-400">{m[4]}</span>);
    else parts.push(<span key={k++} className="text-muted-foreground">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(<span key={k++} className="text-foreground/70">{text.slice(last)}</span>);
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
  const [showSensitive, setShowSensitive] = useState(false);
  const [globalDecode, setGlobalDecode] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<"all" | "phase_start" | "phase_end" | "response_phase_start" | "response_phase_end" | "error">("all");
  const [clientExpanded, setClientExpanded] = useState(false);
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
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Cargando flujo del request...</span>
        </div>
      </div>
    );
  }

  if (error || !flowData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Error al cargar el request</h1>
        <p className="text-muted-foreground mb-6">{error || "No se encontraron datos"}</p>
        <Link href="/requests">
          <button className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Volver a Requests
          </button>
        </Link>
      </div>
    );
  }

  // Helper components
  function ViewTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground hover:text-foreground'
        }`}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Link href="/requests">
                <button className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors">
                  <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                </button>
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Request Flow</h1>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono font-medium text-foreground">{flowData.method}</span>{" "}
                  <code className="text-primary">{flowData.path}</code>
                  {" · "}ID: <code className="text-primary font-mono">{flowData.request_id}</code>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                flowData.status_code >= 200 && flowData.status_code < 300
                  ? "badge-success"
                  : flowData.status_code >= 400
                  ? "badge-error"
                  : "badge-warning"
              }`}>
                {flowData.status_code}
              </span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-4">
        
        {/* Request Metadata Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-5"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                Trace ID
              </div>
              <code className="text-sm text-primary font-mono">{flowData.trace_id || "—"}</code>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Total Duration
              </div>
              <div className="text-sm font-bold text-foreground">{flowData.duration_ms}ms</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
                <Network className="w-3 h-3" />
                Upstream
              </div>
              <div className="text-sm text-foreground truncate" title={flowData.upstream_cluster}>{flowData.upstream_cluster || "—"}</div>
            </div>
            <div className="flex items-center">
              <button
                className="btn-secondary flex items-center gap-2 text-xs"
                onClick={() => navigator.clipboard.writeText(JSON.stringify(flowData, null, 2))}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
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

          function ClaimCard({ claimKey, value }: { claimKey: string; value: any }) {
            const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
            return (
              <div className="flex flex-col gap-0.5 px-3 py-2 rounded-md bg-muted/20 hover:bg-muted/50 transition-colors border border-transparent hover:border-border/40">
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider truncate" title={claimKey}>{claimKey}</span>
                <span className="text-xs text-foreground break-all">{displayVal}</span>
              </div>
            );
          }

          if (!hasStageInfo) {
            return (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-card border border-amber-200 dark:border-amber-800 rounded-xl p-5"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Code className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="font-semibold text-foreground">JWT Claims Extraídos</h3>
                  <span className="text-xs text-muted-foreground">{Object.keys(flowData.jwt_claims).length} claims</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {Object.entries(flowData.jwt_claims).map(([k, v]) => (
                    <ClaimCard key={k} claimKey={k} value={v} />
                  ))}
                </div>
              </motion.div>
            );
          }

          return (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-card border border-amber-200 dark:border-amber-800 rounded-xl p-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <Code className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="font-semibold text-foreground">JWT Claims Extraídos</h3>
                <span className="text-xs text-muted-foreground">
                  {Object.keys(beforeAuthClaims).length + Object.keys(afterAuthClaims).length} claims
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {Object.keys(beforeAuthClaims).length > 0 && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b border-border">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                      <span className="text-xs font-semibold text-foreground">BeforeAuth</span>
                      <span className="text-xs text-muted-foreground font-mono">· {beforeProvider}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{Object.keys(beforeAuthClaims).length} claims</span>
                    </div>
                    <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {Object.entries(beforeAuthClaims).map(([k, v]) => (
                        <ClaimCard key={k} claimKey={k} value={v} />
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(afterAuthClaims).length > 0 && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-card border-b border-border">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                      <span className="text-xs font-semibold text-foreground">AfterAuth</span>
                      <span className="text-xs text-muted-foreground font-mono">· {afterProvider}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{Object.keys(afterAuthClaims).length} claims</span>
                    </div>
                    <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {Object.entries(afterAuthClaims).map(([k, v]) => (
                        <ClaimCard key={k} claimKey={k} value={v} />
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
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="w-full">
                <div className="text-red-700 dark:text-red-400 font-semibold mb-3">
                  Errores Detectados ({flowData.errors.length})
                </div>
                <div className="space-y-2">
                  {flowData.errors.map((err: any, idx: number) => (
                    <div key={idx} className="bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase">{err.phase}</span>
                        <span className="text-xs text-muted-foreground">{new Date(err.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-sm text-red-700 dark:text-red-300">{err.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Toolbar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="flex flex-wrap items-center gap-2"
        >
          <ViewTab icon={<Layers className="w-4 h-4" />} label="Fases Lua" active={selectedView === "phases"} onClick={() => setSelectedView("phases")} />
          <ViewTab icon={<BarChart3 className="w-4 h-4" />} label="Raw JSON" active={selectedView === "raw"} onClick={() => setSelectedView("raw")} />

          <div className="flex-1" />

          {/* Sensitive toggle */}
          <button
            onClick={() => setShowSensitive(s => !s)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showSensitive
                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
            title={showSensitive ? "Ocultar valores sensibles" : "Mostrar valores sensibles"}
          >
            {showSensitive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{showSensitive ? "Sensibles visibles" : "Sensibles ocultos"}</span>
          </button>

          {/* Global decode toggle */}
          <button
            onClick={() => setGlobalDecode(d => !d)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              globalDecode
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
            title={globalDecode ? "Ocultar decodificación" : "Decodificar base64/JWT"}
          >
            <Code className="w-3.5 h-3.5" />
            <span>{globalDecode ? "Decodificado activo" : "Decodificar todo"}</span>
          </button>

          {/* Global search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar header..."
              value={globalSearch}
              onChange={e => setGlobalSearch(e.target.value)}
              className="input-base pl-9 w-44 py-1.5 text-sm"
            />
          </div>
        </motion.div>

        {/* Fases Lua View */}
        {selectedView === "phases" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
              <GitBranch className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Pipeline de Fases Lua</h2>
              <span className="ml-auto text-xs text-muted-foreground">{flowData.phases?.length ?? 0} eventos</span>
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
                          <div className="text-[9px] text-muted-foreground mt-1 whitespace-nowrap">
                            {allSameTs ? `#${idx + 1}` : `+${relMs}ms`}
                          </div>
                          <div className="text-[9px] text-muted-foreground/70 whitespace-nowrap max-w-[70px] truncate">{phase.phase}</div>
                        </div>
                        {idx < flowData.phases.length - 1 && (
                          <div className="w-8 h-px bg-border mx-1" />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Event filter chips */}
            <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3 h-3 text-muted-foreground" />
              {([
                { key: "all", label: "Todos" },
                { key: "phase_start", label: "Request Start" },
                { key: "phase_end", label: "Request End" },
                { key: "response_phase_start", label: "Response Start" },
                { key: "response_phase_end", label: "Response End" },
                { key: "error", label: "Errores" },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setEventFilter(f.key as any)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                    eventFilter === f.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => {
                  const phases = flowData.phases ?? [];
                  const allPhasesExpanded = expandedSteps.size === phases.length;
                  const allExpanded = allPhasesExpanded && clientExpanded && upstreamExpanded && responseExpanded;
                  if (allExpanded) {
                    setExpandedSteps(new Set());
                    setClientExpanded(false);
                    setUpstreamExpanded(false);
                    setResponseExpanded(false);
                  } else {
                    setExpandedSteps(new Set(phases.map((_: any, i: number) => i)));
                    setClientExpanded(true);
                    setUpstreamExpanded(true);
                    setResponseExpanded(true);
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronsUpDown className="w-3 h-3" />
                {expandedSteps.size === (flowData.phases?.length ?? 0) && clientExpanded && upstreamExpanded && responseExpanded ? "Colapsar todo" : "Expandir todo"}
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
                <div className="px-5 pb-3">
                  <div className="bg-background border border-border border-l-4 border-l-blue-400 dark:border-l-blue-500 rounded-xl overflow-hidden">
                    <div
                      className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setClientExpanded(x => !x)}
                    >
                      <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">Request del Cliente</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold badge-info">ENTRADA</span>
                          {hasDisplayHeaders && <span className="text-[10px] text-muted-foreground">{Object.keys(displayHeaders).length} headers</span>}
                          {flowData.status_code >= 400 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold badge-error">
                              {flowData.status_code}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          <span className="font-mono font-semibold text-foreground">{flowData.method}</span>{" "}
                          <span className="text-foreground/70">{flowData.path}</span>
                          {flowData.authority && <span className="ml-2 text-muted-foreground">→ {flowData.authority}</span>}
                        </div>
                      </div>
                      <motion.div animate={{ rotate: clientExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                  {clientExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-border bg-muted/20 px-4 py-3"
                    >
                      <div className="space-y-1">
                        {Object.entries(displayHeaders).map(([k, v]) => (
                          <HeaderRow key={k} headerKey={k} value={String(v)} showSensitive={showSensitive} globalDecode={globalDecode} />
                        ))}
                      </div>
                      {/* Body del request del cliente */}
                      {(() => {
                        // Buscar request_body en el primer phase_start
                        const firstPhaseStart = (flowData.phases ?? []).find((p: any) => p.event === "phase_start" && p.request_body);
                        const reqBody = firstPhaseStart?.request_body;
                        if (!reqBody) return null;
                        return (
                          <div className="mt-3 border-t border-border pt-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">Body del Request</span>
                              <span className="text-[10px] text-muted-foreground">{reqBody.length} bytes · JSON</span>
                            </div>
                            <div className="bg-muted rounded-lg p-3 overflow-auto max-h-64">
                              <JsonHighlight json={(() => {
                                try { return JSON.stringify(JSON.parse(reqBody), null, 2); } catch { return reqBody; }
                              })()} />
                            </div>
                          </div>
                        );
                      })()}
                      {isFromAccessLog && (
                        <div className="mt-2 text-[10px] text-muted-foreground italic">* Headers capturados por Lua filter (access log)</div>
                      )}
                      {!isFromAccessLog && hasDisplayHeaders && (
                        <div className="mt-2 text-[10px] text-muted-foreground italic">* Solo datos básicos del access log disponibles</div>
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
              // Body de respuesta del upstream: viene del primer response_phase_start o response_phase_end con body
              const firstRespStart = flowData.phases.find((p: any) => p.event === "response_phase_start" && p.response_body);
              const firstRespEnd = flowData.phases.find((p: any) => p.event === "response_phase_end" && p.response_body);
              const upstreamResponseBody = firstRespStart?.response_body ?? firstRespEnd?.response_body;
              const hasContent = (upstreamHeaders && Object.keys(upstreamHeaders).length > 0) || upstreamResponseBody;
              return (
                <div className="px-5 pb-3">
                  <div className="bg-background border border-border border-l-4 border-l-slate-400 dark:border-l-slate-500 rounded-xl overflow-hidden">
                    <div
                      className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setUpstreamExpanded(x => !x)}
                    >
                      <Server className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">Upstream Backend</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold badge-neutral">UPSTREAM</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            flowData.status_code >= 200 && flowData.status_code < 300 ? "badge-success" :
                            flowData.status_code >= 400 ? "badge-error" : "badge-warning"
                          }`}>{flowData.status_code}</span>
                          {upstreamHeaders && <span className="text-[10px] text-muted-foreground">{Object.keys(upstreamHeaders).length} headers recibidos</span>}
                          {upstreamResponseBody && <span className="text-[10px] text-muted-foreground">· body {upstreamResponseBody.length}b</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                          {flowData.upstream_cluster && (
                            <div className="flex items-center gap-1">
                              <span>→</span>
                              <span className="font-mono text-[11px] font-semibold text-foreground">{flowData.upstream_cluster}</span>
                            </div>
                          )}
                          {flowData.upstream_host && (
                            <div className="text-[10px] font-mono">{flowData.upstream_host}</div>
                          )}
                        </div>
                        {flowData.response_flags && flowData.response_flags !== "-" && (() => {
                          const { desc, isError: flagIsError } = getResponseFlagInfo(flowData.response_flags);
                          return (
                            <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${flagIsError ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800" : "bg-muted"}`}>
                              <span className={`font-semibold font-mono ${flagIsError ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                                ⚑ {flowData.response_flags}
                              </span>
                              <span className="ml-2 text-foreground/70">{desc}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <motion.div animate={{ rotate: upstreamExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {upstreamExpanded && hasContent && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-border bg-muted/20"
                        >
                          {upstreamHeaders && Object.keys(upstreamHeaders).length > 0 && (
                            <div className="px-4 py-3">
                              <div className="space-y-1">
                                {Object.entries(upstreamHeaders).map(([k, v]) => (
                                  <HeaderRow key={k} headerKey={k} value={String(v)} showSensitive={showSensitive} globalDecode={globalDecode} />
                                ))}
                              </div>
                            </div>
                          )}
                          {upstreamResponseBody && (
                            <div className={`px-4 py-3 ${upstreamHeaders && Object.keys(upstreamHeaders).length > 0 ? "border-t border-border/50" : ""}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Body de Respuesta del Upstream</span>
                                <span className="text-[10px] text-muted-foreground">JSON original ({upstreamResponseBody.length} bytes)</span>
                              </div>
                              <div className="bg-muted rounded-lg p-3 overflow-auto max-h-64">
                                <JsonHighlight json={(() => {
                                  try { return JSON.stringify(JSON.parse(upstreamResponseBody), null, 2); } catch { return upstreamResponseBody; }
                                })()} />
                              </div>
                            </div>
                          )}
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
                <div className="px-5 pb-5">
                  <div className="bg-background border border-border border-l-4 border-l-emerald-400 dark:border-l-emerald-500 rounded-xl overflow-hidden">
                    <div
                      className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setResponseExpanded(x => !x)}
                    >
                      <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">Response al Cliente</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold badge-success">SALIDA</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            flowData.status_code >= 200 && flowData.status_code < 300 ? "badge-success" :
                            flowData.status_code >= 400 ? "badge-error" : "badge-warning"
                          }`}>{flowData.status_code}</span>
                          {Object.keys(finalRespHeaders).length > 0 && (
                            <span className="text-[10px] text-muted-foreground">{Object.keys(finalRespHeaders).length} resp headers</span>
                          )}
                          {respAdded > 0 && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">+{respAdded}</span>}
                          {respRemoved > 0 && <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">-{respRemoved}</span>}
                          {respChanged > 0 && <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">~{respChanged}</span>}
                          {Object.keys(finalReqHeaders).length > 0 && (
                            <span className="text-[10px] text-muted-foreground ml-1">· {Object.keys(finalReqHeaders).length} req headers al upstream</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Headers HTTP de respuesta al cliente · Headers de request enviados al upstream
                        </div>
                      </div>
                      <motion.div animate={{ rotate: responseExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {responseExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-border bg-muted/20"
                        >
                          {respDiffRows.length > 0 && (
                            <div className="px-4 py-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">↓ Headers de Respuesta HTTP</span>
                                <span className="text-[10px] text-muted-foreground">Lo que el cliente recibe del gateway</span>
                                {respAdded > 0 && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">+{respAdded} añadidos</span>}
                                {respRemoved > 0 && <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">-{respRemoved} eliminados</span>}
                                {respChanged > 0 && <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">~{respChanged} modificados</span>}
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
                          {reqDiffRows.length > 0 && (
                            <div className="px-4 py-3 border-t border-border/50">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">→ Headers de Request al Upstream</span>
                                <span className="text-[10px] text-muted-foreground">Headers que el gateway envió al backend</span>
                                {reqDiffRows.filter(r => r.status === "added").length > 0 && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">+{reqDiffRows.filter(r => r.status === "added").length} añadidos</span>}
                                {reqDiffRows.filter(r => r.status === "removed").length > 0 && <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">-{reqDiffRows.filter(r => r.status === "removed").length} eliminados</span>}
                                {reqDiffRows.filter(r => r.status === "changed").length > 0 && <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">~{reqDiffRows.filter(r => r.status === "changed").length} modificados</span>}
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
                          {(lastResponseEnd?.response_body || lastResponseEnd?.response_body_skipped) && (
                            <div className="px-4 py-3 border-t border-border/50">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Body de Respuesta</span>
                                {lastResponseEnd?.response_body && (
                                  <span className="text-[10px] text-muted-foreground">JSON del upstream ({lastResponseEnd.response_body.length} bytes)</span>
                                )}
                                {lastResponseEnd?.response_body_skipped && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400">⚠ no capturado</span>
                                )}
                              </div>
                              {lastResponseEnd?.response_body ? (
                                <div className="bg-muted rounded-lg p-3 overflow-auto max-h-96">
                                  <JsonHighlight json={(() => {
                                    try {
                                      return JSON.stringify(JSON.parse(lastResponseEnd.response_body), null, 2);
                                    } catch {
                                      return lastResponseEnd.response_body;
                                    }
                                  })()} />
                                </div>
                              ) : (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
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

        {/* Raw JSON View */}
        {selectedView === "raw" && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground">Raw RequestTrace JSON</h2>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(flowData, null, 2))}
                className="btn-secondary flex items-center gap-2 text-xs py-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar</span>
              </button>
            </div>
            <div className="p-5">
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto border border-border font-mono leading-relaxed">
                <JsonHighlight json={JSON.stringify(flowData, null, 2)} />
              </pre>
            </div>
          </motion.div>
        )}

        {/* Access Log Info Card */}
        {flowData.access_log && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-card border border-border rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Access Log</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {[
                { label: "Downstream IP", key: "downstream_remote_address" },
                { label: "Response Flags", key: "response_flags" },
                { label: "Upstream Host", key: "upstream_host" },
                { label: "Traceparent", key: "traceparent" },
                { label: "Start Time", key: "start_time" },
                { label: "End Time", key: "end_time" },
              ].map(({ label, key }) => flowData.access_log[key] ? (
                <div key={key} className="bg-muted rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">{label}</div>
                  <code className="text-xs text-primary font-mono break-all">{String(flowData.access_log[key])}</code>
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
  // localOverride: null = seguir globalDecode, true = forzar decode, false = forzar raw
  const [localOverride, setLocalOverride] = useState<boolean | null>(null);

  // Resetear override local cuando cambia el toggle global
  useEffect(() => {
    setLocalOverride(null);
  }, [globalDecode]);

  const keyLower = headerKey.toLowerCase();
  const isSensitive = SENSITIVE_HEADERS.has(keyLower);
  const isBase64H = BASE64_HEADERS.has(keyLower);
  const isJWT = JWT_HEADERS.has(keyLower) && (
    keyLower === "authorization" ? value.toLowerCase().startsWith("bearer ") : true
  );

  // canDecode: si el header es decodificable (JWT o Base64), independiente de si es sensible
  const canDecode = isJWT || isBase64H;

  // Intentar decodificar siempre (para tener el valor disponible)
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

  // Si es sensible y showSensitive=false: mostrar bullets en raw, pero SÍ mostrar decode si globalDecode=true
  const displayRaw = isSensitive && !showSensitive ? "••••••••••••" : value;

  // effectiveShowDecoded: localOverride tiene prioridad, luego globalDecode (si hay decoded disponible)
  const effectiveShowDecoded = localOverride !== null ? localOverride : (globalDecode && canDecode && decoded !== null);

  const needsTruncate = isSensitive && !showSensitive
    ? false  // si está oculto como bullets, no truncar
    : displayRaw.length > TRUNCATE_LEN && !effectiveShowDecoded;
  const shown = needsTruncate && !expanded ? displayRaw.slice(0, TRUNCATE_LEN) + "…" : displayRaw;

  return (
    <div className="flex flex-col gap-1 w-full">
      {effectiveShowDecoded && decoded ? (
        <div className="flex flex-col gap-1">
          {/* Si es sensible y showSensitive=false, mostrar aviso */}
          {isSensitive && !showSensitive && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 italic">
              🔒 valor sensible — mostrando solo decode
            </span>
          )}
          <pre className="text-[10px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2 text-amber-800 dark:text-amber-300 overflow-x-auto max-h-48 whitespace-pre-wrap">
            {decoded}
          </pre>
          <button
            onClick={e => { e.stopPropagation(); setLocalOverride(false); }}
            className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap self-start"
          >
            ocultar decode
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-1 flex-wrap">
          <span className="text-foreground/80 break-all font-mono text-xs">{shown}</span>
          {needsTruncate && (
            <button
              onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
              className="text-[10px] text-primary hover:underline whitespace-nowrap"
            >
              {expanded ? "colapsar" : "ver más"}
            </button>
          )}
          {canDecode && decoded && (
            <button
              onClick={e => { e.stopPropagation(); setLocalOverride(true); }}
              className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline whitespace-nowrap"
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
  const bg = removed ? "diff-removed"
    : added ? "diff-added"
    : changed ? "diff-changed"
    : "bg-muted/30";
  const keyColor = removed ? "text-red-600 dark:text-red-400"
    : added ? "text-emerald-600 dark:text-emerald-400"
    : changed ? "text-amber-600 dark:text-amber-400"
    : "text-primary";

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
        {isSensitive && <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400 uppercase">sensitive</span>}
      </span>
      <div className="flex-1 min-w-0">
        <HeaderValue headerKey={headerKey} value={value} showSensitive={showSensitive} globalDecode={globalDecode} />
      </div>
      <button
        onClick={handleCopy}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted"
        title="Copiar valor"
      >
        {copied
          ? <CheckCircle className="w-3 h-3 text-emerald-500" />
          : <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
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
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className={`bg-background border border-border border-l-4 rounded-xl overflow-hidden ${
        isIncomplete ? "border-l-amber-400 dark:border-l-amber-500" :
        isError ? "border-l-red-400 dark:border-l-red-500" :
        isResponseEnd ? "border-l-orange-400 dark:border-l-orange-500" :
        isResponseStart ? "border-l-amber-300 dark:border-l-amber-400" :
        isEnd ? "border-l-emerald-400 dark:border-l-emerald-500" :
        "border-l-blue-400 dark:border-l-blue-500"
      }`}
    >
      <div
        className="p-4 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              {isIncomplete ? <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" /> :
               isError ? <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" /> :
               isResponseEnd ? <CheckCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" /> :
               isResponseStart ? <Play className="w-4 h-4 text-amber-600 dark:text-amber-400" /> :
               isEnd ? <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> :
               <Play className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">{friendlyPhaseName(step.phase)}</span>
                {isResponse && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold badge-warning">
                    RESPONSE
                  </span>
                )}
                {isIncomplete && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold badge-warning">
                    ⚠ SIN PHASE_END
                  </span>
                )}
                {!isExpanded && diffCounts && (diffCounts.added > 0 || diffCounts.changed > 0 || diffCounts.removed > 0) && (
                  <span className="flex items-center gap-1 text-[10px] font-mono">
                    {diffCounts.added > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{diffCounts.added}</span>}
                    {diffCounts.changed > 0 && <span className="text-amber-600 dark:text-amber-400">~{diffCounts.changed}</span>}
                    {diffCounts.removed > 0 && <span className="text-red-600 dark:text-red-400">-{diffCounts.removed}</span>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(step.timestamp).toLocaleTimeString()}</span>
                  <span className="font-mono text-foreground/60">
                    {allSameTs ? `#${ordinal}` : `+${relativeMs}ms`}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  isError ? "badge-error" :
                  isResponseEnd ? "badge-warning" :
                  isResponseStart ? "badge-warning" :
                  isEnd ? "badge-success" :
                  "badge-info"
                }`}>
                  {step.event.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-border bg-muted/20"
          >
            <div className="p-4 space-y-5">

              {/* Body del Request (solo en phase_start) */}
              {step.request_body && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Code className="w-3.5 h-3.5 text-primary" /> Body del Request
                    <span className="text-[10px] text-muted-foreground font-normal">{step.request_body.length} bytes · JSON</span>
                  </h4>
                  <div className="bg-muted rounded-lg p-3 overflow-auto max-h-64 border border-border">
                    <JsonHighlight json={(() => {
                      try { return JSON.stringify(JSON.parse(step.request_body), null, 2); } catch { return step.request_body; }
                    })()} />
                  </div>
                </div>
              )}

              {/* JWT Claims de esta fase */}
              {step.jwt_claims && Object.keys(step.jwt_claims).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Code className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> JWT Claims de esta fase
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(step.jwt_claims).map(([k, v]) => (
                      <div key={k} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                        <div className="text-[10px] text-muted-foreground mb-0.5">{k}</div>
                        <code className="text-xs text-amber-700 dark:text-amber-400 font-mono break-all">
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
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-muted-foreground" /> Cambios desde fase anterior
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
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Diff className="w-3.5 h-3.5 text-muted-foreground" /> {isResponse ? "Transformaciones de Response" : "Transformaciones en esta fase"}
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

              {/* Headers Before */}
              {beforeEntries.length > 0 && !isEnd && !isResponseEnd && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" /> {isResponse ? "Response Headers (antes)" : "Request Headers"} ({beforeEntries.length})
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
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-muted-foreground" /> {
                      isResponseEnd ? "Response Headers Finales" :
                      isResponseStart ? "Response Headers (después)" :
                      isEnd ? "Headers Finales" : "Response Headers"
                    } ({afterEntries.length})
                    {step.headers_before && (() => {
                      const added = afterEntries.filter(([k]) => !(k in step.headers_before)).length;
                      const changed = afterEntries.filter(([k, v]) => k in step.headers_before && step.headers_before[k] !== v).length;
                      const removed = Object.keys(step.headers_before).filter(k => !afterEntries.find(([ak]) => ak === k)).length;
                      return (
                        <span className="flex items-center gap-1 ml-1">
                          {added > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold badge-success">+{added}</span>}
                          {changed > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold badge-warning">~{changed}</span>}
                          {removed > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold badge-error">-{removed}</span>}
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

              {/* Body de Respuesta del Upstream */}
              {isResponseEnd && (step.response_body || step.response_body_skipped) && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Code className="w-3.5 h-3.5 text-muted-foreground" /> Body de Respuesta del Upstream
                    {step.response_body && (
                      <span className="text-[10px] text-muted-foreground font-normal">{step.response_body.length} bytes · JSON</span>
                    )}
                    {step.response_body_skipped && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">⚠ no capturado</span>
                    )}
                  </h4>
                  {step.response_body ? (
                    <div className="bg-muted rounded-lg p-3 overflow-auto max-h-96 border border-border">
                      <JsonHighlight json={(() => {
                        try { return JSON.stringify(JSON.parse(step.response_body), null, 2); } catch { return step.response_body; }
                      })()} />
                    </div>
                  ) : (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
                      {step.response_body_skipped}
                    </div>
                  )}
                </div>
              )}

              {/* No headers match search */}
              {search && beforeEntries.length === 0 && afterEntries.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-4">
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
