"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Filter, Search, AlertCircle, CheckCircle, Clock, Zap,
  ArrowLeft, Globe, MapPin, Server, RefreshCw, Download,
  TrendingUp, X, ChevronDown
} from "lucide-react";
import Link from "next/link";

type TimeFilter = "all" | "1h" | "6h" | "24h" | "7d" | "custom";

export default function TracesPage() {
  const [filters, setFilters] = useState({
    method: "",
    statusCode: "",
    minLatency: "",
    maxLatency: "",
    searchQuery: "",
    timeFilter: "all" as TimeFilter,
    customStartDate: "",
    customEndDate: "",
    country: "",
    city: "",
    ip: "",
    path: "",
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedTraces, setSelectedTraces] = useState<string[]>([]);

  const allTraces = [
    {
      id: "req-success-001",
      method: "POST",
      path: "/api/auth/login",
      status: 200,
      latency: 45.2,
      timestamp: "2026-01-23T10:30:15Z",
      timestampDisplay: "10:30:15",
      errorMessage: null,
      clientIp: "192.168.1.100",
      country: "United States",
      city: "Miami, FL",
      userAgent: "Mobile-App/2.1.0",
    },
    {
      id: "req-def-456",
      method: "POST",
      path: "/api/auth",
      status: 401,
      latency: 4.0,
      timestamp: "2026-01-23T10:30:20Z",
      timestampDisplay: "10:30:20",
      errorMessage: "JWT token expired",
      clientIp: "203.0.113.45",
      country: "Mexico",
      city: "Ciudad de México",
      userAgent: "Chrome/120.0",
    },
    {
      id: "req-partial-789",
      method: "GET",
      path: "/api/users/profile",
      status: 503,
      latency: 102.5,
      timestamp: "2026-01-23T10:29:15Z",
      timestampDisplay: "10:29:15",
      errorMessage: "Service unavailable after 2 retries",
      clientIp: "198.18.0.156",
      country: "Colombia",
      city: "Bogotá",
      userAgent: "Firefox/121.0",
    },
    {
      id: "req-video-content",
      method: "GET",
      path: "/api/content/video/12345",
      status: 200,
      latency: 125.8,
      timestamp: "2026-01-23T11:15:30Z",
      timestampDisplay: "11:15:30",
      errorMessage: null,
      clientIp: "198.51.100.23",
      country: "United States",
      city: "Los Angeles, CA",
      userAgent: "Safari/605.1.15",
    },
    {
      id: "req-ratelimit-666",
      method: "POST",
      path: "/api/analytics/events",
      status: 429,
      latency: 1.2,
      timestamp: "2026-01-23T05:27:50Z",
      timestampDisplay: "5:27:50 a.m.",
      errorMessage: "Too Many Requests",
      clientIp: "192.0.2.89",
      country: "Puerto Rico",
      city: "San Juan",
      userAgent: "UnivisionApp/3.0.5",
    },
  ];

  const filteredTraces = useMemo(() => {
    return allTraces.filter((trace) => {
      if (filters.method && !trace.method.toLowerCase().includes(filters.method.toLowerCase())) return false;
      if (filters.statusCode && !trace.status.toString().includes(filters.statusCode)) return false;
      if (filters.minLatency && trace.latency < parseFloat(filters.minLatency)) return false;
      if (filters.maxLatency && trace.latency > parseFloat(filters.maxLatency)) return false;

      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matches =
          trace.path.toLowerCase().includes(query) ||
          trace.id.toLowerCase().includes(query) ||
          trace.clientIp.includes(query) ||
          trace.country.toLowerCase().includes(query) ||
          trace.city.toLowerCase().includes(query) ||
          (trace.errorMessage?.toLowerCase().includes(query) || false);
        if (!matches) return false;
      }

      if (filters.country && !trace.country.toLowerCase().includes(filters.country.toLowerCase())) return false;
      if (filters.city && !trace.city.toLowerCase().includes(filters.city.toLowerCase())) return false;
      if (filters.ip && !trace.clientIp.includes(filters.ip)) return false;
      if (filters.path && !trace.path.toLowerCase().includes(filters.path.toLowerCase())) return false;

      if (filters.timeFilter !== "all") {
        const now = new Date("2026-01-23T12:00:00Z");
        const traceTime = new Date(trace.timestamp);
        const diffMinutes = (now.getTime() - traceTime.getTime()) / (1000 * 60);
        if (filters.timeFilter === "1h" && diffMinutes > 60) return false;
        if (filters.timeFilter === "6h" && diffMinutes > 360) return false;
        if (filters.timeFilter === "24h" && diffMinutes > 1440) return false;
        if (filters.timeFilter === "7d" && diffMinutes > 10080) return false;
      }

      return true;
    });
  }, [filters]);

  const handleExport = () => {
    const dataStr = JSON.stringify(filteredTraces, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    const link = document.createElement("a");
    link.setAttribute("href", dataUri);
    link.setAttribute("download", `traces-${Date.now()}.json`);
    link.click();
  };

  const toggleTraceSelection = (id: string) => {
    setSelectedTraces((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const timeOptions: { key: TimeFilter; label: string }[] = [
    { key: "all", label: "Todo" },
    { key: "1h", label: "1h" },
    { key: "6h", label: "6h" },
    { key: "24h", label: "24h" },
    { key: "7d", label: "7d" },
  ];

  const inputClass = "input-base w-full";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";

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
                <h1 className="text-lg font-semibold text-foreground">Request History</h1>
                <p className="text-xs text-muted-foreground">Ver y analizar todos los requests del gateway</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedTraces.length >= 2 && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={() => {
                    window.location.href = `/compare?ids=${selectedTraces.join(",")}`;
                  }}
                  className="btn-primary flex items-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  Comparar {selectedTraces.length}
                </motion.button>
              )}
              <button
                onClick={handleExport}
                className="btn-secondary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <div className="px-3 py-1.5 rounded-lg border border-border bg-background text-sm">
                <span className="text-muted-foreground">Total:</span>
                <span className="ml-1.5 font-semibold text-foreground">{filteredTraces.length}</span>
                <span className="text-muted-foreground ml-1">/ {allTraces.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-4">

        {/* Time filters */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2"
        >
          <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex gap-1.5">
            {timeOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilters({ ...filters, timeFilter: key })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filters.timeFilter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="relative"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por path, ID, IP, país, ciudad o mensaje de error..."
            className="input-base w-full pl-11 py-3 text-base"
            value={filters.searchQuery}
            onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
          />
        </motion.div>

        {/* Advanced Filters Toggle */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="w-full bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filtros avanzados</span>
          </div>
          <motion.div animate={{ rotate: showAdvancedFilters ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </motion.div>
        </motion.button>

        {/* Advanced Filters Panel */}
        <AnimatePresence>
          {showAdvancedFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="bg-card border border-border rounded-xl p-5 space-y-4 overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Method</label>
                  <input
                    type="text"
                    placeholder="GET, POST, etc."
                    className={inputClass}
                    value={filters.method}
                    onChange={(e) => setFilters({ ...filters, method: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Status Code</label>
                  <input
                    type="text"
                    placeholder="200, 404, 500..."
                    className={inputClass}
                    value={filters.statusCode}
                    onChange={(e) => setFilters({ ...filters, statusCode: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Path</label>
                  <input
                    type="text"
                    placeholder="/api/..."
                    className={inputClass}
                    value={filters.path}
                    onChange={(e) => setFilters({ ...filters, path: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Latencia mínima (ms)</label>
                  <input
                    type="number"
                    placeholder="0"
                    className={inputClass}
                    value={filters.minLatency}
                    onChange={(e) => setFilters({ ...filters, minLatency: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass}>Latencia máxima (ms)</label>
                  <input
                    type="number"
                    placeholder="1000"
                    className={inputClass}
                    value={filters.maxLatency}
                    onChange={(e) => setFilters({ ...filters, maxLatency: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass + " flex items-center gap-1.5"}>
                    <MapPin className="w-3.5 h-3.5" /> País
                  </label>
                  <input
                    type="text"
                    placeholder="United States, Mexico..."
                    className={inputClass}
                    value={filters.country}
                    onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass + " flex items-center gap-1.5"}>
                    <Globe className="w-3.5 h-3.5" /> Ciudad
                  </label>
                  <input
                    type="text"
                    placeholder="Miami, Bogotá..."
                    className={inputClass}
                    value={filters.city}
                    onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelClass + " flex items-center gap-1.5"}>
                    <Server className="w-3.5 h-3.5" /> Client IP
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.1.100"
                    className={inputClass}
                    value={filters.ip}
                    onChange={(e) => setFilters({ ...filters, ip: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() =>
                    setFilters({
                      method: "", statusCode: "", minLatency: "", maxLatency: "",
                      searchQuery: "", timeFilter: "all", customStartDate: "",
                      customEndDate: "", country: "", city: "", ip: "", path: "",
                    })
                  }
                  className="btn-ghost flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Limpiar filtros
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Traces list */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="space-y-3"
        >
          {filteredTraces.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <Search className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Sin resultados</h3>
              <p className="text-muted-foreground">Ajusta los filtros o la búsqueda</p>
            </div>
          ) : (
            filteredTraces.map((trace, index) => (
              <TraceCard
                key={trace.id}
                trace={trace}
                index={index}
                isSelected={selectedTraces.includes(trace.id)}
                onToggleSelect={() => toggleTraceSelection(trace.id)}
              />
            ))
          )}
        </motion.div>
      </main>
    </div>
  );
}

function TraceCard({
  trace,
  index,
  isSelected,
  onToggleSelect,
}: {
  trace: any;
  index: number;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const isError = trace.status >= 400;
  const isSlowLatency = trace.latency > 100;

  const methodColors: Record<string, string> = {
    GET: "method-get",
    POST: "method-post",
    PUT: "method-put",
    DELETE: "method-delete",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all relative"
    >
      {/* Checkbox de selección */}
      <div
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        className="absolute top-4 right-4 cursor-pointer"
      >
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          isSelected
            ? "bg-primary border-primary"
            : "border-border hover:border-primary"
        }`}>
          {isSelected && <CheckCircle className="w-3 h-3 text-primary-foreground" />}
        </div>
      </div>

      <Link href={`/flow/${trace.id}`}>
        <div className="cursor-pointer pr-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 space-y-2 min-w-0">
              {/* Request info */}
              <div className="flex items-center gap-3 flex-wrap">
                <code className="text-primary font-mono text-sm">{trace.id}</code>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${methodColors[trace.method] || "badge-neutral"}`}>
                  {trace.method}
                </span>
                <span className="text-foreground font-medium text-sm truncate">{trace.path}</span>
              </div>

              {/* Client info */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  <span className="font-mono text-xs">{trace.clientIp}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="text-xs">{trace.city}, {trace.country}</span>
                </div>
                <span className="text-xs truncate max-w-xs">{trace.userAgent}</span>
              </div>

              {/* Error message */}
              {trace.errorMessage && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg badge-error text-sm">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{trace.errorMessage}</span>
                </div>
              )}
            </div>

            {/* Métricas */}
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Status</div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold ${
                  isError ? "badge-error" : "badge-success"
                }`}>
                  {isError ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  {trace.status}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Latency</div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-semibold ${
                  isSlowLatency ? "badge-warning" : "badge-info"
                }`}>
                  <Zap className="w-3.5 h-3.5" />
                  {trace.latency}ms
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-1">Time</div>
                <div className="flex items-center gap-1.5 text-sm text-foreground">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-mono">{trace.timestampDisplay}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
