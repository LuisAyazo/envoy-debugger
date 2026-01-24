// Mock data for different request flows

export type FlowStep = {
  id: number;
  name: string;
  status: "pass" | "fail" | "skip" | "warning";
  duration: number;
  startTime: number;
  filter: string;
  details: Record<string, any>;
};

export type RequestFlow = {
  id: string;
  method: string;
  path: string;
  status: number;
  statusText: string;
  timestamp: string;
  metadata: {
    traceId: string;
    spanId: string;
    parentSpanId: string;
    requestId: string;
    totalDuration: number;
    sourceService: string;
    targetService: string;
    protocol: string;
  };
  flowSteps: FlowStep[];
  insights: Array<{
    type: "error" | "warning" | "info";
    message: string;
    suggestion: string;
  }>;
  envoyResources: {
    httpRoute: any;
    backend: any;
    backendTrafficPolicy?: any;
    retryPolicy?: any;
    timeoutPolicy?: any;
    rateLimitPolicy?: any;
    corsPolicy?: any;
  };
};

export const requestFlows: Record<string, RequestFlow> = {
  "req-success-001": {
    id: "req-success-001",
    method: "POST",
    path: "/api/auth/login",
    status: 200,
    statusText: "Success",
    timestamp: "2026-01-23T10:30:20.045Z",
    metadata: {
      traceId: "trace-abc-123",
      spanId: "span-success-001",
      parentSpanId: "span-root",
      requestId: "req-success-001",
      totalDuration: 45.2,
      sourceService: "mobile-app",
      targetService: "auth-service",
      protocol: "HTTP/2.0"
    },
    flowSteps: [
      {
        id: 1,
        name: "Request Received",
        status: "pass",
        duration: 0.5,
        startTime: 0,
        filter: "listener",
        details: {
          method: "POST",
          path: "/api/auth/login",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Mobile-App/2.1.0",
            "X-Request-ID": "req-success-001",
            "X-Forwarded-For": "192.168.1.100"
          },
          body_size: "245 bytes",
          source_ip: "192.168.1.100",
          destination: "api-gateway:8080"
        }
      },
      {
        id: 2,
        name: "Route Matching",
        status: "pass",
        duration: 1.2,
        startTime: 0.5,
        filter: "router",
        details: {
          matched: true,
          route: "auth-login-route",
          path_pattern: "/api/auth/login",
          cluster: "auth-service-cluster",
          retry_policy: "exponential-backoff-3x",
          timeout: "30s",
          weight: 100
        }
      },
      {
        id: 3,
        name: "CORS Policy",
        status: "pass",
        duration: 0.8,
        startTime: 1.7,
        filter: "envoy.filters.http.cors",
        details: {
          origin: "https://mobile.univision.com",
          allowed_origins: ["https://mobile.univision.com", "https://app.univision.com"],
          allowed_methods: ["GET", "POST", "PUT", "DELETE"],
          allowed_headers: ["Content-Type", "Authorization"],
          max_age: 3600
        }
      },
      {
        id: 4,
        name: "Rate Limiting",
        status: "pass",
        duration: 2.3,
        startTime: 2.5,
        filter: "envoy.filters.http.ratelimit",
        details: {
          limit: "100 requests/min",
          current: "45 requests/min",
          remaining: 55,
          reset_in: "30s",
          bucket: "user:12345"
        }
      },
      {
        id: 5,
        name: "JWT Validation",
        status: "pass",
        duration: 8.5,
        startTime: 4.8,
        filter: "envoy.filters.http.jwt_authn",
        details: {
          token_extracted: true,
          token_valid: true,
          issuer: "auth.univision.com",
          algorithm: "RS256",
          token_exp: 1740307820,
          current_time: 1740304220,
          ttl_remaining: "3600s",
          claims: {
            sub: "user-12345",
            role: "premium",
            email: "user@example.com"
          }
        }
      },
      {
        id: 6,
        name: "Header Transformation",
        status: "pass",
        duration: 1.5,
        startTime: 13.3,
        filter: "envoy.filters.http.header_to_metadata",
        details: {
          headers_added: ["X-User-ID", "X-User-Role"],
          headers_removed: ["Authorization"],
          metadata_extracted: {
            user_id: "12345",
            user_role: "premium"
          }
        }
      },
      {
        id: 7,
        name: "Circuit Breaker Check",
        status: "pass",
        duration: 0.9,
        startTime: 14.8,
        filter: "envoy.circuit_breaker",
        details: {
          state: "closed",
          consecutive_failures: 0,
          failure_threshold: 5,
          success_threshold: 3,
          timeout: "10s"
        }
      },
      {
        id: 8,
        name: "Backend Response",
        status: "pass",
        duration: 29.5,
        startTime: 15.7,
        filter: "upstream",
        details: {
          backend_duration: "28.5ms",
          status_code: 200,
          response_size: "1.2 KB",
          backend_host: "auth-service-pod-abc123",
          connection_reused: true
        }
      }
    ],
    insights: [
      { type: "info", message: "Request completed successfully in 45.2ms", suggestion: "Performance is within normal range" },
      { type: "info", message: "JWT token valid for 3600 seconds", suggestion: "Token refresh not needed yet" },
      { type: "info", message: "Rate limit: 55 requests remaining", suggestion: "No throttling concerns" }
    ],
    envoyResources: {
      httpRoute: {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "HTTPRoute",
        metadata: {
          name: "auth-login-route",
          namespace: "gateway-system"
        },
        spec: {
          parentRefs: [{ name: "api-gateway" }],
          rules: [
            {
              matches: [{ path: { type: "Exact", value: "/api/auth/login" } }],
              backendRefs: [
                { name: "auth-backend", port: 8080, weight: 100 }
              ]
            }
          ]
        }
      },
      backend: {
        apiVersion: "gloo.solo.io/v1",
        kind: "Backend",
        metadata: {
          name: "auth-backend",
          namespace: "gateway-system"
        },
        spec: {
          address: "auth-service.auth-ns.svc.cluster.local",
          port: 8080,
          protocol: "HTTP",
          healthCheck: {
            path: "/health",
            interval: "10s",
            timeout: "5s"
          }
        }
      },
      backendTrafficPolicy: {
        apiVersion: "gateway.networking.k8s.io/v1alpha2",
        kind: "BackendTrafficPolicy",
        metadata: {
          name: "auth-traffic-policy",
          namespace: "gateway-system"
        },
        spec: {
          targetRef: { group: "", kind: "Service", name: "auth-backend" },
          retryPolicy: {
            numRetries: 3,
            perTryTimeout: "10s",
            retryOn: ["5xx", "retriable-4xx"]
          },
          timeout: {
            request: "30s"
          }
        }
      },
      corsPolicy: {
        apiVersion: "gateway.networking.k8s.io/v1alpha2",
        kind: "CORSPolicy",
        metadata: {
          name: "auth-cors-policy",
          namespace: "gateway-system"
        },
        spec: {
          targetRef: { group: "gateway.networking.k8s.io", kind: "HTTPRoute", name: "auth-login-route" },
          allowOrigins: ["https://mobile.univision.com", "https://app.univision.com"],
          allowMethods: ["GET", "POST", "PUT", "DELETE"],
          allowHeaders: ["Content-Type", "Authorization"],
          maxAge: "3600s"
        }
      }
    }
  },

  "req-def-456": {
    id: "req-def-456",
    method: "POST",
    path: "/api/auth",
    status: 401,
    statusText: "Unauthorized",
    timestamp: "2026-01-23T10:30:20.045Z",
    metadata: {
      traceId: "abc123def456",
      spanId: "span-789",
      parentSpanId: "span-000",
      requestId: "req-def-456",
      totalDuration: 4.0,
      sourceService: "mobile-app",
      targetService: "auth-service",
      protocol: "HTTP/2.0"
    },
    flowSteps: [
      {
        id: 1,
        name: "Request Received",
        status: "pass",
        duration: 0.5,
        startTime: 0,
        filter: "listener",
        details: {
          method: "POST",
          path: "/api/auth",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer eyJhbG...",
            "User-Agent": "Mozilla/5.0",
            "X-Request-ID": "req-def-456"
          },
          body_size: "1.2 KB",
          source_ip: "192.168.1.100",
          destination: "api-gateway:8080"
        }
      },
      {
        id: 2,
        name: "Route Matching",
        status: "pass",
        duration: 1.2,
        startTime: 0.5,
        filter: "router",
        details: {
          matched: true,
          route: "auth-route",
          path_pattern: "/api/auth*",
          cluster: "auth-service-cluster",
          retry_policy: "exponential-backoff",
          timeout: "30s"
        }
      },
      {
        id: 3,
        name: "JWT Validation Filter",
        status: "fail",
        duration: 2.3,
        startTime: 1.7,
        filter: "envoy.filters.http.jwt_authn",
        details: {
          filter: "jwt_auth",
          token_extracted: true,
          token_valid: false,
          reason: "Token expired",
          token_exp: 1234567890,
          current_time: 1234567999,
          diff: "109 seconds ago",
          issuer: "auth.univision.com",
          algorithm: "RS256",
          claims: { sub: "user123", role: "admin" }
        }
      },
      {
        id: 4,
        name: "Rate Limiting",
        status: "skip",
        duration: 0,
        startTime: 4.0,
        filter: "envoy.filters.http.ratelimit",
        details: {
          reason: "Skipped due to previous failure",
          configured_limit: "100 req/min",
          current_usage: "0 req/min"
        }
      },
      {
        id: 5,
        name: "Circuit Breaker Check",
        status: "skip",
        duration: 0,
        startTime: 4.0,
        filter: "envoy.circuit_breaker",
        details: {
          reason: "Skipped due to previous failure",
          state: "closed",
          failures: 0,
          threshold: 5
        }
      }
    ],
    insights: [
      { type: "error", message: "JWT token expired 109 seconds ago", suggestion: "Implement token refresh mechanism before expiration" },
      { type: "warning", message: "No retry attempted after JWT failure", suggestion: "Consider adding retry logic for auth failures" },
      { type: "info", message: "Request stopped early, saving 28ms processing time", suggestion: "Early termination pattern is efficient" }
    ],
    envoyResources: {
      httpRoute: {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "HTTPRoute",
        metadata: {
          name: "auth-route",
          namespace: "gateway-system"
        },
        spec: {
          parentRefs: [{ name: "api-gateway" }],
          rules: [
            {
              matches: [{ path: { type: "PathPrefix", value: "/api/auth" } }],
              backendRefs: [
                { name: "auth-backend", port: 8080 }
              ]
            }
          ]
        }
      },
      backend: {
        apiVersion: "gloo.solo.io/v1",
        kind: "Backend",
        metadata: {
          name: "auth-backend",
          namespace: "gateway-system"
        },
        spec: {
          address: "auth-service.auth-ns.svc.cluster.local",
          port: 8080,
          protocol: "HTTP"
        }
      },
      backendTrafficPolicy: {
        apiVersion: "gateway.networking.k8s.io/v1alpha2",
        kind: "BackendTrafficPolicy",
        metadata: {
          name: "auth-traffic-policy",
          namespace: "gateway-system"
        },
        spec: {
          targetRef: { group: "", kind: "Service", name: "auth-backend" },
          timeout: {
            request: "30s"
          }
        }
      }
    }
  },

  // Add more requests here...
  "req-partial-789": {
    id: "req-partial-789",
    method: "GET",
    path: "/api/users/profile",
    status: 503,
    statusText: "Service Unavailable",
    timestamp: "2026-01-23T10:29:15.123Z",
    metadata: {
      traceId: "trace-xyz-789",
      spanId: "span-partial-789",
      parentSpanId: "span-root",
      requestId: "req-partial-789",
      totalDuration: 102.5,
      sourceService: "web-app",
      targetService: "user-service",
      protocol: "HTTP/1.1"
    },
    flowSteps: [
      {
        id: 1,
        name: "Request Received",
        status: "pass",
        duration: 0.8,
        startTime: 0,
        filter: "listener",
        details: {
          method: "GET",
          path: "/api/users/profile",
          headers: {
            "Accept": "application/json",
            "Authorization": "Bearer valid-token-xyz",
            "User-Agent": "Web-App/1.5.0"
          },
          source_ip: "10.0.1.50",
          destination: "api-gateway:443"
        }
      },
      {
        id: 2,
        name: "Route Matching",
        status: "pass",
        duration: 1.5,
        startTime: 0.8,
        filter: "router",
        details: {
          matched: true,
          route: "user-profile-route",
          path_pattern: "/api/users/*",
          cluster: "user-service-cluster",
          timeout: "60s"
        }
      },
      {
        id: 3,
        name: "JWT Validation",
        status: "pass",
        duration: 5.2,
        startTime: 2.3,
        filter: "envoy.filters.http.jwt_authn",
        details: {
          token_valid: true,
          issuer: "auth.univision.com",
          claims: { sub: "user-789", role: "user" }
        }
      },
      {
        id: 4,
        name: "Rate Limiting",
        status: "pass",
        duration: 1.8,
        startTime: 7.5,
        filter: "envoy.filters.http.ratelimit",
        details: {
          limit: "500 requests/min",
          current: "320 requests/min",
          remaining: 180
        }
      },
      {
        id: 5,
        name: "Circuit Breaker Check",
        status: "warning",
        duration: 2.1,
        startTime: 9.3,
        filter: "envoy.circuit_breaker",
        details: {
          state: "half-open",
          consecutive_failures: 3,
          failure_threshold: 5,
          reason: "Backend experiencing intermittent issues"
        }
      },
      {
        id: 6,
        name: "Retry Attempt 1",
        status: "fail",
        duration: 30.0,
        startTime: 11.4,
        filter: "upstream",
        details: {
          error: "Connection timeout",
          backend_host: "user-service-pod-123",
          timeout_duration: "30s"
        }
      },
      {
        id: 7,
        name: "Retry Attempt 2",
        status: "fail",
        duration: 60.0,
        startTime: 41.4,
        filter: "upstream",
        details: {
          error: "Service unavailable",
          status_code: 503,
          backend_host: "user-service-pod-456"
        }
      }
    ],
    insights: [
      { type: "error", message: "Backend service unavailable after 2 retry attempts", suggestion: "Check user-service health and scale horizontally" },
      { type: "warning", message: "Circuit breaker in half-open state (3/5 failures)", suggestion: "Monitor backend recovery before increasing traffic" },
      { type: "info", message: "Total request duration: 102.5ms including retries", suggestion: "Consider reducing retry timeout for faster failure response" }
    ],
    envoyResources: {
      httpRoute: {
        apiVersion: "gateway.networking.k8s.io/v1",
        kind: "HTTPRoute",
        metadata: {
          name: "user-profile-route",
          namespace: "gateway-system"
        },
        spec: {
          parentRefs: [{ name: "api-gateway" }],
          rules: [
            {
              matches: [{ path: { type: "PathPrefix", value: "/api/users" } }],
              backendRefs: [{ name: "user-backend", port: 8080 }]
            }
          ]
        }
      },
      backend: {
        apiVersion: "gloo.solo.io/v1",
        kind: "Backend",
        metadata: {
          name: "user-backend",
          namespace: "gateway-system"
        },
        spec: {
          address: "user-service.users-ns.svc.cluster.local",
          port: 8080,
          protocol: "HTTP",
          healthCheck: {
            path: "/health",
            interval: "5s",
            unhealthyThreshold: 3
          }
        }
      },
      backendTrafficPolicy: {
        apiVersion: "gateway.networking.k8s.io/v1alpha2",
        kind: "BackendTrafficPolicy",
        metadata: {
          name: "user-traffic-policy",
          namespace: "gateway-system"
        },
        spec: {
          targetRef: { group: "", kind: "Service", name: "user-backend" },
          retryPolicy: {
            numRetries: 2,
            perTryTimeout: "30s",
            retryOn: ["5xx", "connect-failure", "retriable-4xx"]
          },
          timeout: { request: "60s" },
          circuitBreaker: {
            consecutiveErrors: 5,
            interval: "30s",
            baseEjectionTime: "30s"
          }
        }
      },
      retryPolicy: {
        apiVersion: "gateway.networking.k8s.io/v1alpha2",
        kind: "RetryPolicy",
        metadata: {
          name: "user-retry-policy",
          namespace: "gateway-system"
        },
        spec: {
          targetRef: { group: "gateway.networking.k8s.io", kind: "HTTPRoute", name: "user-profile-route" },
          numRetries: 2,
          perTryTimeout: "30s",
          retryOn: ["5xx", "connect-failure"]
        }
      }
    }
  }
};
