"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, Search, AlertCircle, CheckCircle, Clock, Zap, ArrowLeft, Calendar, Globe, MapPin, Server, RefreshCw, Download, TrendingUp, X } from "lucide-react";
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

  // Enhanced traces with client info
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
      userAgent: "Mobile-App/2.1.0"
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
      userAgent: "Chrome/120.0"
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
      userAgent: "Firefox/121.0"
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
      userAgent: "Safari/605.1.15"
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
      userAgent: "UnivisionApp/3.0.5"
    },
  ];

  // Filter logic
  const filteredTraces = useMemo(() => {
    return allTraces.filter(trace => {
      // Method filter
      if (filters.method && !trace.method.toLowerCase().includes(filters.method.toLowerCase())) {
        return false;
      }
      
      // Status code filter
      if (filters.statusCode && !trace.status.toString().includes(filters.statusCode)) {
        return false;
      }
      
      // Latency filters
      if (filters.minLatency && trace.latency < parseFloat(filters.minLatency)) {
        return false;
      }
      if (filters.maxLatency && trace.latency > parseFloat(filters.maxLatency)) {
        return false;
      }

      // Search query (searches across multiple fields)
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

      // Country filter
      if (filters.country && !trace.country.toLowerCase().includes(filters.country.toLowerCase())) {
        return false;
      }

      // City filter
      if (filters.city && !trace.city.toLowerCase().includes(filters.city.toLowerCase())) {
        return false;
      }

      // IP filter
      if (filters.ip && !trace.clientIp.includes(filters.ip)) {
        return false;
      }

      // Path filter
      if (filters.path && !trace.path.toLowerCase().includes(filters.path.toLowerCase())) {
        return false;
      }

      // Time filter
      if (filters.timeFilter !== "all") {
        const now = new Date("2026-01-23T12:00:00Z"); // Mock current time
        const traceTime = new Date(trace.timestamp);
        const diffMs = now.getTime() - traceTime.getTime();
        const diffMinutes = diffMs / (1000 * 60);
        
        switch (filters.timeFilter) {
          case "1h":
            if (diffMinutes > 60) return false;
            break;
          case "6h":
            if (diffMinutes > 360) return false;
            break;
          case "24h":
            if (diffMinutes > 1440) return false;
            break;
          case "7d":
            if (diffMinutes > 10080) return false;
            break;
          case "custom":
            // Custom date range logic
            break;
        }
      }

      return true;
    });
  }, [filters, allTraces]);

  const handleCompareSelected = () => {
    if (selectedTraces.length >= 2) {
      // Navigate to comparison page
      const ids = selectedTraces.join(",");
      window.location.href = `/compare?ids=${ids}`;
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(filteredTraces, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    const exportFileDefaultName = `traces-${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const toggleTraceSelection = (id: string) => {
    setSelectedTraces(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen">
      {/* Animated Header */}
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="border-b border-white/10 glass-strong backdrop-blur-xl sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <motion.button 
                  whileHover={{ scale: 1.1, x: -5 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl glass hover:glass-strong flex items-center justify-center glow-cyan"
                >
                  <ArrowLeft className="w-5 h-5 text-cyan-400" />
                </motion.button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold gradient-text">Request History</h1>
                <p className="text-sm text-purple-300/60">View and analyze all gateway requests</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {selectedTraces.length > 0 && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={handleCompareSelected}
                  disabled={selectedTraces.length < 2}
                  className="px-4 py-2 rounded-lg glass-strong text-sm font-semibold text-cyan-400 hover:glow-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  Compare {selectedTraces.length} Selected
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleExport}
                className="px-4 py-2 rounded-lg glass hover:glass-strong text-sm font-semibold flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export
              </motion.button>
              <div className="px-4 py-2 rounded-lg glass text-sm">
                <span className="text-gray-400">Total:</span>
                <span className="ml-2 text-cyan-400 font-bold">{filteredTraces.length}</span>
                <span className="text-gray-500 ml-1">/ {allTraces.length}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Quick Time Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="flex items-center gap-3"
        >
          <Clock className="w-5 h-5 text-purple-400" />
          <div className="flex gap-2">
            {(["all", "1h", "6h", "24h", "7d"] as TimeFilter[]).map((timeOpt) => (
              <motion.button
                key={timeOpt}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setFilters({ ...filters, timeFilter: timeOpt })}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  filters.timeFilter === timeOpt
                    ? 'glass-strong border-2 border-cyan-400 text-cyan-400 glow-cyan'
                    : 'glass hover:glass-strong text-gray-400'
                }`}
              >
                {timeOpt === "all" ? "All Time" : 
                 timeOpt === "1h" ? "Last Hour" :
                 timeOpt === "6h" ? "Last 6 Hours" :
                 timeOpt === "24h" ? "Last 24 Hours" : "Last 7 Days"}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* Global Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass-strong rounded-2xl p-6 glow"
        >
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
            <input
              type="text"
              placeholder="Search by path, ID, IP, country, city, or error message..."
              className="w-full bg-white/5 border-2 border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all text-lg"
              value={filters.searchQuery}
              onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
            />
          </div>
        </motion.div>

        {/* Advanced Filters Toggle */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="w-full glass-strong rounded-xl p-4 flex items-center justify-between hover:border-purple-400/50 transition-all"
        >
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-purple-400" />
            <span className="font-semibold gradient-text">Advanced Filters</span>
          </div>
          <motion.div
            animate={{ rotate: showAdvancedFilters ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <X className="w-5 h-5 text-gray-400" />
          </motion.div>
        </motion.button>

        {/* Advanced Filters */}
        <AnimatePresence>
          {showAdvancedFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="glass-strong rounded-2xl p-6 space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">Method</label>
                  <input
                    type="text"
                    placeholder="GET, POST, etc."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    value={filters.method}
                    onChange={(e) => setFilters({ ...filters, method: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">Status Code</label>
                  <input
                    type="text"
                    placeholder="200, 404, 500, etc."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    value={filters.statusCode}
                    onChange={(e) => setFilters({ ...filters, statusCode: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">Path</label>
                  <input
                    type="text"
                    placeholder="/api/..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    value={filters.path}
                    onChange={(e) => setFilters({ ...filters, path: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">Min Latency (ms)</label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    value={filters.minLatency}
                    onChange={(e) => setFilters({ ...filters, minLatency: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2">Max Latency (ms)</label>
                  <input
                    type="number"
                    placeholder="1000"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    value={filters.maxLatency}
                    onChange={(e) => setFilters({ ...filters, maxLatency: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Country
                  </label>
                  <input
                    type="text"
                    placeholder="United States, Mexico, etc."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    value={filters.country}
                    onChange={(e) => setFilters({ ...filters, country: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    City
                  </label>
                  <input
                    type="text"
                    placeholder="Miami, Ciudad de México, etc."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    value={filters.city}
                    onChange={(e) => setFilters({ ...filters, city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-purple-300 mb-2 flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    Client IP
                  </label>
                  <input
                    type="text"
                    placeholder="192.168.1.100"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                    value={filters.ip}
                    onChange={(e) => setFilters({ ...filters, ip: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFilters({
                    method: "",
                    statusCode: "",
                    minLatency: "",
                    maxLatency: "",
                    searchQuery: "",
                    timeFilter: "all",
                    customStartDate: "",
                    customEndDate: "",
                    country: "",
                    city: "",
                    ip: "",
                    path: "",
                  })}
                  className="px-5 py-2 rounded-lg glass hover:glass-strong text-sm font-semibold flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Clear All
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Traces Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-4"
        >
          {filteredTraces.length === 0 ? (
            <div className="glass-strong rounded-xl p-12 text-center">
              <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-400 mb-2">No traces found</h3>
              <p className="text-gray-500">Try adjusting your filters or search query</p>
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

function TraceCard({ trace, index, isSelected, onToggleSelect }: { 
  trace: any; 
  index: number;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const isError = trace.status >= 400;
  const isSlowLatency = trace.latency > 100;

  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="glass-strong rounded-xl p-6 border border-white/10 hover:border-purple-400/50 transition-all relative"
    >
      {/* Selection Checkbox */}
      <motion.div
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
        className="absolute top-4 right-4 cursor-pointer"
      >
        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
          isSelected 
            ? 'bg-cyan-400 border-cyan-400' 
            : 'border-gray-600 hover:border-cyan-400'
        }`}>
          {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
        </div>
      </motion.div>

      <Link href={`/flow/${trace.id}`}>
        <motion.div
          whileHover={{ scale: 1.01, y: -2 }}
          className={`cursor-pointer ${isError ? 'hover:glow-red' : 'hover:glow-cyan'}`}
        >
          <div className="flex items-start justify-between pr-10">
            <div className="flex-1 space-y-3">
              {/* Request Info */}
              <div className="flex items-center gap-4 flex-wrap">
                <code className="text-cyan-400 font-mono text-sm">{trace.id}</code>
                <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                  trace.method === 'GET' ? 'bg-blue-500/20 text-blue-300' :
                  trace.method === 'POST' ? 'bg-green-500/20 text-green-300' :
                  trace.method === 'PUT' ? 'bg-yellow-500/20 text-yellow-300' :
                  'bg-red-500/20 text-red-300'
                }`}>
                  {trace.method}
                </span>
                <span className="text-gray-300 font-medium">{trace.path}</span>
              </div>
              
              {/* Client Info */}
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-purple-400" />
                  <span className="font-mono">{trace.clientIp}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-pink-400" />
                  <span>{trace.city}, {trace.country}</span>
                </div>
                <div className="text-gray-500 truncate max-w-xs">
                  {trace.userAgent}
                </div>
              </div>

              {trace.errorMessage && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-red-300 text-sm">{trace.errorMessage}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-xs text-gray-400 mb-1">Status</div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 ${
                  isError ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-green-500/20 text-green-300 border-green-500/30'
                }`}>
                  {isError ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  <span className="font-bold">{trace.status}</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-400 mb-1">Latency</div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 ${
                  isSlowLatency ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                }`}>
                  <Zap className="w-4 h-4" />
                  <span className="font-bold">{trace.latency}ms</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-400 mb-1">Time</div>
                <div className="flex items-center gap-2 text-cyan-400">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono text-sm">{trace.timestampDisplay}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
