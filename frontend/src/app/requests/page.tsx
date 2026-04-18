"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Search, CheckCircle, XCircle, AlertTriangle,
  Clock, Eye, Activity, RefreshCw, Wifi, WifiOff, BarChart3, Bug, Filter,
  Download, ChevronUp, ChevronDown, ChevronsUpDown, Globe, Layers, List
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
  error_response_body?: string;
}

// Mejora 2+10: Agrupación por path
interface PathGroup {
  path: string;
  method: string;
  count: number;
  errors: number;
  avgDuration: number;
  lastSeen: string;
  requests: RequestTrace[];
}

type SortField = "time" | "duration" | "status" | "path";
type SortDir = "asc" | "desc";
type ViewMode = "list" | "grouped";

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
  // Mejora 5: Filtro por authority/host
  const [hostFilter, setHostFilter] = useState("");
  // Mejora 8: Ordenamiento
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Mejora 2+10: Modo de vista
  const [viewMode, setViewMode] = useState<ViewMode>("list");

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

  // Mejora 5: hosts únicos para el dropdown
  const uniqueHosts = useMemo(() => {
    const hosts = new Set<string>();
    requests.forEach(r => { if (r.authority) hosts.add(r.authority); });
    return Array.from(hosts).sort();
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let result = requests.filter((req) => {
      const matchesSearch =
        req.path?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.method?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.request_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.error_response_body?.toLowerCase().includes(searchTerm.toLowerCase());

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

      // Mejora 5: filtro por host
      const matchesHost = !hostFilter || req.authority === hostFilter;

      return matchesSearch && matchesStatus && matchesCustomStatus && notBot && matchesHost;
    });

    // Mejora 8: ordenamiento
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === "time") {
        cmp = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      } else if (sortField === "duration") {
        cmp = (a.duration_ms || 0) - (b.duration_ms || 0);
      } else if (sortField === "status") {
        cmp = (a.status_code || 0) - (b.status_code || 0);
      } else if (sortField === "path") {
        cmp = (a.path || "").localeCompare(b.path || "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [requests, searchTerm, statusFilter, customStatus, excludeBots, hostFilter, sortField, sortDir]);

  // Mejora 2+10: Agrupación por path+method
  const groupedByPath = useMemo((): PathGroup[] => {
    const map = new Map<string, PathGroup>();
    filteredRequests.forEach(req => {
      const key = `${req.method}:${req.path}`;
      if (!map.has(key)) {
        map.set(key, { path: req.path || "—", method: req.method || "?", count: 0, errors: 0, avgDuration: 0, lastSeen: req.start_time, requests: [] });
      }
      const g = map.get(key)!;
      g.count++;
      if (req.errors && req.errors.length > 0) g.errors++;
      g.avgDuration = Math.round((g.avgDuration * (g.count - 1) + (req.duration_ms || 0)) / g.count);
      if (new Date(req.start_time) > new Date(g.lastSeen)) g.lastSeen = req.start_time;
      g.requests.push(req);
    });
    return Array.from(map.values()).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }, [filteredRequests]);

  // Mejora 9: Exportar CSV
  function exportCSV() {
    const headers = ["request_id", "method", "path", "authority", "status_code", "duration_ms", "start_time", "upstream_cluster", "errors", "error_response_body"];
    const rows = filteredRequests.map(r => [
      r.request_id, r.method, r.path, r.authority, r.status_code, r.duration_ms,
      r.start_time, r.upstream_cluster, r.errors?.length || 0, r.error_response_body || ""
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `requests-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Mejora 9: Exportar JSON
  function exportJSON() {
    const blob = new Blob([JSON.stringify(filteredRequests, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `requests-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  // Mejora 8: helper para icono de sort
  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  // Mejora 7: sparkline de últimos 20 requests (tasa de error)
  const sparklineData = useMemo(() => {
    const last20 = [...requests].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()).slice(-20);
    return last20.map(r => r.status_code >= 400 ? 1 : 0);
  }, [requests]);

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

            <div className="flex items-center gap-2 flex-wrap">
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
                  {/* Mejora 7: Mini sparkline de tasa de errores */}
                  {sparklineData.length > 0 && (
                    <div className="px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-center" title="Tasa de errores últimos 20 requests">
                      <div className="flex items-end gap-px h-5 mb-0.5">
                        {sparklineData.map((isErr, i) => (
                          <div
                            key={i}
                            className={`w-1.5 rounded-sm ${isErr ? "bg-red-500" : "bg-emerald-500"}`}
                            style={{ height: isErr ? "100%" : "40%" }}
                          />
                        ))}
                      </div>
                      <div className="text-muted-foreground">Trend</div>
                    </div>
                  )}
                </div>
              )}

              {/* Mejora 2: Toggle vista lista/agrupada */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setViewMode("list")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
                  title="Vista lista"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("grouped")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === "grouped" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
                  title="Vista agrupada por path"
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Mejora 9: Exportar */}
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Exportar CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
                <div className="w-px bg-border" />
                <button
                  onClick={exportJSON}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Exportar JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>JSON</span>
                </button>
              </div>

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

            {/* Mejora 5: Filtro por host */}
            {uniqueHosts.length > 0 && (
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <select
                  value={hostFilter}
                  onChange={(e) => setHostFilter(e.target.value)}
                  className="input-base pl-9 pr-8 text-sm appearance-none cursor-pointer min-w-[180px]"
                >
                  <option value="">Todos los hosts</option>
                  {uniqueHosts.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Mejora 8: Ordenamiento */}
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-muted-foreground mr-1">Ordenar:</span>
              {(["time", "duration", "status", "path"] as SortField[]).map(f => (
                <button
                  key={f}
                  onClick={() => toggleSort(f)}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    sortField === f
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{{ time: "Tiempo", duration: "Duración", status: "Status", path: "Path" }[f]}</span>
                  <SortIcon field={f} />
                </button>
              ))}
            </div>
          </div>

          {/* Contador */}
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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
            {hostFilter && (
              <span className="flex items-center gap-1">
                · host: <code className="font-mono font-bold text-foreground">{hostFilter}</code>
                <button onClick={() => setHostFilter("")} className="ml-1 hover:text-foreground">✕</button>
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

        {/* Lista de requests — vista lista */}
        {!loading && viewMode === "list" && (
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
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${getMethodClass(req.method)}`}>
                              {req.method || "?"}
                            </span>
                            <code className="text-foreground font-semibold text-sm truncate">{req.path || "—"}</code>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span className="font-mono" title={req.request_id}>
                              {shortID(req.request_id)}
                            </span>
                            <span>·</span>
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(req.start_time)}</span>
                            {req.authority && (
                              <>
                                <span>·</span>
                                <Globe className="w-3 h-3" />
                                <span className="text-foreground/60">{req.authority}</span>
                              </>
                            )}
                          </div>
                          {/* Mejora 1+6: error_response_body visible en la tarjeta */}
                          {req.error_response_body && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 flex-shrink-0">
                                Body
                              </span>
                              <span className="text-xs text-red-600 dark:text-red-400 font-mono truncate max-w-[300px]" title={req.error_response_body}>
                                {req.error_response_body}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Centro: métricas */}
                      <div className="flex items-center gap-3 flex-shrink-0 flex-wrap justify-end">
                        <div className="text-center">
                          <div className={`font-bold px-2 py-0.5 rounded text-xs ${getStatusClass(req.status_code)}`}>
                            {req.status_code || "—"}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">status</div>
                        </div>

                        {/* Mejora 4: spinner para duración pendiente */}
                        <div className="text-center">
                          {!req.access_log_received ? (
                            <>
                              <div className="flex items-center justify-center">
                                <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                              </div>
                              <div className="text-[10px] text-muted-foreground">duración</div>
                            </>
                          ) : (
                            <>
                              <div className={`font-bold text-sm ${getDurationClass(req.duration_ms)}`}>
                                {req.duration_ms ? `${req.duration_ms}ms` : "—"}
                              </div>
                              <div className="text-[10px] text-muted-foreground">duración</div>
                            </>
                          )}
                        </div>

                        <div className="text-center">
                          <div className="font-bold text-sm text-foreground">
                            {req.phases?.length || 0}
                          </div>
                          <div className="text-[10px] text-muted-foreground">fases</div>
                        </div>

                        {/* JWT badge */}
                        {(() => {
                          const hdrs = req.request_headers ?? {};
                          const hasAuth = typeof hdrs["authorization"] === "string" &&
                            hdrs["authorization"].toLowerCase().startsWith("bearer ");
                          const hasUserToken = typeof hdrs["x-vix-user-token"] === "string" &&
                            hdrs["x-vix-user-token"].split(".").length === 3 &&
                            hdrs["x-vix-user-token"].length > 50;
                          const claims = req.jwt_claims ?? {};
                          const hasBeforeAuth = Object.keys(claims).some(k => k.startsWith("beforeauth_"));
                          const hasAfterAuth = Object.keys(claims).some(k => k.startsWith("afterauth_"));
                          const authCount = (hasAuth || hasBeforeAuth ? 1 : 0) + (hasUserToken || hasAfterAuth ? 1 : 0);
                          if (authCount === 0) return null;
                          if (authCount === 2) {
                            return (
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700" title="Authorization + x-vix-user-token">
                                2JWT
                              </span>
                            );
                          }
                          return (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700" title={hasAuth || hasBeforeAuth ? "Solo Authorization" : "Solo x-vix-user-token"}>
                              1JWT
                            </span>
                          );
                        })()}

                        {/* Mejora 6: badge errores */}
                        {req.errors && req.errors.length > 0 && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold badge-error" title={req.errors.map(e => e.message).join(" | ")}>
                            {req.errors.length} error{req.errors.length > 1 ? "es" : ""}
                          </span>
                        )}

                        {/* Mejora 3: Upstream con tooltip mejorado */}
                        {req.upstream_cluster && (
                          <div
                            className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground max-w-[140px] group relative cursor-default"
                            title={`Upstream: ${req.upstream_cluster}${req.upstream_host ? `\nHost: ${req.upstream_host}` : ""}`}
                          >
                            <span className="text-muted-foreground/50">→</span>
                            <span className="truncate font-mono text-[11px]">
                              {req.upstream_cluster.replace(/^outbound\|[^|]+\|[^|]*\|/, "").replace(/\.svc\.cluster\.local$/, "") || req.upstream_cluster}
                            </span>
                          </div>
                        )}

                        {/* Pending badge */}
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

        {/* Mejora 2+10: Vista agrupada por path */}
        {!loading && viewMode === "grouped" && (
          <div className="space-y-2">
            {groupedByPath.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No hay requests que mostrar</div>
            ) : (
              groupedByPath.map((group) => {
                const errorRate = group.count > 0 ? Math.round((group.errors / group.count) * 100) : 0;
                return (
                  <motion.div
                    key={`${group.method}:${group.path}`}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`bg-card border rounded-xl p-4 border-l-4 ${
                      errorRate > 50
                        ? "border-l-red-400 dark:border-l-red-500"
                        : errorRate > 0
                        ? "border-l-amber-400 dark:border-l-amber-500"
                        : "border-l-emerald-400 dark:border-l-emerald-500"
                    } border-border`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Izquierda: método + path */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${getMethodClass(group.method)}`}>
                              {group.method}
                            </span>
                            <code className="text-foreground font-semibold text-sm truncate">{group.path}</code>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>último: {formatTime(group.lastSeen)}</span>
                            <span>·</span>
                            <span>avg: <span className={`font-semibold ${getDurationClass(group.avgDuration)}`}>{group.avgDuration}ms</span></span>
                          </div>
                        </div>
                      </div>

                      {/* Derecha: métricas del grupo */}
                      <div className="flex items-center gap-4 flex-shrink-0">
                        {/* Mejora 10: contador de requests por path */}
                        <div className="text-center">
                          <div className="font-bold text-lg text-foreground">{group.count}</div>
                          <div className="text-[10px] text-muted-foreground">requests</div>
                        </div>

                        <div className="text-center">
                          <div className={`font-bold text-lg ${group.errors > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {group.errors}
                          </div>
                          <div className="text-[10px] text-muted-foreground">errores</div>
                        </div>

                        {/* Tasa de error */}
                        <div className="text-center min-w-[52px]">
                          <div className={`font-bold text-sm ${errorRate > 50 ? "text-red-600 dark:text-red-400" : errorRate > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {errorRate}%
                          </div>
                          <div className="text-[10px] text-muted-foreground">error rate</div>
                        </div>

                        {/* Mini barra de error rate */}
                        <div className="hidden md:flex flex-col items-center gap-1">
                          <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${errorRate > 50 ? "bg-red-500" : errorRate > 0 ? "bg-amber-500" : "bg-emerald-500"}`}
                              style={{ width: `${errorRate}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-muted-foreground">tasa</div>
                        </div>

                        {/* Ver requests del grupo */}
                        <Link href={`/requests?path=${encodeURIComponent(group.path)}&method=${group.method}`}>
                          <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors">
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver</span>
                          </button>
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
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
