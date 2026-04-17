"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { TrendingUp, Activity, AlertTriangle, Zap, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function MetricsPage() {
  const [timeRange, setTimeRange] = useState("1h");

  const latencyData = [
    { time: "00:00", p50: 30, p95: 60, p99: 120 },
    { time: "04:00", p50: 35, p95: 70, p99: 130 },
    { time: "08:00", p50: 45, p95: 80, p99: 140 },
    { time: "12:00", p50: 40, p95: 75, p99: 135 },
    { time: "16:00", p50: 38, p95: 72, p99: 132 },
    { time: "20:00", p50: 42, p95: 78, p99: 138 },
    { time: "23:59", p50: 35, p95: 65, p99: 125 },
  ];

  const throughputData = [
    { time: "00:00", rps: 500 },
    { time: "04:00", rps: 450 },
    { time: "08:00", rps: 1200 },
    { time: "12:00", rps: 1500 },
    { time: "16:00", rps: 1300 },
    { time: "20:00", rps: 800 },
    { time: "23:59", rps: 600 },
  ];

  const errorData = [
    { time: "00:00", errors: 2, rate: 0.2 },
    { time: "04:00", errors: 1, rate: 0.1 },
    { time: "08:00", errors: 5, rate: 0.3 },
    { time: "12:00", errors: 8, rate: 0.4 },
    { time: "16:00", errors: 3, rate: 0.2 },
    { time: "20:00", errors: 2, rate: 0.15 },
    { time: "23:59", errors: 1, rate: 0.1 },
  ];

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
              <Link href="/">
                <motion.button 
                  whileHover={{ scale: 1.1, x: -5 }}
                  className="w-10 h-10 rounded-xl glass hover:glass-strong flex items-center justify-center glow-cyan"
                >
                  <ArrowLeft className="w-5 h-5 text-cyan-400" />
                </motion.button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold gradient-text">Performance Metrics</h1>
                <p className="text-sm text-purple-300/60">Real-time performance analytics</p>
              </div>
            </div>
            <div className="flex gap-2">
              {["1h", "6h", "24h", "7d"].map((range) => (
                <motion.button
                  key={range}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setTimeRange(range)}
                  className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    timeRange === range
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white glow"
                      : "glass text-gray-300 hover:glass-strong"
                  }`}
                >
                  {range}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-screen-2xl mx-auto px-4 py-8 space-y-6">
        {/* Key Metrics Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6"
        >
          <MetricCard icon={<Clock className="w-6 h-6" />} title="Avg Latency" value="42ms" change="-8%" gradient="from-cyan-500 to-blue-500" />
          <MetricCard icon={<Activity className="w-6 h-6" />} title="Throughput" value="1.2K RPS" change="+15%" gradient="from-purple-500 to-pink-500" />
          <MetricCard icon={<AlertTriangle className="w-6 h-6" />} title="Error Rate" value="0.23%" change="+0.05%" gradient="from-orange-500 to-red-500" isNegative />
          <MetricCard icon={<Zap className="w-6 h-6" />} title="P99 Latency" value="135ms" change="-12%" gradient="from-green-500 to-emerald-500" />
        </motion.div>

        {/* Latency Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-strong rounded-2xl p-8 glow"
        >
          <div className="flex items-center gap-3 mb-6">
            <Clock className="w-6 h-6 text-cyan-400" />
            <h2 className="text-2xl font-bold gradient-text">Request Latency Distribution</h2>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={latencyData}>
              <defs>
                <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorP95" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorP99" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" />
              <YAxis stroke="rgba(255,255,255,0.5)" />
              <Tooltip contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }} />
              <Area type="monotone" dataKey="p50" stroke="#06b6d4" fillOpacity={1} fill="url(#colorP50)" strokeWidth={2} />
              <Area type="monotone" dataKey="p95" stroke="#a855f7" fillOpacity={1} fill="url(#colorP95)" strokeWidth={2} />
              <Area type="monotone" dataKey="p99" stroke="#ec4899" fillOpacity={1} fill="url(#colorP99)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-8 mt-6">
            <LegendItem color="bg-cyan-500" label="P50 Median" />
            <LegendItem color="bg-purple-500" label="P95 Percentile" />
            <LegendItem color="bg-pink-500" label="P99 Percentile" />
          </div>
        </motion.div>

        {/* Throughput & Errors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-strong rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-6 h-6 text-green-400" />
              <h2 className="text-xl font-bold gradient-text">Throughput</h2>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={throughputData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" />
                <YAxis stroke="rgba(255,255,255,0.5)" />
                <Tooltip contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }} />
                <Bar dataKey="rps" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.9}/>
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.6}/>
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-strong rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h2 className="text-xl font-bold gradient-text">Error Rate</h2>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={errorData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" />
                <YAxis stroke="rgba(255,255,255,0.5)" />
                <Tooltip contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }} />
                <Line type="monotone" dataKey="rate" stroke="#ef4444" strokeWidth={3} dot={{ fill: "#ef4444", r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ icon, title, value, change, gradient, isNegative = false }: any) {
  return (
    <motion.div whileHover={{ scale: 1.05, y: -5 }} className="glass-strong rounded-2xl p-6 glow">
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 animate-float`}>
        {icon}
      </div>
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className="text-3xl font-bold text-white mb-2">{value}</div>
      <div className={`text-sm font-medium ${isNegative ? 'text-red-400' : 'text-green-400'}`}>
        {change} from last hour
      </div>
    </motion.div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded ${color}`} />
      <span className="text-sm text-gray-300">{label}</span>
    </div>
  );
}
