package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"gateway-debugger/internal/api"
	"gateway-debugger/internal/clients"
	"gateway-debugger/internal/collector"
	"gateway-debugger/internal/storage"
)

func main() {
	// ── Logger ────────────────────────────────────────────────────────────────
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("failed to create logger: %v", err)
	}
	defer logger.Sync() //nolint:errcheck

	// ── Storage ───────────────────────────────────────────────────────────────
	// Legacy store (compatibilidad hacia atrás)
	legacyStore := storage.NewMemoryStore()
	defer legacyStore.Close()

	// Nuevo store de RequestTrace correlacionados
	requestStore := storage.NewRequestStore()

	// ── Correlator ────────────────────────────────────────────────────────────
	correlator := collector.NewCorrelator(requestStore, logger)

	// ── Gin Router ────────────────────────────────────────────────────────────
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(corsMiddleware())

	// ── Handlers ──────────────────────────────────────────────────────────────
	handlers := api.NewHandlerWithRequestStore(legacyStore, requestStore)

	// ── WebSocket Manager ─────────────────────────────────────────────────────
	wsManager := api.NewWSManager()

	// ── Routes ────────────────────────────────────────────────────────────────
	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "healthy",
			"timestamp": time.Now().UTC(),
		})
	})

	apiGroup := router.Group("/api")
	{
		// ── RequestTrace endpoints (nuevo sistema de correlación) ──────────────
		reqGroup := apiGroup.Group("/requests")
		{
			reqGroup.GET("", handlers.GetRequests)
			reqGroup.GET("/search", handlers.SearchRequests)
			reqGroup.GET("/stats", handlers.GetRequestStats)
			reqGroup.GET("/:id", handlers.GetRequestByID)
			reqGroup.GET("/:id/flow", handlers.GetRequestFlow)
		}

		// ── Legacy trace endpoints ─────────────────────────────────────────────
		apiGroup.GET("/traces", handlers.GetTraces)
		apiGroup.POST("/traces", handlers.CreateTrace)
		apiGroup.GET("/traces/:id", handlers.GetTraceByID)

		// ── Legacy metrics endpoints ───────────────────────────────────────────
		apiGroup.GET("/metrics", handlers.GetMetrics)
		apiGroup.POST("/metrics", handlers.CreateMetric)

		// ── Legacy logs endpoints ──────────────────────────────────────────────
		apiGroup.GET("/logs", handlers.GetLogs)
		apiGroup.POST("/logs", handlers.CreateLog)

		// ── WebSocket para actualizaciones en tiempo real ──────────────────────
		apiGroup.GET("/ws", wsManager.HandleWebSocket)
	}

	// ── Context con cancelación ───────────────────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ── Iniciar Correlator ────────────────────────────────────────────────────
	correlator.Start(ctx)
	logger.Info("Correlator started")

	// ── Iniciar WebSocket Manager ─────────────────────────────────────────────
	go wsManager.Start(ctx)

	// ── Reenviar actualizaciones del Correlator al WebSocket ──────────────────
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case requestID, ok := <-correlator.Updates():
				if !ok {
					return
				}
				// Notificar a todos los clientes WebSocket conectados
				wsManager.Broadcast(map[string]interface{}{
					"type":       "request_updated",
					"request_id": requestID,
					"timestamp":  time.Now().UTC(),
				})
			}
		}
	}()

	// ── Iniciar K8s Log Streamer (si está configurado) ────────────────────────
	streamerEnabled := os.Getenv("K8S_STREAMER_ENABLED")
	if streamerEnabled == "true" || streamerEnabled == "1" {
		cfg := clients.StreamerConfig{
			Namespace:  getEnv("ENVOY_NAMESPACE", "univision-gateway-system"),
			PodLabel:   getEnv("ENVOY_POD_LABEL", "app=envoy-proxy"),
			Container:  getEnv("ENVOY_CONTAINER", "envoy"),
			Kubeconfig: getEnv("KUBECONFIG", ""),
			SinceSecs:  300,
		}

		streamer := clients.NewK8sLogStreamer(cfg, logger)
		go func() {
			logger.Info("Starting K8s log streamer",
				zap.String("namespace", cfg.Namespace),
				zap.String("label", cfg.PodLabel),
			)
			streamer.StreamLogs(ctx, correlator)
		}()
	} else {
		logger.Info("K8s log streamer disabled (set K8S_STREAMER_ENABLED=true to enable)")
	}

	// ── HTTP Server ───────────────────────────────────────────────────────────
	port := getEnv("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Iniciar servidor en goroutine
	go func() {
		logger.Info("🚀 Gateway Debugger starting", zap.String("port", port))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server error", zap.Error(err))
		}
	}()

	// ── Graceful Shutdown ─────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	logger.Info("⏹️  Shutting down server...")
	cancel() // cancelar el contexto para detener el streamer y correlator

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("Server shutdown error", zap.Error(err))
	}

	logger.Info("✅ Server stopped")
}

// corsMiddleware agrega headers CORS para el frontend
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// getEnv retorna el valor de una variable de entorno o el default
func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
