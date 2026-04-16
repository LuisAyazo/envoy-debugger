// Package clients provee el streaming de logs del pod Envoy via kubectl exec.
// Lee los logs directamente del pod (como kubectl logs -f) y los envía al Correlator.
// No requiere dependencias de k8s.io/client-go - usa el binario kubectl del sistema.
package clients

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"go.uber.org/zap"
)

// LogFeeder es la interfaz que recibe líneas de log
type LogFeeder interface {
	Feed(line string)
}

// StreamerConfig contiene la configuración del streamer
type StreamerConfig struct {
	Namespace  string // namespace de Kubernetes donde corre Envoy
	PodLabel   string // label selector para encontrar el pod Envoy, ej: "app=envoy-proxy"
	Container  string // nombre del container dentro del pod, ej: "envoy"
	Kubeconfig string // path al kubeconfig (vacío = usar el default o in-cluster)
	SinceSecs  int    // cuántos segundos hacia atrás al conectar (default 300 = 5min)
}

// DefaultStreamerConfig retorna la configuración por defecto para el operador Univision
func DefaultStreamerConfig() StreamerConfig {
	return StreamerConfig{
		Namespace: "univision-gateway-system",
		PodLabel:  "app=envoy-proxy",
		Container: "envoy",
		SinceSecs: 300,
	}
}

// K8sLogStreamer hace streaming de logs del pod Envoy via kubectl
type K8sLogStreamer struct {
	cfg    StreamerConfig
	logger *zap.Logger
}

// NewK8sLogStreamer crea un nuevo streamer
func NewK8sLogStreamer(cfg StreamerConfig, logger *zap.Logger) *K8sLogStreamer {
	if cfg.SinceSecs == 0 {
		cfg.SinceSecs = 300
	}
	return &K8sLogStreamer{
		cfg:    cfg,
		logger: logger,
	}
}

// StreamLogs inicia el streaming de logs y envía cada línea al feeder.
// Se reconecta automáticamente si el stream se interrumpe.
// Bloquea hasta que ctx sea cancelado.
func (s *K8sLogStreamer) StreamLogs(ctx context.Context, feeder LogFeeder) {
	s.logger.Info("Starting Envoy log streaming via kubectl",
		zap.String("namespace", s.cfg.Namespace),
		zap.String("podLabel", s.cfg.PodLabel),
		zap.String("container", s.cfg.Container),
	)

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("Log streaming stopped")
			return
		default:
		}

		if err := s.streamOnce(ctx, feeder); err != nil {
			if ctx.Err() != nil {
				return
			}
			s.logger.Warn("Log stream interrupted, reconnecting in 5s",
				zap.Error(err),
			)
			select {
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
		}
	}
}

// streamOnce hace un único intento de streaming via kubectl logs
func (s *K8sLogStreamer) streamOnce(ctx context.Context, feeder LogFeeder) error {
	// Encontrar el pod Envoy
	podName, err := s.findEnvoyPod(ctx)
	if err != nil {
		return fmt.Errorf("failed to find Envoy pod: %w", err)
	}

	s.logger.Info("Found Envoy pod, starting log stream via kubectl",
		zap.String("pod", podName),
	)

	// Construir el comando kubectl logs
	args := s.buildKubectlArgs(podName)
	cmd := exec.CommandContext(ctx, "kubectl", args...)

	// Capturar stdout
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start kubectl logs: %w", err)
	}

	// Leer líneas del stream
	scanner := bufio.NewScanner(stdout)
	// Buffer grande para líneas con headers completos
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			cmd.Process.Kill() //nolint:errcheck
			return nil
		default:
		}

		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			feeder.Feed(line)
		}
	}

	if err := scanner.Err(); err != nil {
		cmd.Process.Kill() //nolint:errcheck
		return fmt.Errorf("log stream scanner error: %w", err)
	}

	// Esperar a que el proceso termine
	if err := cmd.Wait(); err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return fmt.Errorf("kubectl logs exited: %w", err)
	}

	return fmt.Errorf("kubectl logs stream ended unexpectedly")
}

// buildKubectlArgs construye los argumentos para kubectl logs
func (s *K8sLogStreamer) buildKubectlArgs(podName string) []string {
	args := []string{"logs", podName, "--follow"}

	if s.cfg.Namespace != "" {
		args = append(args, "--namespace", s.cfg.Namespace)
	}
	if s.cfg.Container != "" {
		args = append(args, "--container", s.cfg.Container)
	}
	if s.cfg.SinceSecs > 0 {
		args = append(args, fmt.Sprintf("--since=%ds", s.cfg.SinceSecs))
	}
	if s.cfg.Kubeconfig != "" {
		args = append(args, "--kubeconfig", s.cfg.Kubeconfig)
	}

	return args
}

// findEnvoyPod encuentra el nombre del pod Envoy usando kubectl get pods
func (s *K8sLogStreamer) findEnvoyPod(ctx context.Context) (string, error) {
	args := []string{
		"get", "pods",
		"--selector", s.cfg.PodLabel,
		"--field-selector", "status.phase=Running",
		"--output", "jsonpath={.items[0].metadata.name}",
	}

	if s.cfg.Namespace != "" {
		args = append(args, "--namespace", s.cfg.Namespace)
	}
	if s.cfg.Kubeconfig != "" {
		args = append(args, "--kubeconfig", s.cfg.Kubeconfig)
	}

	cmd := exec.CommandContext(ctx, "kubectl", args...)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("kubectl get pods failed: %w", err)
	}

	podName := strings.TrimSpace(string(out))
	if podName == "" {
		return "", fmt.Errorf("no running pods found with label %q in namespace %q",
			s.cfg.PodLabel, s.cfg.Namespace)
	}

	return podName, nil
}

// StdinFeeder es un LogFeeder que lee líneas de stdin (útil para testing local)
// Permite hacer: kubectl logs envoy-pod | ./debugger --stdin
type StdinFeeder struct {
	feeder LogFeeder
	logger *zap.Logger
}

// NewStdinStreamer crea un streamer que lee de stdin
func NewStdinStreamer(logger *zap.Logger) *StdinStreamer {
	return &StdinStreamer{logger: logger}
}

// StdinStreamer lee logs de stdin en lugar de kubectl
type StdinStreamer struct {
	logger *zap.Logger
}

// StreamLogs lee líneas de stdin y las envía al feeder
func (s *StdinStreamer) StreamLogs(ctx context.Context, feeder LogFeeder, reader interface{ Read([]byte) (int, error) }) {
	scanner := bufio.NewScanner(reader.(interface {
		Read([]byte) (int, error)
	}).(interface {
		Read(p []byte) (n int, err error)
	}))
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
		}
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			feeder.Feed(line)
		}
	}
}
