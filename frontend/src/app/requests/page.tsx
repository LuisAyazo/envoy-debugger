"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { 
  ArrowLeft, Search, Filter, CheckCircle, XCircle, AlertTriangle, 
  Clock, GitBranch, Eye, Zap, TrendingUp, Activity, Network
} from "lucide-react";
import Link from "next/link";

export default function RequestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const requests = [
    {
      id: "req-success-001",
      method: "POST",
      path: "/api/auth/login",
      status: 200,
      statusText: "Success",
      duration: 45.2,
      timestamp: "2026-01-23T10:30:20.045Z",
      traceId: "trace-abc-123",
      sourceService: "mobile-app",
      targetService: "auth-service",
      protocol: "HTTP/2.0",
      totalSteps: 8,
      passedSteps: 8,
      failedSteps: 0,
      envoyResources: {
        httpRoute: "auth-route",
        backend: "auth-backend",
        backendTrafficPolicy: "auth-traffic-policy"
      }
    },
    {
      id: "req-def-456",
      method: "POST",
      path: "/api/auth",
      status: 401,
      statusText: "Unauthorized",
      duration: 4.0,
      timestamp: "2026-01-23T10:30:20.045Z",
      traceId: "abc123def456",
      sourceService: "mobile-app",
      targetService: "auth-service",
      protocol: "HTTP/2.0",
      totalSteps: 5,
      passedSteps: 2,
      failedSteps: 1,
      envoyResources: {
        httpRoute: "auth-route",
        backend: "auth-backend",
        backendTrafficPolicy: "auth-traffic-policy"
      }
    },
    {
      id: "req-partial-789",
      method: "GET",
      path: "/api/users/profile",
      status: 503,
      statusText: "Service Unavailable",
      duration: 102.5,
      timestamp: "2026-01-23T10:29:15.123Z",
      traceId: "trace-xyz-789",
      sourceService: "web-app",
      targetService: "user-service",
      protocol: "HTTP/1.1",
      totalSteps: 7,
      passedSteps: 4,
      failedSteps: 1,
      envoyResources: {
        httpRoute: "user-profile-route",
        backend: "user-backend",
        backendTrafficPolicy: "user-traffic-policy",
        retryPolicy: "user-retry-policy"
      }
    },
    {
      id: "req-timeout-321",
      method: "POST",
      path: "/api/payments/process",
      status: 504,
      statusText: "Gateway Timeout",
      duration: 5000.0,
      timestamp: "2026-01-23T10:28:45.567Z",
      traceId: "trace-timeout-321",
      sourceService: "payment-app",
      targetService: "payment-service",
      protocol: "HTTP/2.0",
      totalSteps: 6,
      passedSteps: 5,
      failedSteps: 1,
      envoyResources: {
        httpRoute: "payment-route",
        backend: "payment-backend",
        backendTrafficPolicy: "payment-traffic-policy",
        timeoutPolicy: "payment-timeout-5s"
      }
    },
    {
      id: "req-complete-555",
      method: "GET",
      path: "/api/content/videos/123",
      status: 200,
      statusText: "Success",
      duration: 23.8,
      timestamp: "2026-01-23T10:28:30.890Z",
      traceId: "trace-content-555",
      sourceService: "streaming-app",
      targetService: "content-service",
      protocol: "HTTP/2.0",
      totalSteps: 10,
      passedSteps: 10,
      failedSteps: 0,
      envoyResources: {
        httpRoute: "content-route",
        backend: "content-backend",
        backendTrafficPolicy: "content-traffic-policy",
        corsPolicy: "content-cors",
        rateLimitPolicy: "content-ratelimit"
      }
    },
    {
      id: "req-ratelimit-666",
      method: "POST",
      path: "/api/analytics/events",
      status: 429,
      statusText: "Too Many Requests",
      duration: 1.2,
      timestamp: "2026-01-23T10:27:50.234Z",
      traceId: "trace-analytics-666",
      sourceService: "analytics-app",
      targetService: "analytics-service",
      protocol: "HTTP/1.1",
      totalSteps: 4,
      passedSteps: 2,
      failedSteps: 1,
      envoyResources: {
        httpRoute: "analytics-route",
        backend: "analytics-backend",
        rateLimitPolicy: "analytics-ratelimit-100rpm"
      }
    }
  ];

  const filteredRequests = requests.filter(req => {
    const matchesSearch = req.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         req.method.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         req.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || 
                         (statusFilter === "success" && req.status >= 200 && req.status < 300) ||
                         (statusFilter === "error" && (req.status >= 400 || req.failedSteps > 0)) ||
                         (statusFilter === "timeout" && req.status === 504);
    
    return matchesSearch && matchesStatus;
  });

  function getStatusIcon(status: number) {
    if (status >= 200 && status < 300) return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (status >= 400 && status < 500) return <XCircle className="w-5 h-5 text-red-400" />;
    if (status >= 500) return <AlertTriangle className="w-5 h-5 text-orange-400" />;
    return <Activity className="w-5 h-5 text-blue-400" />;
  }

  function getStatusColor(status: number) {
    if (status >= 200 && status < 300) return "text-green-400 bg-green-500/10 border-green-500/20";
    if (status >= 400 && status < 500) return "text-red-400 bg-red-500/10 border-red-500/20";
    if (status >= 500) return "text-orange-400 bg-orange-500/10 border-orange-500/20";
    return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  }

  function getGlowClass(status: number) {
    if (status >= 200 && status < 300) return "glow-green";
    if (status >= 400) return "glow-red";
    return "";
  }

  return (
    <div className="min-h-screen">
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
                <h1 className="text-3xl font-bold gradient-text">Request History</h1>
                <p className="text-sm text-purple-300/60">View and analyze all gateway requests</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-lg glass-strong text-sm">
                <span className="text-gray-400">Total: </span>
                <span className="text-cyan-400 font-bold">{filteredRequests.length}</span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-2xl p-6"
        >
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[300px]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by path, method, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setStatusFilter("all")}
                className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                  statusFilter === "all" 
                    ? "glass-strong border-2 border-cyan-400 text-white glow-cyan" 
                    : "glass text-gray-400 hover:text-white"
                }`}
              >
                All
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setStatusFilter("success")}
                className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                  statusFilter === "success" 
                    ? "glass-strong border-2 border-green-400 text-white" 
                    : "glass text-gray-400 hover:text-white"
                }`}
              >
                Success
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setStatusFilter("error")}
                className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                  statusFilter === "error" 
                    ? "glass-strong border-2 border-red-400 text-white" 
                    : "glass text-gray-400 hover:text-white"
                }`}
              >
                Errors
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setStatusFilter("timeout")}
                className={`px-4 py-3 rounded-xl font-semibold transition-all ${
                  statusFilter === "timeout" 
                    ? "glass-strong border-2 border-orange-400 text-white" 
                    : "glass text-gray-400 hover:text-white"
                }`}
              >
                Timeouts
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Requests List */}
        <div className="space-y-4">
          {filteredRequests.map((req, idx) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Link href={`/flow/${req.id}`}>
                <motion.div
                  whileHover={{ scale: 1.02, x: 10 }}
                  className={`glass-strong rounded-2xl p-6 cursor-pointer border-l-4 ${
                    req.status >= 200 && req.status < 300 ? "border-green-500/50" :
                    req.status >= 400 ? "border-red-500/50 glow-red" :
                    "border-orange-500/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-6">
                    {/* Left: Status & Method */}
                    <div className="flex items-center gap-4">
                      <motion.div
                        whileHover={{ scale: 1.2, rotate: 360 }}
                        transition={{ duration: 0.3 }}
                      >
                        {getStatusIcon(req.status)}
                      </motion.div>
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-lg font-bold text-sm ${
                            req.method === "GET" ? "bg-blue-500/20 text-blue-300" :
                            req.method === "POST" ? "bg-green-500/20 text-green-300" :
                            req.method === "PUT" ? "bg-yellow-500/20 text-yellow-300" :
                            "bg-purple-500/20 text-purple-300"
                          }`}>
                            {req.method}
                          </span>
                          <code className="text-lg font-semibold text-white">{req.path}</code>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-400">
                          <div className="flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            <span>ID: {req.id}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(req.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Network className="w-3 h-3" />
                            <span>{req.protocol}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Stats */}
                    <div className="flex gap-6">
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${getStatusColor(req.status)}`}>
                          {req.status}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{req.statusText}</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          req.duration < 50 ? "text-green-400" :
                          req.duration < 200 ? "text-yellow-400" :
                          "text-red-400"
                        }`}>
                          {req.duration}ms
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Duration</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-400">
                          {req.passedSteps}/{req.totalSteps}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Steps</div>
                      </div>
                    </div>

                    {/* Right: Envoy Resources */}
                    <div className="glass rounded-xl p-4 min-w-[200px]">
                      <div className="text-xs font-semibold text-cyan-400 mb-2 flex items-center gap-2">
                        <GitBranch className="w-3 h-3" />
                        Envoy Resources
                      </div>
                      <div className="space-y-1 text-xs text-gray-300">
                        <div>🔀 {req.envoyResources.httpRoute}</div>
                        <div>🎯 {req.envoyResources.backend}</div>
                        {Object.keys(req.envoyResources).length > 2 && (
                          <div className="text-purple-400">+{Object.keys(req.envoyResources).length - 2} more</div>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center">
                      <Eye className="w-6 h-6 text-cyan-400" />
                    </div>
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          ))}
        </div>

        {filteredRequests.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-2xl p-12 text-center"
          >
            <Search className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-400 mb-2">No requests found</h3>
            <p className="text-gray-500">Try adjusting your search or filters</p>
          </motion.div>
        )}
      </main>
    </div>
  );
}
