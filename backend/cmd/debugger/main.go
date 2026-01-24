package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/gin-gonic/gin"
	"gateway-debugger/internal/api"
	"gateway-debugger/internal/storage"
)

func main() {
	// Initialize storage
	store := storage.NewMemoryStore()
	defer store.Close()

	// Create Gin router
	router := gin.Default()

	// Create handlers
	handlers := api.NewHandler(store)

	// Create WebSocket manager
	wsManager := api.NewWSManager()

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	// API routes
	apiGroup := router.Group("/api")
	{
		// Trace endpoints
		apiGroup.GET("/traces", handlers.GetTraces)
		apiGroup.POST("/traces", handlers.CreateTrace)
		apiGroup.GET("/traces/:id", handlers.GetTraceByID)

		// Metrics endpoints
		apiGroup.GET("/metrics", handlers.GetMetrics)
		apiGroup.POST("/metrics", handlers.CreateMetric)

		// Logs endpoints
		apiGroup.GET("/logs", handlers.GetLogs)
		apiGroup.POST("/logs", handlers.CreateLog)

		// Request flow endpoints
		apiGroup.GET("/flow/:trace-id", handlers.GetRequestFlow)

		// WebSocket for live updates
		apiGroup.GET("/ws", wsManager.HandleWebSocket)
	}

	// Prometheus metrics endpoint
	router.GET("/metrics", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "prometheus metrics"})
	})

	// Configuration
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Create HTTP server
	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	// Start WebSocket manager
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go wsManager.Start(ctx)

	// Start server in goroutine
	go func() {
		log.Printf("🚀 Server starting on port %s\n", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %s", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	<-quit

	log.Println("⏹️  Shutting down server...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server shutdown error: %s", err)
	}

	log.Println("✅ Server stopped")
}
