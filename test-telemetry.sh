#!/bin/bash

# Simple curl-based test script to send telemetry data
# Usage: ./test-telemetry.sh

set -e

OTEL_ENDPOINT="http://localhost:4318"
TRACE_ID=$(openssl rand -hex 16)
SPAN_ID=$(openssl rand -hex 8)
TIMESTAMP=$(date +%s%N)

echo "🚀 Sending synthetic telemetry data to OTel Collector..."
echo ""

# Send a simple trace
echo "📊 Sending trace..."
curl -X POST "${OTEL_ENDPOINT}/v1/traces" \
  -H "Content-Type: application/json" \
  -d "{
  \"resourceSpans\": [{
    \"resource\": {
      \"attributes\": [
        {\"key\": \"service.name\", \"value\": {\"stringValue\": \"shell\"}},
        {\"key\": \"service.version\", \"value\": {\"stringValue\": \"1.5.0\"}},
        {\"key\": \"service.namespace\", \"value\": {\"stringValue\": \"dash-telemetry\"}},
        {\"key\": \"mfe\", \"value\": {\"stringValue\": \"orders\"}},
        {\"key\": \"user.id\", \"value\": {\"stringValue\": \"user-test-123\"}},
        {\"key\": \"tenant\", \"value\": {\"stringValue\": \"test-tenant\"}},
        {\"key\": \"environment\", \"value\": {\"stringValue\": \"development\"}}
      ]
    },
    \"scopeSpans\": [{
      \"scope\": {\"name\": \"dash-telemetry\", \"version\": \"1.0.0\"},
      \"spans\": [{
        \"traceId\": \"${TRACE_ID}\",
        \"spanId\": \"${SPAN_ID}\",
        \"name\": \"Remote MFE Loading: orders\",
        \"kind\": 1,
        \"startTimeUnixNano\": \"${TIMESTAMP}\",
        \"endTimeUnixNano\": \"$((TIMESTAMP + 250000000))\",
        \"attributes\": [
          {\"key\": \"mfe.name\", \"value\": {\"stringValue\": \"orders\"}},
          {\"key\": \"operation\", \"value\": {\"stringValue\": \"mfe.load\"}}
        ],
        \"status\": {\"code\": 1}
      }]
    }]
  }]
}" -s -o /dev/null -w "HTTP %{http_code}\n"

echo "✅ Trace sent (Trace ID: ${TRACE_ID})"
echo ""

# Send a simple log
echo "📝 Sending log..."
curl -X POST "${OTEL_ENDPOINT}/v1/logs" \
  -H "Content-Type: application/json" \
  -d "{
  \"resourceLogs\": [{
    \"resource\": {
      \"attributes\": [
        {\"key\": \"service.name\", \"value\": {\"stringValue\": \"orders-mfe\"}},
        {\"key\": \"service.namespace\", \"value\": {\"stringValue\": \"dash-telemetry\"}},
        {\"key\": \"mfe\", \"value\": {\"stringValue\": \"orders\"}},
        {\"key\": \"environment\", \"value\": {\"stringValue\": \"development\"}}
      ]
    },
    \"scopeLogs\": [{
      \"scope\": {\"name\": \"dash-telemetry\", \"version\": \"1.0.0\"},
      \"logRecords\": [{
        \"timeUnixNano\": \"${TIMESTAMP}\",
        \"severityNumber\": 17,
        \"severityText\": \"error\",
        \"body\": {\"stringValue\": \"Test error from curl script\"},
        \"attributes\": [
          {\"key\": \"level\", \"value\": {\"stringValue\": \"error\"}},
          {\"key\": \"mfe\", \"value\": {\"stringValue\": \"orders\"}},
          {\"key\": \"traceID\", \"value\": {\"stringValue\": \"${TRACE_ID}\"}}
        ],
        \"traceId\": \"${TRACE_ID}\",
        \"spanId\": \"${SPAN_ID}\"
      }]
    }]
  }]
}" -s -o /dev/null -w "HTTP %{http_code}\n"

echo "✅ Log sent"
echo ""
echo "✨ All telemetry data sent successfully!"
echo ""
echo "📌 Next steps:"
echo "   1. Open Grafana: http://localhost:3000"
echo "   2. Go to Explore → Tempo"
echo "   3. Search for trace ID: ${TRACE_ID}"
echo "   4. Go to Explore → Loki"
echo "   5. Query: {job=\"dash-telemetry/orders-mfe\"}"
