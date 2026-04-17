"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  Zap,
  AlertTriangle,
  TrendingUp,
  Eye,
  BarChart3,
  FileText,
  GitBranch,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen">
      <main className="max-w-screen-2xl mx-auto px-4 py-10 space-y-8">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center py-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Real-time Observability
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-3">
            Gateway Debugger
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Monitoreo y debugging en tiempo real para el gateway de Univision
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <StatCard
            icon={<Activity className="w-5 h-5" />}
            title="Total Traces"
            value="1,234"
            change="+12%"
            positive={true}
            color="blue"
          />
          <StatCard
            icon={<Zap className="w-5 h-5" />}
            title="Avg Latency"
            value="45ms"
            change="-8%"
            positive={true}
            color="emerald"
          />
          <StatCard
            icon={<AlertTriangle className="w-5 h-5" />}
            title="Error Rate"
            value="0.2%"
            change="+0.1%"
            positive={false}
            color="red"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5" />}
            title="RPS"
            value="1,245"
            change="+5%"
            positive={true}
            color="amber"
          />
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            Acceso rápido
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickActionCard
              href="/traces"
              icon={<Eye className="w-5 h-5" />}
              title="Traces"
              description="Ver todos los request traces"
            />
            <QuickActionCard
              href="/metrics"
              icon={<BarChart3 className="w-5 h-5" />}
              title="Metrics"
              description="Latencia, throughput y errores"
            />
            <QuickActionCard
              href="/logs"
              icon={<FileText className="w-5 h-5" />}
              title="Logs"
              description="Logs de componentes con búsqueda"
            />
            <QuickActionCard
              href="/requests"
              icon={<GitBranch className="w-5 h-5" />}
              title="Requests"
              description="Flujos de requests del gateway"
            />
          </div>
        </motion.div>

        {/* Recent Traces */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-card border border-border rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Traces Recientes</h2>
            </div>
            <Link
              href="/traces"
              className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Ver todos
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left py-3 px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Request ID</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Method</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Path</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Latency</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...Array(5)].map((_, i) => (
                  <TraceRow key={i} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

      </main>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  change,
  positive,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  change: string;
  positive: boolean;
  color: "blue" | "emerald" | "red" | "amber";
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
      className="bg-card border border-border rounded-xl p-5 transition-shadow hover:shadow-md"
    >
      <div className={`inline-flex p-2 rounded-lg ${colorMap[color]} mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-foreground mb-1">{value}</div>
      <div className="text-sm text-muted-foreground mb-2">{title}</div>
      <div className={`text-xs font-medium flex items-center gap-1 ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
        <TrendingUp className={`w-3 h-3 ${!positive && "rotate-180"}`} />
        {change} vs última hora
      </div>
    </motion.div>
  );
}

function QuickActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group"
      >
        <div className="text-primary mb-3 group-hover:scale-110 transition-transform duration-200">
          {icon}
        </div>
        <h3 className="font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </motion.div>
    </Link>
  );
}

function TraceRow({ index }: { index: number }) {
  const traces = [
    { id: "req-success-001", status: "200", method: "POST", path: "/api/auth/login", latency: "45.2ms", error: null },
    { id: "req-video-content", status: "200", method: "GET", path: "/api/content/video/12345", latency: "125.8ms", error: null },
    { id: "req-partial-789", status: "503", method: "GET", path: "/api/users/profile", latency: "102.5ms", error: "Service unavailable" },
    { id: "req-ratelimit-exceeded", status: "429", method: "POST", path: "/api/comments", latency: "3.5ms", error: "Rate limit exceeded" },
    { id: "req-def-456", status: "401", method: "POST", path: "/api/auth", latency: "4.0ms", error: "JWT expired" },
  ];

  const trace = traces[index];
  const isError = ["401", "429", "500", "503"].includes(trace.status);

  const methodColors: Record<string, string> = {
    GET: "method-get",
    POST: "method-post",
    PUT: "method-put",
    DELETE: "method-delete",
  };

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="hover:bg-muted/40 transition-colors"
    >
      <td className="py-3 px-6">
        <Link href={`/flow/${trace.id}`}>
          <code className="text-primary text-xs hover:underline cursor-pointer font-mono">
            {trace.id}
          </code>
        </Link>
      </td>
      <td className="py-3 px-4">
        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${methodColors[trace.method] || "badge-neutral"}`}>
          {trace.method}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground font-mono">{trace.path}</td>
      <td className="py-3 px-4">
        {isError ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold badge-error">
            <AlertTriangle className="w-3 h-3" />
            {trace.status}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold badge-success">
            <CheckCircle2 className="w-3 h-3" />
            {trace.status}
          </span>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-mono ${parseFloat(trace.latency) > 100 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
            {trace.latency}
          </span>
          {parseFloat(trace.latency) > 100 && (
            <Zap className="w-3 h-3 text-amber-500" />
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        {trace.error ? (
          <span className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            {trace.error}
          </span>
        ) : (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">Success</span>
        )}
      </td>
    </motion.tr>
  );
}
