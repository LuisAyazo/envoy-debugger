#!/bin/bash
# Deploy to Kubernetes
set -e

echo "🚀 Deploying Gateway Debugger to Kubernetes"
echo "==========================================="

# Get context
CONTEXT=$(kubectl config current-context)
echo "📍 Current context: $CONTEXT"
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Create namespace and deploy
echo "📦 Creating namespace..."
kubectl apply -f k8s/namespace.yaml

echo "📦 Creating RBAC..."
kubectl apply -f k8s/rbac.yaml

echo "📦 Creating ConfigMaps..."
kubectl apply -f k8s/configmap.yaml

echo "📦 Deploying services..."
kubectl apply -f k8s/service.yaml

echo "📦 Deploying applications..."
kubectl apply -f k8s/deployment.yaml

# Wait for rollout
echo "⏳ Waiting for rollout..."
kubectl rollout status deployment/gateway-debugger-backend -n gateway-debugger
kubectl rollout status deployment/gateway-debugger-frontend -n gateway-debugger

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📚 Access the dashboard:"
echo "   kubectl port-forward -n gateway-debugger svc/gateway-debugger 3000:3000"
echo "   open http://localhost:3000"
echo ""
echo "📊 Backend API:"
echo "   kubectl port-forward -n gateway-debugger svc/gateway-debugger-backend 8080:8080"
echo "   curl http://localhost:8080/api/v1/traces"
