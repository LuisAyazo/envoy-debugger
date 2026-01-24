#!/bin/bash
# View logs from the debugger
set -e

COMPONENT=${1:-backend}
NAMESPACE="gateway-debugger"

if [ "$COMPONENT" = "backend" ]; then
    echo "📋 Backend logs..."
    kubectl logs -n $NAMESPACE -l app=gateway-debugger,component=backend -f
elif [ "$COMPONENT" = "frontend" ]; then
    echo "📋 Frontend logs..."
    kubectl logs -n $NAMESPACE -l app=gateway-debugger,component=frontend -f
else
    echo "Usage: $0 [backend|frontend]"
    exit 1
fi
