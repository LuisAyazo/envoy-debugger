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

  // Colores para los charts — compatibles con ambos temas
  const chartColors = {
    p50: "#3b82f6",
    p95: "#f59e0b",
    p99: "#ef4444",
    rps: "#10b981",
    error: "#ef4444",
    grid: "hsl(215 16% 88%)",
    axis: "hsl(215 14% 48%)",
    tooltip: {
      bg: "hsl(0 0% 100%)",
      border: "hsl(215 16% 88%)",
    },
  };

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
                <h1 className="text-lg font-semibold text-foreground">Performance Metrics</h1>
                <p className="text-xs text-muted-foreground">Análisis de rendimiento en tiempo real</p>
              </div>
            </div>
            <div className="flex gap-1.5">
              {["1h", "6h", "24h", "7d"].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    timeRange === range
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-4 py-6 space-y-6">
        {/* Key Metrics Cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <MetricCard
            icon={<Clock className="w-5 h-5" />}
            title="Avg Latency"
            value="42ms"
            change="-8%"
            color="blue"
          />
          <MetricCard
            icon={<Activity className="w-5 h-5" />}
            title="Throughput"
            value="1.2K RPS"
            change="+15%"
            color="emerald"
          />
          <MetricCard
            icon={<AlertTriangle className="w-5 h-5" />}
            title="Error Rate"
            value="0.23%"
            change="+0.05%"
            color="red"
            isNegative
          />
          <MetricCard
            icon={<Zap className="w-5 h-5" />}
            title="P99 Latency"
            value="135ms"
            change="-12%"
            color="amber"
          />
        </motion.div>

        {/* Latency Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-xl p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <Clock className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Request Latency Distribution</h2>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={latencyData}>
              <defs>
                <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.p50} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={chartColors.p50} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorP95" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.p95} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={chartColors.p95} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorP99" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColors.p99} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={chartColors.p99} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="time" stroke={chartColors.axis} tick={{ fontSize: 12 }} />
              <YAxis stroke={chartColors.axis} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: chartColors.tooltip.bg,
                  border: `1px solid ${chartColors.tooltip.border}`,
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Area type="monotone" dataKey="p50" stroke={chartColors.p50} fillOpacity={1} fill="url(#colorP50)" strokeWidth={2} />
              <Area type="monotone" dataKey="p95" stroke={chartColors.p95} fillOpacity={1} fill="url(#colorP95)" strokeWidth={2} />
              <Area type="monotone" dataKey="p99" stroke={chartColors.p99} fillOpacity={1} fill="url(#colorP99)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-4">
            <LegendItem color="bg-blue-500" label="P50 Median" />
            <LegendItem color="bg-amber-500" label="P95 Percentile" />
            <LegendItem color="bg-red-500" label="P99 Percentile" />
          </div>
        </motion.div>

        {/* Throughput & Errors */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="font-semibold text-foreground">Throughput</h2>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={throughputData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="time" stroke={chartColors.axis} tick={{ fontSize: 12 }} />
                <YAxis stroke={chartColors.axis} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltip.bg,
                    border: `1px solid ${chartColors.tooltip.border}`,
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="rps" fill={chartColors.rps} radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-xl p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <h2 className="font-semibold text-foreground">Error Rate</h2>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={errorData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis dataKey="time" stroke={chartColors.axis} tick={{ fontSize: 12 }} />
                <YAxis stroke={chartColors.axis} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltip.bg,
                    border: `1px solid ${chartColors.tooltip.border}`,
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Line type="monotone" dataKey="rate" stroke={chartColors.error} strokeWidth={2} dot={{ fill: chartColors.error, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  change,
  color,
  isNegative = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  change: string;
  color: "blue" | "emerald" | "red" | "amber";
  isNegative?: boolean;
}) {
  const colorMap = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow"
    >
      <div className={`inline-flex p-2 rounded-lg ${colorMap[color]} mb-3`}>
        {icon}
      </div>
      <div className="text-sm text-muted-foreground mb-1">{title}</div>
      <div className="text-2xl font-bold text-foreground mb-1">{value}</div>
      <div className={`text-xs font-medium ${isNegative ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
        {change} vs última hora
      </div>
    </motion.div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-sm ${color}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
