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

// Patrones de bots/scanners conocidos
const BOT_PATH_PATTERNS = [
  // Extensiones de archivos de servidor
  /\.php(\?|$)/i, /\.asp(\?|$)/i, /\.aspx(\?|$)/i, /\.cgi(\?|$)/i, /\.env(\?|$)/i,
  /\.git\//i, /\.svn\//i, /\.htaccess/i, /\.htpasswd/i,
  // CMS y exploits conocidos
  /wp-/i, /wordpress/i, /xmlrpc/i, /phpmyadmin/i,
  /admin\.php/i, /shell\.php/i, /wso/i, /c99/i, /r57/i,
  /eval-stdin/i, /setup-config/i, /classc/i, /cibai/i,
  /kaza/i, /HLA-/i, /ccv/i, /x569/i,
  // Exploits de frameworks
  /\/index\.php\?s=/i, /\/index\.php\?lang=/i, /invokefunction/i, /call_user_func/i,
  /think\\app/i, /thinkphp/i,
  // Inyecciones y traversal
  /allow_url_include/i, /auto_prepend_file/i, /php:\/\/input/i,
  /\.\.\/\.\.\/\.\.\//i, /\/etc\/passwd/i, /\/proc\//i,
  // Paths de bots de infraestructura
  /\/containers\/json/i, /\/v\d+\.\d+\/containers/i,
  // Encoding de bots
  /%%32/i, /%2e%2e/i, /cgi-bin/i,
  // Paths de exploits genéricos
  /\/hello\.world/i, /\/public\/index\.php/i,
  // Rutas raíz con query strings de exploit
  /^\/?%/,
];

function isBot(path: string): boolean {
  return BOT_PATH_PATTERNS.some((re) => re.test(path));
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

  // Carga inicial
  useEffect(() => {
    fetchRequests();
    fetchStats();
  }, [fetchRequests, fetchStats]);

  // Refs para evitar acumulación de WebSockets
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveModeRef = useRef(liveMode);
  const fetchRequestsRef = useRef(fetchRequests);
  const fetchStatsRef = useRef(fetchStats);

  // Mantener refs actualizados sin re-crear el efecto
  useEffect(() => { liveModeRef.current = liveMode; }, [liveMode]);
  useEffect(() => { fetchRequestsRef.current = fetchRequests; }, [fetchRequests]);
  useEffect(() => { fetchStatsRef.current = fetchStats; }, [fetchStats]);

  // WebSocket para actualizaciones en tiempo real
  useEffect(() => {
    if (!liveMode) {
      // Cerrar conexión existente si se desactiva liveMode
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    const wsUrl = API_BASE.replace("http://", "ws://").replace("https://", "wss://");

    const connect = () => {
      // Cerrar conexión previa antes de abrir una nueva
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.onclose = null; // evitar reconexión automática al cerrar manualmente
        wsRef.current.close();
      }

      try {
        const ws = new WebSocket(`${wsUrl}/api/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

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

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch (err) {
        setWsConnected(false);
      }
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // evitar reconexión al desmontar
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [liveMode]); // Solo depende de liveMode, no de los callbacks

  // Polling fallback si no hay WebSocket
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

    // Filtro por status code exacto (si el usuario escribió algo)
    const trimmed = customStatus.trim();
    const matchesCustomStatus =
      trimmed === "" ||
      String(req.status_code) === trimmed ||
      (trimmed.endsWith("xx") && String(req.status_code).startsWith(trimmed[0]));

    // Excluir bots/scanners
    const notBot = !excludeBots || !isBot(req.path || "");

    return matchesSearch && matchesStatus && matchesCustomStatus && notBot;
  });

  function getStatusIcon(status: number) {
    if (!status) return <Activity className="w-5 h-5 text-blue-400 animate-pulse" />;
    if (status >= 200 && status < 300) return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (status >= 400 && status < 500) return <XCircle className="w-5 h-5 text-red-400" />;
    if (status >= 500) return <AlertTriangle className="w-5 h-5 text-orange-400" />;
    return <Activity className="w-5 h-5 text-blue-400" />;
  }

  function getStatusColor(status: number) {
    if (!status) return "text-blue-400 bg-blue-500/10 border-blue-500/20";
    if (status >= 200 && status < 300) return "text-green-400 bg-green-500/10 border-green-500/20";
    if (status >= 400 && status < 500) return "text-red-400 bg-red-500/10 border-red-500/20";
    if (status >= 500) return "text-orange-400 bg-orange-500/10 border-orange-500/20";
    return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  }

  function getDurationColor(ms: number) {
    if (!ms) return "text-gray-400";
    if (ms < 50) return "text-green-400";
    if (ms < 200) return "text-yellow-400";
    return "text-red-400";
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

  return (
    <div className="min-h-screen">
      {/* Header */}
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-white/10 glass-strong backdrop-blur-xl sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <motion.button
                  whileHover={{ scale: 1.1, x: -5 }}
                  className="w-10 h-10 rounded-xl glass hover:glass-strong flex items-center justify-center glow-cyan"
                >
                  <ArrowLeft className="w-5 h-5 text-cyan-400" />
                </motion.button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold gradient-text">Live Request Monitor</h1>
                <p className="text-sm text-purple-300/60">
                  Correlación real de logs Envoy por request_id
                  {lastUpdate && (
                    <span className="ml-2 text-gray-500">
                      · actualizado {lastUpdate.toLocaleTimeString("es-CO", { hour12: false })}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Stats rápidas */}
              {stats && (
                <div className="flex gap-3">
                  <div className="px-3 py-2 rounded-lg glass-strong text-xs text-center">
                    <div className="text-cyan-400 font-bold text-lg">{stats.total}</div>
                    <div className="text-gray-400">Total</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg glass-strong text-xs text-center">
                    <div className="text-red-400 font-bold text-lg">{stats.errors}</div>
                    <div className="text-gray-400">Errores</div>
                  </div>
                  <div className="px-3 py-2 rounded-lg glass-strong text-xs text-center">
                    <div className="text-purple-400 font-bold text-lg">{stats.avg_duration}ms</div>
                    <div className="text-gray-400">Avg</div>
                  </div>
                </div>
              )}

              {/* Live toggle */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setLiveMode(!liveMode)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
                  liveMode
                    ? "glass-strong border-2 border-green-400 text-green-300"
                    : "glass text-gray-400 hover:text-white"
                }`}
              >
                {wsConnected ? (
                  <Wifi className="w-4 h-4 text-green-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-yellow-400" />
                )}
                <span>{liveMode ? "Live" : "Paused"}</span>
              </motion.button>

              {/* Refresh manual */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { fetchRequests(); fetchStats(); }}
                className="w-10 h-10 rounded-xl glass hover:glass-strong flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4 text-cyan-400" />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Filtros */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl p-6"
        >
          <div className="flex flex-wrap gap-4">
            {/* Búsqueda por texto */}
            <div className="flex-1 min-w-[260px]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por path, método o request_id..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
            </div>

            {/* Filtro por status code exacto */}
            <div className="relative w-36">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Status: 200"
                value={customStatus}
                onChange={(e) => {
                  setCustomStatus(e.target.value);
                  if (e.target.value.trim() !== "") setStatusFilter("all");
                }}
                maxLength={3}
                className="w-full pl-9 pr-3 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 font-mono"
              />
            </div>

            {/* Botones de filtro por rango */}
            <div className="flex gap-2 flex-wrap">
              {[
                { key: "all", label: "Todos", color: "cyan" },
                { key: "success", label: "2xx", color: "green" },
                { key: "error", label: "4xx/5xx", color: "red" },
                { key: "pending", label: "Pendientes", color: "yellow" },
              ].map(({ key, label, color }) => (
                <motion.button
                  key={key}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setStatusFilter(key); setCustomStatus(""); }}
                  className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                    statusFilter === key && customStatus === ""
                      ? `glass-strong border-2 border-${color}-400 text-white`
                      : "glass text-gray-400 hover:text-white"
                  }`}
                >
                  {label}
                </motion.button>
              ))}

              {/* Toggle excluir bots */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setExcludeBots(!excludeBots)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                  excludeBots
                    ? "glass-strong border-2 border-orange-400 text-orange-300"
                    : "glass text-gray-400 hover:text-white"
                }`}
                title="Ocultar requests de bots/scanners (.php, wp-, etc.)"
              >
                <Bug className="w-4 h-4" />
                <span>Sin bots</span>
              </motion.button>
            </div>
          </div>

          {/* Contador de resultados */}
          <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
            <span>
              Mostrando <span className="text-cyan-400 font-bold">{filteredRequests.length}</span> de{" "}
              <span className="text-white font-bold">{requests.length}</span> requests
            </span>
            {excludeBots && (
              <span className="text-orange-400">
                · {requests.filter((r) => isBot(r.path || "")).length} bots ocultos
              </span>
            )}
            {customStatus.trim() !== "" && (
              <span className="text-purple-400">
                · filtrando status <span className="font-mono font-bold">{customStatus}</span>
                <button
                  onClick={() => setCustomStatus("")}
                  className="ml-1 text-gray-500 hover:text-white"
                >✕</button>
              </span>
            )}
          </div>
        </motion.div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-cyan-400">
              <RefreshCw className="w-6 h-6 animate-spin" />
              <span>Conectando al backend...</span>
            </div>
          </div>
        )}

        {/* Lista de requests */}
        {!loading && (
          <div className="space-y-3">
            {filteredRequests.map((req, idx) => (
              <motion.div
                key={req.request_id}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(idx * 0.03, 0.3) }}
              >
                <Link href={`/flow/${encodeURIComponent(req.request_id)}`}>
                  <motion.div
                    whileHover={{ scale: 1.01, x: 6 }}
                    className={`glass-strong rounded-2xl p-5 cursor-pointer border-l-4 ${
                      !req.access_log_received
                        ? "border-blue-500/50"
                        : req.status_code >= 200 && req.status_code < 300
                        ? "border-green-500/50"
                        : req.status_code >= 400
                        ? "border-red-500/50"
                        : "border-orange-500/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Izquierda: status + método + path */}
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {getStatusIcon(req.status_code)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span
                              className={`px-2 py-0.5 rounded-lg font-bold text-xs flex-shrink-0 ${
                                req.method === "GET"
                                  ? "bg-blue-500/20 text-blue-300"
                                  : req.method === "POST"
                                  ? "bg-green-500/20 text-green-300"
                                  : req.method === "PUT"
                                  ? "bg-yellow-500/20 text-yellow-300"
                                  : req.method === "DELETE"
                                  ? "bg-red-500/20 text-red-300"
                                  : "bg-purple-500/20 text-purple-300"
                              }`}
                            >
                              {req.method || "?"}
                            </span>
                            <code className="text-white font-semibold truncate">{req.path || "—"}</code>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span className="font-mono text-gray-500" title={req.request_id}>
                              {shortID(req.request_id)}
                            </span>
                            <span>·</span>
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(req.start_time)}</span>
                            {req.authority && (
                              <>
                                <span>·</span>
                                <span className="text-purple-400">{req.authority}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Centro: métricas */}
                      <div className="flex items-center gap-6 flex-shrink-0">
                        {/* Status code */}
                        <div className="text-center">
                          <div className={`text-xl font-bold ${getStatusColor(req.status_code)}`}>
                            {req.status_code || "…"}
                          </div>
                          <div className="text-xs text-gray-500">status</div>
                        </div>

                        {/* Duración */}
                        <div className="text-center">
                          <div className={`text-xl font-bold ${getDurationColor(req.duration_ms)}`}>
                            {req.duration_ms ? `${req.duration_ms}ms` : "…"}
                          </div>
                          <div className="text-xs text-gray-500">duración</div>
                        </div>

                        {/* Fases */}
                        <div className="text-center">
                          <div className="text-xl font-bold text-purple-400">
                            {req.phases?.length || 0}
                          </div>
                          <div className="text-xs text-gray-500">fases</div>
                        </div>

                        {/* JWT */}
                        {req.jwt_claims && Object.keys(req.jwt_claims).length > 0 && (
                          <div className="px-2 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-300 font-semibold">
                            JWT ✓
                          </div>
                        )}

                        {/* Errores */}
                        {req.errors && req.errors.length > 0 && (
                          <div className="px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-semibold">
                            {req.errors.length} error{req.errors.length > 1 ? "es" : ""}
                          </div>
                        )}

                        {/* Upstream */}
                        {req.upstream_cluster && (
                          <div className="hidden lg:block text-xs text-gray-500 max-w-[120px] truncate" title={req.upstream_cluster}>
                            → {req.upstream_cluster}
                          </div>
                        )}

                        {/* Pending indicator */}
                        {!req.access_log_received && (
                          <div className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 animate-pulse">
                            en curso
                          </div>
                        )}
                      </div>

                      {/* Derecha: ver */}
                      <Eye className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                    </div>
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredRequests.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-2xl p-16 text-center"
          >
            <BarChart3 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-400 mb-2">
              {requests.length === 0 ? "Esperando requests..." : "No hay resultados"}
            </h3>
            <p className="text-gray-500 mb-4">
              {requests.length === 0
                ? "El sistema está listo. Envía requests al gateway para verlos aquí."
                : "Ajusta los filtros de búsqueda."}
            </p>
            {requests.length === 0 && (
              <div className="text-xs text-gray-600 font-mono bg-black/30 rounded-lg p-4 inline-block">
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
