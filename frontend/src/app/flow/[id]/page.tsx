"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  GitBranch, CheckCircle, XCircle, Clock, ChevronDown, ChevronRight, Play, AlertTriangle, ArrowLeft,
  Download, Share2, TrendingUp, Network, Layers, Zap, FileJson, Activity, BarChart3, Eye, Copy, Database, Code
} from "lucide-react";
import Link from "next/link";
import { requestFlows } from "../requestFlowData";
import { useParams } from "next/navigation";

export default function FlowPage() {
  const params = useParams();
  const requestId = params.id as string;
  
  // Get the request flow data
  const flowData = requestFlows[requestId] || requestFlows["req-def-456"]; // Fallback to default
  
  const [expandedStep, setExpandedStep] = useState(0);
  const [selectedView, setSelectedView] = useState<"timeline" | "topology" | "details">("timeline");
  const [showInsights, setShowInsights] = useState(true);
  const [showEnvoyResources, setShowEnvoyResources] = useState(false);
  const [selectedResource, setSelectedResource] = useState<string | null>(null);

  const flowSteps = flowData.flowSteps;
  const insights = flowData.insights;
  const requestMetadata = flowData.metadata;

  // Helper components
  function ViewTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onClick}
        className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all ${
          active 
            ? 'glass-strong border-2 border-cyan-400 glow-cyan text-white' 
            : 'glass hover:glass-strong text-gray-400 hover:text-white'
        }`}
      >
        {icon}
        <span className="font-semibold">{label}</span>
      </motion.button>
    );
  }

  function TimelineWaterfall({ steps, totalDuration }: { steps: typeof flowSteps; totalDuration: number }) {
    // Calculate scale marks dynamically
    const maxDuration = Math.max(totalDuration, 10); // Minimum 10ms scale
    const scaleMarks = maxDuration <= 10 ? [0, 2, 4, 6, 8, 10] :
                       maxDuration <= 50 ? [0, 10, 20, 30, 40, 50] :
                       maxDuration <= 100 ? [0, 25, 50, 75, 100] :
                       [0, maxDuration * 0.25, maxDuration * 0.5, maxDuration * 0.75, maxDuration];

    return (
      <div className="space-y-3">
        {/* Time scale */}
        <div className="relative h-8 mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-b border-gray-700" />
          </div>
          <div className="relative flex justify-between text-xs text-gray-500">
            {scaleMarks.map((t, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div className="w-px h-3 bg-gray-600 mb-1" />
                <span className="font-mono">{t.toFixed(1)}ms</span>
              </div>
            ))}
          </div>
        </div>

        {/* Total Duration Badge */}
        <div className="flex items-center justify-between mb-4 p-4 glass-strong rounded-xl border-2 border-purple-500/30 glow">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-purple-400" />
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Request Duration</div>
              <div className="text-3xl font-bold gradient-text">{totalDuration.toFixed(2)}ms</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-xs text-gray-400">Steps Completed</div>
              <div className="text-lg font-bold text-cyan-400">{steps.filter(s => s.status === 'pass').length}/{steps.length}</div>
            </div>
          </div>
        </div>

        {/* Timeline bars */}
        {steps.map((step, idx) => {
          const leftPercent = (step.startTime / maxDuration) * 100;
          const widthPercent = Math.max((step.duration / maxDuration) * 100, 0.5); // Min 0.5% width
          const isError = step.status === 'fail';
          const isWarning = step.status === 'warning';
          const isSkip = step.status === 'skip';
          
          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="relative"
            >
              {/* Step name and timing info */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white min-w-[220px]">{step.filter || step.name}</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 font-mono">Start: <span className="text-cyan-400">{step.startTime.toFixed(1)}ms</span></span>
                    <span className="text-gray-600">•</span>
                    <span className="text-gray-500 font-mono">Duration: <span className="text-purple-400">{step.duration.toFixed(1)}ms</span></span>
                  </div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-lg font-bold ${
                  isError ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                  isWarning ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' :
                  isSkip ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30' :
                  'bg-green-500/20 text-green-300 border border-green-500/30'
                }`}>
                  {step.status.toUpperCase()}
                </span>
              </div>
              
              {/* Timeline bar container */}
              <div className="relative h-12 mb-3 bg-black/20 rounded-lg">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.2 + idx * 0.1, duration: 0.5 }}
                  style={{ 
                    left: `${leftPercent}%`, 
                    width: `${widthPercent}%`,
                    minWidth: widthPercent < 5 ? '40px' : 'auto'
                  }}
                  className={`absolute h-full rounded-lg flex items-center px-3 ${
                    isError 
                      ? 'bg-gradient-to-r from-red-500/90 to-red-600/90 glow-red' 
                      : isWarning 
                      ? 'bg-gradient-to-r from-yellow-500/90 to-yellow-600/90 glow' 
                      : isSkip
                      ? 'bg-gray-600/50 border border-gray-500/50'
                      : 'bg-gradient-to-r from-cyan-500/90 to-purple-500/90 glow-cyan'
                  }`}
                >
                  <div className="flex items-center gap-2 w-full">
                    {step.status === 'pass' && <CheckCircle className="w-4 h-4 text-green-300 flex-shrink-0" />}
                    {step.status === 'fail' && <XCircle className="w-4 h-4 text-white flex-shrink-0" />}
                    {step.status === 'warning' && <AlertTriangle className="w-4 h-4 text-white flex-shrink-0" />}
                    {step.status === 'skip' && <AlertTriangle className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                    {widthPercent > 10 && (
                      <span className="text-xs font-semibold text-white truncate">{step.name}</span>
                    )}
                  </div>
                </motion.div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  }

  function ServiceTopology() {
    const services = [
      { id: 'client', name: requestMetadata.sourceService, icon: Eye, color: 'cyan' },
      { id: 'gateway', name: 'api-gateway', icon: Layers, color: 'purple' },
      { id: 'target', name: requestMetadata.targetService, icon: Database, color: 'pink' }
    ];

    return (
      <div className="relative min-h-[400px] flex items-center justify-center">
        {/* Services */}
        <div className="flex items-center justify-between w-full max-w-4xl px-12">
          {services.map((service, idx) => {
            const Icon = service.icon;
            return (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.2 }}
                className="relative"
              >
                <div className={`glass-strong p-8 rounded-2xl border-2 ${
                  service.color === 'cyan' ? 'border-cyan-400 glow-cyan' :
                  service.color === 'purple' ? 'border-purple-400 glow' :
                  'border-pink-400 glow-red'
                } hover:scale-110 transition-transform cursor-pointer`}>
                  <Icon className={`w-16 h-16 ${
                    service.color === 'cyan' ? 'text-cyan-400' :
                    service.color === 'purple' ? 'text-purple-400' :
                    'text-pink-400'
                  } mb-4`} />
                  <div className="text-center">
                    <div className="text-xl font-bold text-white mb-1">{service.name}</div>
                    <div className="text-xs text-gray-400">{service.id === 'client' ? 'Source' : service.id === 'gateway' ? 'Gateway' : 'Target'}</div>
                  </div>
                </div>

                {/* Connection line */}
                {idx < services.length - 1 && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.5 + idx * 0.3, duration: 0.5 }}
                    className="absolute top-1/2 left-full w-24 h-1 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 origin-left"
                    style={{ transform: 'translateY(-50%)' }}
                  >
                    <motion.div
                      animate={{ x: [0, 96, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      className="w-3 h-3 bg-white rounded-full shadow-lg shadow-cyan-400/50"
                    />
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Protocol badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 glass px-4 py-2 rounded-full"
        >
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold text-white">{requestMetadata.protocol}</span>
          </div>
        </motion.div>
      </div>
    );
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
              <Link href="/traces">
                <motion.button 
                  whileHover={{ scale: 1.1, x: -5 }}
                  className="w-10 h-10 rounded-xl glass hover:glass-strong flex items-center justify-center glow-cyan"
                >
                  <ArrowLeft className="w-5 h-5 text-cyan-400" />
                </motion.button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold gradient-text">Request Flow Visualization</h1>
                <p className="text-sm text-purple-300/60">
                  <span className="text-gray-400">{flowData.method}</span> <code className="text-cyan-400">{flowData.path}</code> • 
                  Request ID: <code className="text-cyan-400">{requestMetadata.requestId}</code>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowEnvoyResources(!showEnvoyResources)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
                  showEnvoyResources 
                    ? "glass-strong border-2 border-purple-400 text-white glow" 
                    : "glass text-gray-400 hover:text-white"
                }`}
              >
                <Code className="w-4 h-4" />
                <span>Envoy Resources</span>
              </motion.button>
              <div className={`px-4 py-2 rounded-lg glass-strong text-sm ${
                flowData.status >= 200 && flowData.status < 300 ? "glow-green" :
                flowData.status >= 400 ? "glow-red" : ""
              }`}>
                <span className={`font-semibold ${
                  flowData.status >= 200 && flowData.status < 300 ? "text-green-300" :
                  flowData.status >= 400 ? "text-red-300" : "text-yellow-300"
                }`}>
                  {flowData.status >= 200 && flowData.status < 300 ? "✅" : "❌"} {flowData.statusText}
                </span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Envoy Resources Panel */}
        {showEnvoyResources && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-strong rounded-2xl overflow-hidden border-2 border-purple-400/30"
          >
            <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10 bg-purple-500/10">
              <Code className="w-6 h-6 text-purple-400" />
              <h2 className="text-2xl font-bold gradient-text">Kubernetes/Envoy Resources</h2>
            </div>
            <div className="p-6">
              <div className="flex gap-2 mb-4 flex-wrap">
                {Object.keys(flowData.envoyResources).map((resourceKey) => (
                  <motion.button
                    key={resourceKey}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedResource(selectedResource === resourceKey ? null : resourceKey)}
                    className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
                      selectedResource === resourceKey 
                        ? "glass-strong border-2 border-cyan-400 text-white glow-cyan" 
                        : "glass text-gray-400 hover:text-white"
                    }`}
                  >
                    {resourceKey}
                  </motion.button>
                ))}
              </div>

              {selectedResource && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-strong rounded-xl p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-cyan-400">
                      {(flowData.envoyResources as any)[selectedResource]?.kind || selectedResource}
                    </h3>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => navigator.clipboard.writeText(JSON.stringify((flowData.envoyResources as any)[selectedResource], null, 2))}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg glass hover:glass-strong text-sm"
                    >
                      <Copy className="w-4 h-4 text-green-400" />
                      <span className="text-gray-300">Copy YAML</span>
                    </motion.button>
                  </div>
                  <pre className="text-xs bg-black/60 p-4 rounded-lg overflow-x-auto border border-cyan-400/20">
                    <code className="text-cyan-300">
                      {JSON.stringify((flowData.envoyResources as any)[selectedResource], null, 2)}
                    </code>
                  </pre>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Request Metadata Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-strong rounded-2xl p-6"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                <Activity className="w-3 h-3" />
                Trace ID
              </div>
              <code className="text-sm text-cyan-400 font-mono">{requestMetadata.traceId}</code>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                <Clock className="w-3 h-3" />
                Total Duration
              </div>
              <div className="text-sm text-purple-400 font-bold">{requestMetadata.totalDuration}ms</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1 flex items-center gap-2">
                <Network className="w-3 h-3" />
                Protocol
              </div>
              <div className="text-sm text-white">{requestMetadata.protocol}</div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:glass-strong text-sm"
                onClick={() => navigator.clipboard.writeText(JSON.stringify(flowSteps, null, 2))}
              >
                <Download className="w-4 h-4 text-green-400" />
                <span>Export</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl glass hover:glass-strong text-sm"
              >
                <Share2 className="w-4 h-4 text-blue-400" />
                <span>Share</span>
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* View Selector */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="flex gap-2"
        >
          <ViewTab icon={<BarChart3 className="w-4 h-4" />} label="Timeline" active={selectedView === "timeline"} onClick={() => setSelectedView("timeline")} />
          <ViewTab icon={<Network className="w-4 h-4" />} label="Topology" active={selectedView === "topology"} onClick={() => setSelectedView("topology")} />
          <ViewTab icon={<Layers className="w-4 h-4" />} label="Details" active={selectedView === "details"} onClick={() => setSelectedView("details")} />
        </motion.div>

        {/* Performance Insights */}
        {showInsights && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="glass-strong rounded-2xl p-6 border-l-4 border-yellow-500"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-yellow-400" />
                <h2 className="text-xl font-bold gradient-text">Performance Insights</h2>
              </div>
              <button onClick={() => setShowInsights(false)} className="text-gray-400 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {insights.map((insight, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + idx * 0.1 }}
                  className={`flex gap-3 p-4 rounded-xl ${
                    insight.type === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                    insight.type === 'warning' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                    'bg-blue-500/10 border border-blue-500/20'
                  }`}
                >
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                    insight.type === 'error' ? 'text-red-400' :
                    insight.type === 'warning' ? 'text-yellow-400' :
                    'text-blue-400'
                  }`} />
                  <div className="flex-1">
                    <div className={`font-semibold mb-1 ${
                      insight.type === 'error' ? 'text-red-300' :
                      insight.type === 'warning' ? 'text-yellow-300' :
                      'text-blue-300'
                    }`}>{insight.message}</div>
                    <div className="text-sm text-gray-400">💡 {insight.suggestion}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Timeline Waterfall View */}
        {selectedView === "timeline" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong rounded-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10 bg-white/5">
              <BarChart3 className="w-6 h-6 text-cyan-400" />
              <h2 className="text-2xl font-bold gradient-text">Request Timeline (Waterfall)</h2>
            </div>
            <div className="p-6">
              <TimelineWaterfall steps={flowSteps} totalDuration={requestMetadata.totalDuration} />
            </div>
          </motion.div>
        )}

        {/* Topology Map View */}
        {selectedView === "topology" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong rounded-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10 bg-white/5">
              <Network className="w-6 h-6 text-purple-400" />
              <h2 className="text-2xl font-bold gradient-text">Service Topology</h2>
            </div>
            <div className="p-8">
              <ServiceTopology />
            </div>
          </motion.div>
        )}

        {/* Details View - Request Summary & Flow Steps */}
        {selectedView === "details" && (
          <>
            {/* Request Summary */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-strong rounded-2xl p-6 glow"
            >
              <h2 className="text-xl font-bold gradient-text mb-6">Request Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="glass rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-2">Method</div>
                  <div className={`text-2xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${
                    flowData.method === "GET" ? "from-blue-400 to-cyan-400" :
                    flowData.method === "POST" ? "from-green-400 to-emerald-400" :
                    flowData.method === "PUT" ? "from-yellow-400 to-orange-400" :
                    "from-purple-400 to-pink-400"
                  }`}>{flowData.method}</div>
                </div>
                <div className="glass rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-2">Path</div>
                  <div className="text-lg font-bold text-white truncate">{flowData.path}</div>
                </div>
                <div className="glass rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-2">Status</div>
                  <div className={`text-2xl font-bold ${
                    flowData.status >= 200 && flowData.status < 300 ? "text-green-400 glow-green" :
                    flowData.status >= 400 ? "text-red-400 glow-red" : "text-yellow-400"
                  }`}>{flowData.status}</div>
                </div>
                <div className="glass rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-2">Total Duration</div>
                  <div className="text-2xl font-bold text-purple-400">{requestMetadata.totalDuration}ms</div>
                </div>
              </div>
            </motion.div>

            {/* Error Alert - Only show if failed */}
            {flowData.status >= 400 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="glass-strong rounded-2xl p-6 border-2 border-red-500/30 glow-red"
              >
                <div className="flex items-start gap-4">
                  <AlertTriangle className="w-8 h-8 text-red-400 flex-shrink-0 animate-pulse" />
                  <div>
                    <div className="text-red-300 font-bold text-lg mb-2">⚠️ Error Detected</div>
                    <div className="text-red-200">
                      Request failed: <span className="font-bold text-red-400">{flowData.statusText}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}


            {/* Flow Visualization */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-strong rounded-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10 bg-white/5">
                <GitBranch className="w-6 h-6 text-cyan-400" />
                <h2 className="text-2xl font-bold gradient-text">Execution Flow</h2>
              </div>

              <div className="p-6 space-y-4">
                {flowSteps.map((step, idx) => (
                  <FlowStep
                    key={step.id}
                    step={step}
                    index={idx}
                    isExpanded={expandedStep === step.id}
                    onToggle={() => setExpandedStep(expandedStep === step.id ? -1 : step.id)}
                  />
                ))}
              </div>
            </motion.div>

            {/* Legend */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="glass rounded-2xl p-6"
            >
              <h3 className="font-bold text-lg gradient-text mb-4">Legend</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 glass rounded-xl p-4">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <div>
                    <div className="font-semibold text-green-300">PASS</div>
                    <div className="text-xs text-gray-400">Filter executed successfully</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 glass rounded-xl p-4">
                  <XCircle className="w-6 h-6 text-red-400" />
                  <div>
                    <div className="font-semibold text-red-300">FAIL</div>
                    <div className="text-xs text-gray-400">Filter failed, request stopped</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 glass rounded-xl p-4">
                  <AlertTriangle className="w-6 h-6 text-gray-400" />
                  <div>
                    <div className="font-semibold text-gray-300">SKIP</div>
                    <div className="text-xs text-gray-400">Filter was skipped</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}

function FlowStep({ step, index, isExpanded, onToggle }: { step: any; index: number; isExpanded: boolean; onToggle: () => void }) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass": return <CheckCircle className="w-6 h-6 text-green-400" />;
      case "fail": return <XCircle className="w-6 h-6 text-red-400" />;
      case "skip": return <AlertTriangle className="w-6 h-6 text-gray-400" />;
      default: return <Play className="w-6 h-6 text-blue-400" />;
    }
  };

  const getBorderColor = (status: string) => {
    switch (status) {
      case "pass": return "border-green-500/50";
      case "fail": return "border-red-500/50 glow-red";
      case "skip": return "border-gray-500/30";
      default: return "border-blue-500/50";
    }
  };

  const getBgGlow = (status: string) => {
    switch (status) {
      case "pass": return "bg-green-500/10";
      case "fail": return "bg-red-500/10";
      default: return "bg-gray-500/5";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -50 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className={`glass rounded-xl border-l-4 ${getBorderColor(step.status)} ${getBgGlow(step.status)} overflow-hidden`}
    >
      <motion.div
        whileHover={{ x: 5 }}
        className="p-5 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.div
              whileHover={{ scale: 1.2, rotate: 180 }}
              transition={{ duration: 0.3 }}
            >
              {getStatusIcon(step.status)}
            </motion.div>
            <div>
              <div className="font-bold text-lg text-white">{step.name}</div>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>{step.duration}ms</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  step.status === 'pass' ? 'bg-green-500/20 text-green-300' :
                  step.status === 'fail' ? 'bg-red-500/20 text-red-300' :
                  'bg-gray-500/20 text-gray-300'
                }`}>
                  {step.status.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            {isExpanded ? <ChevronDown className="w-5 h-5 text-purple-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
          </motion.div>
        </div>
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="border-t border-white/10 bg-black/20"
          >
            <div className="p-5 font-mono text-sm space-y-2">
              {Object.entries(step.details).map(([key, value]) => (
                <div key={key} className="flex gap-3">
                  <span className="text-cyan-400 font-semibold min-w-[150px]">{key}:</span>
                  <span className="text-gray-300 flex-1">
                    {typeof value === "object" ? (
                      <pre className="text-xs bg-black/40 p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <span className="text-purple-300">{String(value)}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

