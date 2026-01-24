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
  Sparkles,
  Shield,
  Clock,
  CheckCircle2
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Animated Header */}
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, type: "spring" }}
        className="border-b border-white/10 glass-strong backdrop-blur-xl"
      >
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <motion.div 
              className="flex items-center gap-4"
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 flex items-center justify-center glow animate-pulse-slow">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold gradient-text">Gateway Debugger</h1>
                <p className="text-sm text-purple-300/80">Univision Real-time Observability</p>
              </div>
            </motion.div>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg glass glow-green">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-300 font-medium">All Systems Operational</span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Navigation */}
      <motion.nav 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="border-b border-white/5 glass"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            <NavLink href="/traces" icon={<Eye className="w-4 h-4" />} label="Traces" />
            <NavLink href="/metrics" icon={<BarChart3 className="w-4 h-4" />} label="Metrics" />
            <NavLink href="/logs" icon={<FileText className="w-4 h-4" />} label="Logs" />
            <NavLink href="/requests" icon={<GitBranch className="w-4 h-4" />} label="Requests" />
          </div>
        </div>
      </motion.nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Hero Stats */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6"
        >
          <StatCard
            icon={<Activity className="w-6 h-6" />}
            title="Total Traces"
            value="1,234"
            change="+12%"
            changePositive={true}
            gradient="from-cyan-500 to-blue-500"
            delay={0}
          />
          <StatCard
            icon={<Zap className="w-6 h-6" />}
            title="Avg Latency"
            value="45ms"
            change="-8%"
            changePositive={true}
            gradient="from-purple-500 to-pink-500"
            delay={0.1}
          />
          <StatCard
            icon={<AlertTriangle className="w-6 h-6" />}
            title="Error Rate"
            value="0.2%"
            change="+0.1%"
            changePositive={false}
            gradient="from-orange-500 to-red-500"
            delay={0.2}
          />
          <StatCard
            icon={<TrendingUp className="w-6 h-6" />}
            title="RPS"
            value="1,245"
            change="+5%"
            changePositive={true}
            gradient="from-green-500 to-emerald-500"
            delay={0.3}
          />
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="glass-strong rounded-2xl p-8 glow"
        >
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold gradient-text">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <QuickActionCard
              href="/traces"
              icon={<Eye className="w-8 h-8" />}
              title="View Traces"
              description="See all request traces"
              gradient="from-cyan-500/20 to-blue-500/20"
            />
            <QuickActionCard
              href="/metrics"
              icon={<BarChart3 className="w-8 h-8" />}
              title="Performance Metrics"
              description="Latency, throughput, errors"
              gradient="from-purple-500/20 to-pink-500/20"
            />
            <QuickActionCard
              href="/logs"
              icon={<FileText className="w-8 h-8" />}
              title="View Logs"
              description="Component logs with search"
              gradient="from-orange-500/20 to-red-500/20"
            />
            <QuickActionCard
              href="/requests"
              icon={<GitBranch className="w-8 h-8" />}
              title="Request Flows"
              description="View all gateway requests"
              gradient="from-green-500/20 to-emerald-500/20"
            />
          </div>
        </motion.div>

        {/* Recent Traces */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="glass-strong rounded-2xl p-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-cyan-400" />
              <h2 className="text-2xl font-bold gradient-text">Recent Traces</h2>
            </div>
            <Link href="/traces" className="text-purple-400 hover:text-purple-300 text-sm font-medium hover:underline">
              View All →
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-purple-300">Request ID</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-purple-300">Method</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-purple-300">Path</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-purple-300">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-purple-300">Latency</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-purple-300">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
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

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 px-6 py-4 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors border-b-2 border-transparent hover:border-purple-500"
      >
        {icon}
        <span>{label}</span>
      </motion.div>
    </Link>
  );
}

function StatCard({ 
  icon, 
  title, 
  value, 
  change, 
  changePositive, 
  gradient,
  delay 
}: { 
  icon: React.ReactNode; 
  title: string; 
  value: string; 
  change: string; 
  changePositive: boolean;
  gradient: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ scale: 1.05, y: -5 }}
      className="glass-strong rounded-2xl p-6 glow hover:glow-cyan transition-all duration-300"
    >
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 animate-float`}>
        {icon}
      </div>
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className="text-3xl font-bold text-white mb-2">{value}</div>
      <div className={`text-sm font-medium flex items-center gap-1 ${changePositive ? 'text-green-400' : 'text-red-400'}`}>
        <TrendingUp className={`w-4 h-4 ${!changePositive && 'rotate-180'}`} />
        {change} from last hour
      </div>
    </motion.div>
  );
}

function QuickActionCard({ 
  href, 
  icon, 
  title, 
  description,
  gradient 
}: { 
  href: string; 
  icon: React.ReactNode; 
  title: string; 
  description: string;
  gradient: string;
}) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{ scale: 1.05, y: -5 }}
        whileTap={{ scale: 0.98 }}
        className={`glass rounded-xl p-6 hover:glass-strong transition-all duration-300 bg-gradient-to-br ${gradient} border border-white/10 hover:border-purple-400/50 cursor-pointer group`}
      >
        <div className="text-purple-400 mb-3 group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <h3 className="text-lg font-bold text-white mb-2 group-hover:gradient-text">{title}</h3>
        <p className="text-sm text-gray-400">{description}</p>
      </motion.div>
    </Link>
  );
}

function TraceRow({ index }: { index: number }) {
  const statuses = ['200', '200', '200', '500', '200'];
  const methods = ['GET', 'POST', 'GET', 'GET', 'PUT'];
  const paths = ['/api/users', '/api/auth', '/api/users/123', '/api/payment', '/api/users/456'];
  const latencies = ['45ms', '32ms', '67ms', '1234ms', '28ms'];
  
  const status = statuses[index];
  const isError = status === '500';
  
  return (
    <motion.tr
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className="hover:bg-white/5 transition-colors"
    >
      <td className="py-3 px-4">
        <code className="text-cyan-400 text-xs">req-abc-{index + 1}</code>
      </td>
      <td className="py-3 px-4">
        <span className="px-2 py-1 rounded-md bg-blue-500/20 text-blue-300 text-xs font-semibold">
          {methods[index]}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-gray-300">{paths[index]}</td>
      <td className="py-3 px-4">
        {isError ? (
          <span className="flex items-center gap-2 px-2 py-1 rounded-md bg-red-500/20 text-red-300 text-xs font-semibold w-fit glow-red">
            <AlertTriangle className="w-3 h-3" />
            {status}
          </span>
        ) : (
          <span className="flex items-center gap-2 px-2 py-1 rounded-md bg-green-500/20 text-green-300 text-xs font-semibold w-fit">
            <CheckCircle2 className="w-3 h-3" />
            {status}
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-gray-300">{latencies[index]}</td>
      <td className="py-3 px-4 text-sm text-gray-400">10:30:15</td>
    </motion.tr>
  );
}
