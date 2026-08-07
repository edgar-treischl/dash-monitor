# Copilot Instructions: dash-monitor

Observability backend for the [@edgar-treischl/dash-telemetry](https://github.com/edgar-treischl/dash-telemetry) instrumentation library.

## Project Overview

This is a **Docker Compose-based observability stack** that receives OpenTelemetry data from frontend apps (specifically Vite Module Federation micro frontends) and provides visualization through Grafana.

### Architecture

```
Frontend Apps using @edgar-treischl/dash-telemetry
              ↓
        OTLP over HTTP
              ↓
    OpenTelemetry Collector (localhost:4318)
              ↓
        ┌─────┴─────┐
        ↓           ↓
   Tempo (traces)  Loki (logs)
        └─────┬─────┘
              ↓
    Grafana (dashboards & queries)
```

**Key Components:**
- **OpenTelemetry Collector**: Receives OTLP data, processes, and routes to backends
- **Grafana Tempo**: Distributed tracing backend (stores traces)
- **Grafana Loki**: Log aggregation system
- **Grafana**: Visualization UI (port 3000)

## Docker Compose Commands

### Starting & Stopping

```bash
# Start all services
docker compose up -d

# Stop services (preserve data)
docker compose down

# Stop and remove all data
docker compose down -v
rm -rf data/

# View logs for all services
docker compose logs -f

# View logs for specific service
docker compose logs -f otel-collector
docker compose logs -f tempo
docker compose logs -f loki
docker compose logs -f grafana

# Restart a specific service
docker compose restart otel-collector

# Check service status
docker compose ps
```

### Health Checks

```bash
# Collector health (OTLP HTTP endpoint)
curl http://localhost:4318/v1/traces

# Tempo readiness
curl http://localhost:3200/ready

# Loki readiness
curl http://localhost:3100/ready

# Collector metrics
curl http://localhost:8888/metrics
```

## Configuration Files

### Service Configurations

| File | Purpose | Key Settings |
|------|---------|--------------|
| `docker-compose.yml` | Service orchestration | Port mappings, volume mounts, service dependencies |
| `otel-collector/config.yml` | Collector pipeline | Receivers (OTLP HTTP/gRPC), processors (batch, memory_limiter, resource), exporters (Tempo, Loki, Prometheus) |
| `tempo/config.yml` | Trace storage | Retention: 168h (7 days), max trace size: 5MB |
| `loki/config.yml` | Log storage | Retention: 168h (7 days), max streams per user: 10,000 |
| `grafana/provisioning/datasources/datasources.yml` | Grafana datasources | Pre-configured Tempo, Loki, and Prometheus connections with trace-to-logs correlation |
| `.env.example` | Environment variables | Passwords, retention periods, resource limits, port configurations |

### Port Mappings

| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Grafana UI | HTTP |
| 3100 | Loki | HTTP |
| 3200 | Tempo | HTTP |
| 4317 | OTel Collector | OTLP gRPC |
| 4318 | OTel Collector | OTLP HTTP (primary endpoint for frontend) |
| 8888 | OTel Collector | Internal metrics |
| 8889 | OTel Collector | Prometheus exporter |

## Data Persistence

All data is stored locally in `./data/`:

```
dash-monitor/
├── data/
│   ├── tempo/       # Trace data (auto-created)
│   ├── loki/        # Log data (auto-created)
│   └── grafana/     # Dashboards, users, settings (auto-created)
```

**Important:** The `data/` directory is git-ignored. To reset all telemetry data, run `docker compose down -v && rm -rf data/`.

## Expected Data Formats

### Context from dash-telemetry

All incoming telemetry automatically includes these attributes:

```js
{
  "service.name": "shell" | "{mfe-name}-mfe",
  "service.version": "1.5.0",
  "service.namespace": "dash-telemetry",
  "mfe": "orders",              // MFE identifier
  "mfe.version": "2.3.1",        // MFE version
  "shell.version": "1.5.0",      // Shell app version
  "user.id": "user-123",
  "tenant": "acme-corp",
  "environment": "development" | "staging" | "production",
  "route": "/orders/42",
  "session.id": "sess-abc123"
}
```

### Trace Attributes (Tempo)

Traces include:
- Application startup spans
- Page/route navigation
- Remote MFE loading (Module Federation)
- React component rendering
- HTTP requests
- Custom business operations

### Log Fields (Loki)

Logs include:
- Error logs (uncaught exceptions, promise rejections, React Error Boundary errors)
- MFE load failures
- API failures
- Performance metrics (Core Web Vitals: LCP, CLS, INP, FCP, TTFB)

### Metrics (Prometheus)

Exposed by OTel Collector at `http://localhost:8889/metrics`:
- `dash_telemetry_lcp_seconds` - Largest Contentful Paint
- `dash_telemetry_cls_ratio` - Cumulative Layout Shift
- `dash_telemetry_inp_milliseconds` - Interaction to Next Paint
- `dash_telemetry_errors_total` - Error counts by type and MFE
- `dash_telemetry_mfe_load_duration_seconds` - MFE load times

## Querying Data

### TraceQL (Tempo)

```traceql
# Find traces with errors
{ status = error }

# Find slow operations
{ duration > 1s }

# Find traces for specific MFE
{ resource.service.name = "orders-mfe" }

# Find traces by user
{ resource.user.id = "user-123" }

# Find MFE load failures
{ span.name =~ "Remote MFE Loading.*" && status = error }
```

### LogQL (Loki)

```logql
# All error logs
{level="error"}

# Errors from specific MFE
{mfe="orders"} |= "error"

# User-specific errors
{app="shell"} | json | user_id="user-123" | level="error"

# MFE load failures
{app="shell"} |~ "Failed to load remote" | json | mfe="orders"
```

### PromQL (Prometheus)

```promql
# 95th percentile LCP by MFE
histogram_quantile(0.95, rate(dash_telemetry_lcp_seconds_bucket[5m]))

# Error rate by MFE
rate(dash_telemetry_errors_total[5m])

# Average MFE load time
avg(dash_telemetry_mfe_load_duration_seconds) by (mfe)
```

## Modifying Configurations

### Changing Retention Periods

Edit `tempo/config.yml`:
```yaml
compactor:
  compaction:
    block_retention: 336h  # 14 days (was 168h)
```

Edit `loki/config.yml`:
```yaml
limits_config:
  retention_period: 336h  # 14 days (was 168h)
```

Then restart: `docker compose restart tempo loki`

### Adjusting Resource Limits

Edit `otel-collector/config.yml`:
```yaml
processors:
  memory_limiter:
    check_interval: 1s
    limit_mib: 1024      # Increase from 512
    spike_limit_mib: 256  # Increase from 128
```

Then restart: `docker compose restart otel-collector`

### Adding CORS Origins

Edit `otel-collector/config.yml`:
```yaml
receivers:
  otlp:
    protocols:
      http:
        cors:
          allowed_origins:
            - "http://localhost:*"
            - "https://your-app.example.com"
```

Then restart: `docker compose restart otel-collector`

## Conventions & Patterns

### Service Naming

- **Shell app**: `service.name = "shell"` or custom name from `telemetry.init({ app: "..." })`
- **MFE apps**: `service.name = "{mfe-name}-mfe"` (automatically set when MFE calls `telemetry.setContext()`)
- **Namespace**: Always `service.namespace = "dash-telemetry"`

### Resource Attributes

The OTel Collector's `resource` processor automatically adds:
- `service.namespace: "dash-telemetry"`
- `deployment.environment` (copied from `environment` attribute)

The `attributes` processor normalizes:
- `url.full` → `http.url`
- `http.request.method` → `http.method`

### Loki Labels

Loki uses these attributes as indexed labels (from `otel-collector/config.yml`):

**Resource labels:**
- `service.name` → `service_name`
- `service.namespace` → `service_namespace`
- `deployment.environment` → `environment`

**Attribute labels:**
- `level` (error, warn, info, debug)
- `mfe` (MFE identifier)

**Record labels:**
- `traceID` (for trace-to-logs correlation)

### Grafana Datasource Correlation

Tempo → Loki trace-to-logs correlation is pre-configured:
- Clicking a trace in Tempo shows related logs in Loki (filtered by `traceID`)
- Uses tags: `service.name`, `mfe`
- Time window: ±1 hour around span

Loki → Tempo log-to-trace correlation:
- Extracts `traceID` from logs using regex: `"traceID":"(\w+)"`
- Click `traceID` in logs to jump to trace in Tempo

## Troubleshooting

### No Data Appearing in Grafana

1. **Check collector is receiving data:**
   ```bash
   docker compose logs otel-collector | grep -i "traces"
   ```

2. **Verify frontend is configured correctly:**
   - Frontend should send to `http://localhost:4318` (OTLP HTTP)
   - Check browser DevTools console for OTLP export errors

3. **Test collector endpoint:**
   ```bash
   curl -X POST http://localhost:4318/v1/traces \
     -H "Content-Type: application/json" \
     -d '{"resourceSpans":[]}'
   ```

4. **Check Tempo is receiving:**
   ```bash
   docker compose logs tempo | grep -i "trace"
   ```

### Collector Not Starting

- **Port conflict:** Check if 4318 is in use: `lsof -i :4318`
- **Config syntax error:** Validate with `docker compose config`
- **View logs:** `docker compose logs otel-collector`

### High Memory Usage

Reduce batch sizes in `otel-collector/config.yml`:
```yaml
processors:
  batch:
    timeout: 5s          # Reduce from 10s
    send_batch_size: 512  # Reduce from 1024
```

### CORS Errors in Browser

Add your frontend origin to `otel-collector/config.yml` (see "Adding CORS Origins" above).

## Integration with Frontend

Frontend apps using `@edgar-treischl/dash-telemetry` need:

```bash
# .env.development (frontend app)
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

The telemetry library sends data to the collector's OTLP HTTP endpoint (port 4318).

## Related Documentation

- **dash-telemetry GitHub**: https://github.com/edgar-treischl/dash-telemetry
- **CONTEXT.md**: Detailed explanation of dash-telemetry architecture and API
- **OpenTelemetry Collector**: https://opentelemetry.io/docs/collector/
- **Grafana Tempo**: https://grafana.com/docs/tempo/
- **Grafana Loki**: https://grafana.com/docs/loki/
