# Loki Integration - Working Solution

## Problem
OTel Collector v0.91.0 had incompatible Loki exporter configuration. Various config keys (`labels`, `format`, `tenant_id`) were rejected.

## Solution
**Upgraded OTel Collector** from v0.91.0 → v0.114.0

### Changes Made

1. **docker-compose.yml**
   ```yaml
   image: otel/opentelemetry-collector-contrib:0.114.0
   ```

2. **otel-collector/config.yml**
   ```yaml
   exporters:
     loki:
       endpoint: http://loki:3100/loki/api/v1/push
   ```

3. **Pipeline configuration** (unchanged)
   ```yaml
   logs:
     receivers: [otlp]
     processors: [memory_limiter, resource, attributes, batch]
     exporters: [loki, debug]
   ```

## Label Format

The Loki exporter automatically creates labels using this format:
- **job**: `{service.namespace}/{service.name}`
  - Example: `dash-telemetry/orders-mfe`
  - Example: `dash-telemetry/shell`
- **level**: `error`, `info`, `warn`, `debug`
- **exporter**: `OTLP`

## Query Examples

### LogQL Queries (Loki)

```logql
# Query all logs from orders MFE
{job="dash-telemetry/orders-mfe"}

# Query error logs
{level="error"}

# Query all dash-telemetry services
{job=~"dash-telemetry/.*"}

# Filter by content
{job="dash-telemetry/orders-mfe"} |= "Network timeout"

# Parse JSON and filter
{level="error"} | json | mfe="orders"
```

### Log Structure

Each log entry contains JSON with:
```json
{
  "body": "Failed to fetch order details: Network timeout",
  "traceid": "f5e89b0345bb2358d0c095d84ab633b6",
  "spanid": "0c3ccd78b25adcb6",
  "severity": "error",
  "attributes": {
    "error.message": "Network timeout",
    "error.type": "NetworkError",
    "mfe": "orders",
    "traceID": "f5e89b0345bb2358d0c095d84ab633b6"
  },
  "resources": {
    "deployment.environment": "development",
    "environment": "development",
    "mfe": "orders",
    "service.name": "orders-mfe",
    "service.namespace": "dash-telemetry",
    "service.version": "2.3.1",
    "tenant": "test-tenant",
    "user.id": "user-test-123"
  }
}
```

## Verification

Check metrics to confirm logs are being exported:
```bash
curl -s http://localhost:8888/metrics | grep "otelcol_exporter_sent_log_records"
```

Should show:
```
otelcol_exporter_sent_log_records{exporter="loki",...} <number>
```

## Testing

Run test script:
```bash
node test-telemetry.js
```

Query in Grafana:
1. Go to **Explore** → **Loki**
2. Use query: `{job="dash-telemetry/orders-mfe"}`
3. Click on any log line to expand JSON
4. Click `traceID` to jump to trace in Tempo
