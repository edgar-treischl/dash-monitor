# Dash Monitor - Observability Stack

Complete monitoring infrastructure for the `@edgar-treischl/dash-telemetry` instrumentation library.

## About dash-telemetry

This backend receives telemetry data from **[@edgar-treischl/dash-telemetry](https://github.com/edgar-treischl/dash-telemetry)**, a centralized OpenTelemetry SDK for Vite Module Federation micro frontends.

### Key Concepts

**dash-telemetry** uses a **shared package pattern**:

- **Shell App** (Dash-Demo): Initializes telemetry once, provides shared OpenTelemetry providers
- **Micro Frontends (MFEs)**: Register their metadata and use the public API without initializing OpenTelemetry directly
- **Shared Package**: Centralized instrumentation for errors, performance (Core Web Vitals), and distributed tracing

### What Gets Sent Here

From frontend apps using `@edgar-treischl/dash-telemetry`:

**Errors:**
- Uncaught exceptions
- Unhandled promise rejections
- React Error Boundary errors
- Failed MFE remote module loading
- Failed API requests

**Performance:**
- Core Web Vitals (LCP, CLS, INP, FCP, TTFB)
- MFE remote entry download times
- Module Federation load times
- API latency
- Long tasks

**Traces:**
- Application startup spans
- Page navigation spans
- Remote MFE loading spans
- React rendering spans
- HTTP request spans
- Business operation spans

All telemetry includes automatic context: `shellVersion`, `mfe`, `mfeVersion`, `route`, `userId`, `tenant`, `environment`, `sessionId`.

## Architecture

```
Shell App (Dash-Demo) + MFE Apps
              ↓
   @edgar-treischl/dash-telemetry
              ↓
    OpenTelemetry SDK + web-vitals
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
        Grafana (dashboards)
```

## Stack Components

| Component | Purpose | Port | Storage |
|-----------|---------|------|---------|
| **OpenTelemetry Collector** | Receives OTLP data, processes, and routes to backends | 4318 (HTTP), 4317 (gRPC) | - |
| **Grafana Tempo** | Distributed tracing backend | 3200 (HTTP), 9095 (gRPC) | `./data/tempo` |
| **Grafana Loki** | Log aggregation system | 3100 | `./data/loki` |
| **Grafana** | Visualization and dashboards | 3000 | `./data/grafana` |

## Prerequisites

- Docker Desktop or Docker Engine + Docker Compose
- At least 4GB RAM available for Docker
- Ports 3000, 3100, 3200, 4317, 4318 available

## Quick Start

### 1. Start the Stack

```bash
cd dash-monitor
docker compose up -d
```

### 2. Verify Services

```bash
# Check all services are running
docker compose ps

# Check collector is receiving data
curl http://localhost:4318/v1/traces

# Check Tempo is ready
curl http://localhost:3200/ready

# Check Loki is ready
curl http://localhost:3100/ready
```

### 3. Test with Sample Data (Optional)

Send synthetic telemetry to test the stack without needing a real frontend:

```bash
# Using Node.js (more realistic data)
node test-telemetry.js

# Or using bash/curl (simpler)
./test-telemetry.sh
```

Both scripts send:
- **Traces**: MFE loading and navigation spans
- **Logs**: Info and error logs with trace correlation

The output includes a trace ID you can search for in Grafana.

### 4. Access Grafana

Open [http://localhost:3000](http://localhost:3000)

- **Username**: `admin`
- **Password**: `admin` (you'll be prompted to change on first login)

**Query Examples:**

In **Explore → Tempo** (traces):
```traceql
{ resource.mfe = "orders" }
{ status = error }
{ duration > 100ms }
```

In **Explore → Loki** (logs):
```logql
{job="dash-telemetry/orders-mfe"}
{level="error"}
{level="info"}
{job=~"dash-telemetry/.*"} |= "error"
```

**Tip**: The `job` label format is `{namespace}/{service-name}`, e.g., `dash-telemetry/orders-mfe` or `dash-telemetry/shell`.

In **Explore → Prometheus** (metrics):
```promql
dash_telemetry_errors_total
rate(dash_telemetry_errors_total[5m])
```

### 5. Configure Your Frontend App

In your Vite/React app using `@edgar-treischl/dash-telemetry`:

#### Install the Package

```bash
npm install @edgar-treischl/dash-telemetry
```

#### Configure Environment

```bash
# .env.local or .env.development
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

#### Shell App Initialization (Once)

```ts
// main.tsx or App.tsx in your Shell app
import { telemetry } from '@edgar-treischl/dash-telemetry';

telemetry.init({
  app: "shell",
  version: "1.0.0",
  environment: "development"
});
```

#### MFE Registration (Each MFE)

```ts
// In your MFE component
import { telemetry } from '@edgar-treischl/dash-telemetry';
import { useEffect } from 'react';

function MyMFE() {
  useEffect(() => {
    telemetry.setContext({
      mfe: 'orders',
      version: '2.3.1'
    });

    return () => telemetry.clearContext();
  }, []);

  return <div>Your MFE content</div>;
}
```

#### Track Events

```ts
// Track business events
telemetry.trackEvent('checkout-completed', { amount: 99.99 });

// Capture errors
try {
  // operation
} catch (error) {
  telemetry.captureException(error, { operation: 'checkout' });
}

// Measure performance
const result = await telemetry.measure('api-call', async () => {
  return await fetch('/api/orders').then(r => r.json());
});
```

Start sending telemetry data and view it in Grafana!

## Services Management

### Start Services
```bash
docker compose up -d
```

### Stop Services
```bash
docker compose down
```

### Stop and Remove Data
```bash
docker compose down -v
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f otel-collector
docker compose logs -f tempo
docker compose logs -f loki
docker compose logs -f grafana
```

### Restart a Service
```bash
docker compose restart otel-collector
```

## Data Persistence

All data is stored in the `./data` directory:

```
dash-monitor/
├── data/
│   ├── tempo/       # Trace data
│   ├── loki/        # Log data
│   └── grafana/     # Dashboards, users, settings
```

To reset all data:
```bash
docker compose down -v
rm -rf data/
```

## Configuration Files

### OpenTelemetry Collector
- **File**: `otel-collector/config.yml`
- **Purpose**: Receives OTLP data, batches, and exports to Tempo/Loki
- **Receivers**: OTLP HTTP (4318), OTLP gRPC (4317)
- **Exporters**: Tempo, Loki, Debug (console logs)

### Tempo
- **File**: `tempo/config.yml`
- **Purpose**: Stores and queries distributed traces
- **Storage**: Local filesystem (production would use S3/GCS)
- **Retention**: 7 days (configurable)

### Loki
- **File**: `loki/config.yml`
- **Purpose**: Stores and queries logs
- **Storage**: Local filesystem
- **Retention**: 7 days (configurable)

### Grafana
- **Datasources**: `grafana/provisioning/datasources/datasources.yml`
- **Dashboards**: `grafana/provisioning/dashboards/` (auto-loaded)

## Grafana Dashboards

Pre-configured dashboard:

- **Dash Monitor**: Trace visualization and exploration

Access at: [http://localhost:3000/dashboards](http://localhost:3000/dashboards)

## Querying Data

### Tempo (Traces)

Explore traces in Grafana:
1. Go to **Explore**
2. Select **Tempo** datasource
3. Use TraceQL queries:

```traceql
# Find traces with errors
{ status = error }

# Find slow traces
{ duration > 1s }

# Find traces for specific MFE
{ resource.service.name = "orders-mfe" }
```

### Loki (Logs)

Query logs in Grafana:
1. Go to **Explore**
2. Select **Loki** datasource
3. Use LogQL queries:

```logql
# All logs from a specific app
{app="shell"}

# Error logs only
{app="orders-mfe"} |= "error"

# Logs with specific context
{app="shell"} | json | mfe="orders"
```

## Production Deployment

For production use:

### 1. Use External Storage
- **Tempo**: S3, GCS, or Azure Blob Storage
- **Loki**: S3, GCS, or Azure Blob Storage
- **Grafana**: PostgreSQL for metadata

### 2. Scale Collectors
Deploy OTel Collector as a DaemonSet (K8s) or sidecar

### 3. Add Authentication
- Enable Grafana OAuth/LDAP
- Secure collector endpoints with API keys
- Use TLS for all communications

### 4. Resource Limits
```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
    reservations:
      cpus: '1'
      memory: 1G
```

### 5. High Availability
- Run multiple collector instances (load balanced)
- Deploy Tempo/Loki in clustered mode
- Use managed Grafana (Grafana Cloud)

## Monitoring the Monitors

The OTel Collector exposes metrics at `http://localhost:8888/metrics`

Monitor collector health:
```bash
curl http://localhost:8888/metrics | grep otelcol_receiver
```

## Troubleshooting

### No Data in Grafana?

1. **Check collector is running**:
   ```bash
   docker compose logs otel-collector
   ```

2. **Verify frontend is sending data**:
   Check browser console for OTLP export errors

3. **Test collector endpoint**:
   ```bash
   curl -X POST http://localhost:4318/v1/traces \
     -H "Content-Type: application/json" \
     -d '{"resourceSpans":[]}'
   ```

4. **Check Tempo is receiving traces**:
   ```bash
   docker compose logs tempo | grep -i "trace"
   ```

### Collector Not Starting?

- Check port conflicts: `lsof -i :4318`
- Validate config: `docker compose config`
- Check logs: `docker compose logs otel-collector`

### High Memory Usage?

Reduce batch sizes in `otel-collector/config.yml`:
```yaml
processors:
  batch:
    timeout: 5s
    send_batch_size: 512  # Reduce from 1024
```

## Environment Variables

Configure via `.env` file in `dash-monitor/`:

```bash
# Grafana
GRAFANA_ADMIN_PASSWORD=your-secure-password

# Data retention (days)
TEMPO_RETENTION=7d
LOKI_RETENTION=7d

# Resource limits
COLLECTOR_MEMORY_LIMIT=2G
TEMPO_MEMORY_LIMIT=2G
LOKI_MEMORY_LIMIT=2G
```

## Alternative: SigNoz (All-in-One)

If you prefer a single integrated solution instead of separate Tempo + Loki + Grafana:

```bash
# Replace this stack with SigNoz
git clone https://github.com/SigNoz/signoz.git
cd signoz/deploy
docker compose up -d
```

Access at `http://localhost:3301`

## Related Projects

- **[@edgar-treischl/dash-telemetry](https://github.com/edgar-treischl/dash-telemetry)** - The frontend instrumentation library that sends data to this backend

## Support & Documentation

### dash-telemetry (Frontend SDK)
- **GitHub**: https://github.com/edgar-treischl/dash-telemetry
- **npm**: `@edgar-treischl/dash-telemetry`

### Backend Components
- **OpenTelemetry**: https://opentelemetry.io/docs/
- **Grafana Tempo**: https://grafana.com/docs/tempo/
- **Grafana Loki**: https://grafana.com/docs/loki/
- **OTel Collector**: https://opentelemetry.io/docs/collector/

## License

MIT
