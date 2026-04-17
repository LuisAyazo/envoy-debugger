"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Search, CheckCircle, XCircle, AlertTriangle,
  Clock, Eye, Activity, RefreshCw, Wifi, WifiOff, BarChart3, Bug, Filter
} from "lucide-react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface RequestTrace {
  request_id: string;
  trace_id: string;
  traceparent: string;
  method: string;
  path: string;
  authority: string;
  user_agent: string;
  status_code: number;
  duration_ms: number;
  start_time: string;
  end_time: string;
  upstream_host: string;
  upstream_cluster: string;
  response_flags: string;
  downstream_ip: string;
  jwt_claims: Record<string, unknown> | null;
  request_headers: Record<string, string> | null;
  phases: PhaseLog[];
  errors: RequestError[];
  access_log_received: boolean;
}

interface PhaseLog {
  phase: string;
  event: string;
  timestamp: string;
  headers_before?: Record<string, string>;
  headers_after?: Record<string, string>;
  jwt_claims?: Record<string, unknown>;
}

interface RequestError {
  phase: string;
  message: string;
  timestamp: string;
}

interface Stats {
  total: number;
  errors: number;
  complete: number;
  avg_duration: number;
}

const BOT_PATH_PATTERNS = [
  /\.php(\?|$)/i, /\.asp(\?|$)/i, /\.aspx(\?|$)/i, /\.cgi(\?|$)/i, /\.env(\?|$)/i,
  /\.git\//i, /\.svn\//i, /\.htaccess/i, /\.htpasswd/i,
  /wp-/i, /wordpress/i, /xmlrpc/i, /phpmyadmin/i,
  /admin\.php/i, /shell\.php/i, /wso/i, /c99/i, /r57/i,
  /eval-stdin/i, /setup-config/i, /classc/i, /cibai/i,
  /kaza/i, /HLA-/i, /ccv/i, /x569/i,
  /\/index\.php\?s=/i, /\/index\.php\?lang=/i, /invokefunction/i, /call_user_func/i,
  /think\\app/i, /thinkphp/i,
  /allow_url_include/i, /auto_prepend_file/i, /php:\/\/input/i,
  /\.\.\/\.\.\/\.\.\//i, /\/etc\/passwd/i, /\/proc\//i,
  /\/containers\/json/i, /\/v\d+\.\d+\/containers/i,
  /%%32/i, /%2e%2e/i, /cgi-bin/i,
  /\/hello\.world/i, /\/public\/index\.php/i,
  /^\/?%/,
];

function isBot(path: string): boolean {
  return BOT_PATH_PATTERNS.some((re) => re.test(path));
}

function getMethodClass(method: string): string {
  switch (method) {
    case "GET": return "method-get";
    case "POST": return "method-post";
    case "PUT": return "method-put";
    case "DELETE": return "method-delete";
    default: return "badge-neutral";
  }
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<RequestTrace[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customStatus, setCustomStatus] = useState("");
  const [excludeBots, setExcludeBots] = useState(true);
  const [loading, setLoading] = useState(true);
  const [liveMode, setLiveMode] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/requests?limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRequests(data.requests || []);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch requests:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/requests/stats`);
      if (!res.ok) return;
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    fetchStats();
  }, [fetchRequests, fetchStats]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveModeRef = useRef(liveMode);
  const fetchRequestsRef = useRef(fetchRequests);
  const fetchStatsRef = useRef(fetchStats);

  useEffect(() => { liveModeRef.current = liveMode; }, [liveMode]);
  useEffect(() => { fetchRequestsRef.current = fetchRequests; }, [fetchRequests]);
  useEffect(() => { fetchStatsRef.current = fetchStats; }, [fetchStats]);

  useEffect(() => {
    if (!liveMode) {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const wsUrl = API_BASE.replace("http://", "ws://").replace("https://", "wss://");

    const connect = () => {
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }

      try {
        const ws = new WebSocket(`${wsUrl}/api/ws`);
        wsRef.current = ws;

        ws.onopen = () => { setWsConnected(true); };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "request_updated") {
              fetchRequestsRef.current();
              fetchStatsRef.current();
            }
          } catch {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (liveModeRef.current) {
            reconnectTimerRef.current = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => { setWsConnected(false); };
      } catch {
        setWsConnected(false);
      }
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [liveMode]);

  useEffect(() => {
    if (!liveMode || wsConnected) return;
    const interval = setInterval(() => {
      fetchRequests();
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
  }, [liveMode, wsConnected, fetchRequests, fetchStats]);

  const filteredRequests = requests.filter((req) => {
    const matchesSearch =
      req.path?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.method?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.request_id?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "success" && req.status_code >= 200 && req.status_code < 300) ||
      (statusFilter === "error" && req.status_code >= 400) ||
      (statusFilter === "pending" && !req.access_log_received);

    const trimmed = customStatus.trim();
    const matchesCustomStatus =
      trimmed === "" ||
      String(req.status_code) === trimmed ||
      (trimmed.endsWith("xx") && String(req.status_code).startsWith(trimmed[0]));

    const notBot = !excludeBots || !isBot(req.path || "");

    return matchesSearch && matchesStatus && matchesCustomStatus && notBot;
  });

  function getStatusIcon(status: number) {
    if (!status) return <Activity className="w-4 h-4 text-blue-500 animate-pulse" />;
    if (status >= 200 && status < 300) return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    if (status >= 400 && status < 500) return <XCircle className="w-4 h-4 text-red-500" />;
    if (status >= 500) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <Activity className="w-4 h-4 text-blue-500" />;
  }

  function getStatusClass(status: number): string {
    if (!status) return "badge-info";
    if (status >= 200 && status < 300) return "badge-success";
    if (status >= 400 && status < 500) return "badge-error";
    if (status >= 500) return "badge-warning";
    return "badge-info";
  }

  function getDurationClass(ms: number): string {
    if (!ms) return "text-muted-foreground";
    if (ms < 50) return "text-emerald-600 dark:text-emerald-400";
    if (ms < 200) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  }

  function formatTime(ts: string) {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleTimeString("es-CO", { hour12: false });
    } catch {
      return ts;
    }
  }

  function shortID(id: string) {
    if (!id) return "—";
    return id.length > 16 ? `${id.substring(0, 8)}…${id.substring(id.length - 4)}` : id;
  }

  const filterButtons = [
    { key: "all", label: "Todos" },
    { key: "success", label: "2xx" },
    { key: "error", label: "4xx/5xx" },
    { key: "pending", label: "Pendientes" },
  ];

  return (
    <div className="min-h-screen">
      {/* Sub-header */}
      <div className="border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/">
                <button className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors">
                  <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                </button>
              </Link>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Live Request Monitor</h1>
                <p className="text-xs text-muted-foreground">
                  Correlación real de logs Envoy por request_id
                  {lastUpdate && (
                    <span className="ml-2">
                      · actualizado {lastUpdate.toLocaleTimeString("es-CO", { hour12: false })}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Stats rápidas */}
              {stats && (
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-center">
                    <div className="font-bold text-foreground">{stats.total}</div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-center">
                    <div className="font-bold text-red-600 dark:text-red-400">{stats.errors}</div>
                    <div className="text-muted-foreground">Errores</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-center">
                    <div className="font-bold text-blue-600 dark:text-blue-400">{stats.avg_duration}ms</div>
                    <div className="text-muted-foreground">Avg</div>
                  </div>
                </div>
              )}

              {/* Live toggle */}
              <button
                onClick={() => setLiveMode(!liveMode)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  liveMode
                    ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {wsConnected ? (
                  <Wifi className="w-3.5 h-3.5" />
                ) : (
                  <WifiOff className="w-3.5 h-3.5" />
                )}
                <span>{liveMode ? "Live" : "Paused"}</span>
              </button>

              {/* Refresh */}
              <button
                onClick={() => { fetchRequests(); fetchStats(); }}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-4">
        {/* Filtros */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-xl p-4"
        >
          <div className="flex flex-wrap gap-3">
            {/* Búsqueda */}
            <div className="flex-1 min-w-[240px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por path, método o request_id..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-base w-full pl-9"
              />
            </div>

            {/* Status code exacto */}
            <div className="relative w-32">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Status: 200"
                value={customStatus}
                onChange={(e) => {
                  setCustomStatus(e.target.value);
                  if (e.target.value.trim() !== "") setStatusFilter("all");
                }}
                maxLength={3}
                className="input-base w-full pl-9 font-mono"
              />
            </div>

            {/* Filtros por rango */}
            <div className="flex gap-1.5 flex-wrap">
              {filterButtons.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setStatusFilter(key); setCustomStatus(""); }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === key && customStatus === ""
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  }`}
                >
                  {label}
                </button>
              ))}

              {/* Toggle bots */}
              <button
                onClick={() => setExcludeBots(!excludeBots)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  excludeBots
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                title="Ocultar requests de bots/scanners"
              >
                <Bug className="w-3.5 h-3.5" />
                <span>Sin bots</span>
              </button>
            </div>
          </div>

          {/* Contador */}
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Mostrando{" "}
              <span className="text-foreground font-semibold">{filteredRequests.length}</span>
              {" "}de{" "}
              <span className="text-foreground font-semibold">{requests.length}</span>
              {" "}requests
            </span>
            {excludeBots && (
              <span className="text-amber-600 dark:text-amber-400">
                · {requests.filter((r) => isBot(r.path || "")).length} bots ocultos
              </span>
            )}
            {customStatus.trim() !== "" && (
              <span>
                · filtrando status{" "}
                <code className="font-mono font-bold text-foreground">{customStatus}</code>
                <button
                  onClick={() => setCustomStatus("")}
                  className="ml-1 hover:text-foreground"
                >✕</button>
              </span>
            )}
          </div>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Conectando al backend...</span>
            </div>
          </div>
        )}

        {/* Lista de requests */}
        {!loading && (
          <div className="space-y-2">
            {filteredRequests.map((req, idx) => (
              <motion.div
                key={req.request_id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.2) }}
              >
                <Link href={`/flow/${encodeURIComponent(req.request_id)}`}>
                  <div
                    className={`bg-card border rounded-xl p-4 cursor-pointer border-l-4 hover:shadow-md transition-all ${
                      !req.access_log_received
                        ? "border-l-blue-400 dark:border-l-blue-500"
                        : req.status_code >= 200 && req.status_code < 300
                        ? "border-l-emerald-400 dark:border-l-emerald-500"
                        : req.status_code >= 400
                        ? "border-l-red-400 dark:border-l-red-500"
                        : "border-l-amber-400 dark:border-l-amber-500"
                    } border-border hover:border-primary/30`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Izquierda */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {getStatusIcon(req.status_code)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${getMethodClass(req.method)}`}>
                              {req.method || "?"}
                            </span>
                            <code className="text-foreground font-semibold text-sm truncate">{req.path || "—"}</code>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono" title={req.request_id}>
                              {shortID(req.request_id)}
                            </span>
                            <span>·</span>
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(req.start_time)}</span>
                            {req.authority && (
                              <>
                                <span>·</span>
                                <span className="text-foreground/60">{req.authority}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Centro: métricas */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-center">
                          <div className={`text-base font-bold px-2 py-0.5 rounded text-xs ${getStatusClass(req.status_code)}`}>
                            {req.status_code || "…"}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">status</div>
                        </div>

                        <div className="text-center">
                          <div className={`text-base font-bold ${getDurationClass(req.duration_ms)}`}>
                            {req.duration_ms ? `${req.duration_ms}ms` : "…"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">duración</div>
                        </div>

                        <div className="text-center">
                          <div className="text-base font-bold text-foreground">
                            {req.phases?.length || 0}
                          </div>
                          <div className="text-[10px] text-muted-foreground">fases</div>
                        </div>

                        {/* JWT badge */}
                        {(() => {
                          const hasJwtClaims = req.jwt_claims && Object.keys(req.jwt_claims).length > 0;
                          const hasJwtInHeaders = req.request_headers && Object.values(req.request_headers).some(v =>
                            typeof v === "string" && (v.startsWith("Bearer ") || (v.split(".").length === 3 && v.length > 50))
                          );
                          if (!hasJwtClaims && !hasJwtInHeaders) return null;
                          return (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold badge-warning">
                              JWT ✓
                            </span>
                          );
                        })()}

                        {/* Errores */}
                        {req.errors && req.errors.length > 0 && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold badge-error">
                            {req.errors.length} error{req.errors.length > 1 ? "es" : ""}
                          </span>
                        )}

                        {/* Upstream */}
                        {req.upstream_cluster && (
                          <div className="hidden lg:block text-xs text-muted-foreground max-w-[120px] truncate" title={req.upstream_cluster}>
                            → {req.upstream_cluster}
                          </div>
                        )}

                        {/* Pending */}
                        {!req.access_log_received && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold badge-info animate-pulse">
                            en curso
                          </span>
                        )}
                      </div>

                      {/* Derecha */}
                      <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredRequests.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-xl p-16 text-center"
          >
            <BarChart3 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {requests.length === 0 ? "Esperando requests..." : "No hay resultados"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {requests.length === 0
                ? "El sistema está listo. Envía requests al gateway para verlos aquí."
                : "Ajusta los filtros de búsqueda."}
            </p>
            {requests.length === 0 && (
              <div className="text-xs text-muted-foreground font-mono bg-muted rounded-lg p-4 inline-block">
                Activa K8S_STREAMER_ENABLED=true en el backend<br />
                o usa POST /api/logs para enviar logs manualmente
              </div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
