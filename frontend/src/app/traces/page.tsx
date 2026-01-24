"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Filter, Search, AlertCircle, CheckCircle, Clock, Zap, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function TracesPage() {
  const [filters, setFilters] = useState({
    method: "",
    statusCode: "",
    minLatency: "",
    maxLatency: "",
  });

  const traces = [
    { id: "req-abc-123", method: "GET", path: "/api/users", status: 200, latency: 45, timestamp: "10:30:15", errorMessage: null },
    { id: "req-def-456", method: "POST", path: "/api/auth", status: 401, latency: 12, timestamp: "10:30:20", errorMessage: "Token expired" },
    { id: "req-ghi-789", method: "GET", path: "/api/products", status: 200, latency: 128, timestamp: "10:30:25", errorMessage: null },
    { id: "req-jkl-012", method: "PUT", path: "/api/users/123", status: 503, latency: 5000, timestamp: "10:30:30", errorMessage: "Circuit breaker open" },
    { id: "req-mno-345", method: "DELETE", path: "/api/users/456", status: 200, latency: 67, timestamp: "10:30:35", errorMessage: null },
    { id: "req-pqr-678", method: "GET", path: "/api/orders", status: 500, latency: 2340, timestamp: "10:30:40", errorMessage: "Internal server error" },
  ];

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
                <h1 className="text-3xl font-bold gradient-text">Request Traces</h1>
                <p className="text-sm text-purple-300/60">Deep dive into every request</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-lg glass text-sm">
                <span className="text-gray-400">Total:</span>
                <span className="ml-2 text-cyan-400 font-bold">{traces.length}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Advanced Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass-strong rounded-2xl p-6 glow"
        >
          <div className="flex items-center gap-3 mb-5">
            <Filter className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold gradient-text">Advanced Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Method"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                value={filters.method}
                onChange={(e) => setFilters({ ...filters, method: e.target.value })}
              />
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Status Code"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                value={filters.statusCode}
                onChange={(e) => setFilters({ ...filters, statusCode: e.target.value })}
              />
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Min Latency (ms)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                value={filters.minLatency}
                onChange={(e) => setFilters({ ...filters, minLatency: e.target.value })}
              />
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Max Latency (ms)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                value={filters.maxLatency}
                onChange={(e) => setFilters({ ...filters, maxLatency: e.target.value })}
              />
            </div>
          </div>
        </motion.div>

        {/* Traces Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-4"
        >
          {traces.map((trace, index) => (
            <TraceCard key={trace.id} trace={trace} index={index} />
          ))}
        </motion.div>
      </main>
    </div>
  );
}

function TraceCard({ trace, index }: { trace: any; index: number }) {
  const isError = trace.status >= 400;
  const isSlowLatency = trace.latency > 1000;

  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -5 }}
      className={`glass-strong rounded-xl p-6 border border-white/10 hover:border-purple-400/50 transition-all cursor-pointer ${
        isError ? 'glow-red' : 'hover:glow-cyan'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-4">
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
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              isError ? 'bg-red-500/20 text-red-300 glow-red' : 'bg-green-500/20 text-green-300'
            }`}>
              {isError ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              <span className="font-bold">{trace.status}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1">Latency</div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
              isSlowLatency ? 'bg-orange-500/20 text-orange-300' : 'bg-purple-500/20 text-purple-300'
            }`}>
              <Zap className="w-4 h-4" />
              <span className="font-bold">{trace.latency}ms</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1">Time</div>
            <div className="flex items-center gap-2 text-cyan-400">
              <Clock className="w-4 h-4" />
              <span className="font-mono text-sm">{trace.timestamp}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
