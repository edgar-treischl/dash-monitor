# Context: dash-telemetry Package

This backend is designed specifically for the **[@edgar-treischl/dash-telemetry](https://github.com/edgar-treischl/dash-telemetry)** package.

## What is dash-telemetry?

`@edgar-treischl/dash-telemetry` is a centralized OpenTelemetry instrumentation library for Vite Module Federation micro frontends. It provides:

- **Single initialization** in the Shell app only
- **Vendor-neutral** OpenTelemetry standard (swap backends without code changes)
- **Simple API** for consuming MFE applications
- **Automatic context propagation** across all MFEs
- **No direct OpenTelemetry usage** in application code

## Architecture Pattern

### Shared Package Pattern

```
Shell App (Dash-Demo)
    ↓ (initializes once)
@edgar-treischl/dash-telemetry (shared package)
    ↓ (shared providers)
┌───┴───┬────────┬─────────┐
│       │        │         │
Orders  Inventory  ...  MFE_N
```

### Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **Shell** | Initialize telemetry once with `telemetry.init()` |
| **MFEs** | Register metadata with `telemetry.setContext()`, use public API |
| **Shared Package** | Centralized instrumentation, single OpenTelemetry SDK instance |

### Data Flow

```
MFE App Code
    ↓
telemetry.trackEvent() / telemetry.captureException()
    ↓
@edgar-treischl/dash-telemetry (API layer)
    ↓
OpenTelemetry SDK + web-vitals
    ↓
OTLP HTTP Exporter
    ↓
THIS BACKEND (dash-monitor)
    ↓
Tempo (traces) + Loki (logs)
    ↓
Grafana (visualization)
```

## Public API Reference

MFEs use these methods (never directly importing OpenTelemetry):

### Initialization (Shell Only)
```ts
telemetry.init(config)
```

### Context Management (MFEs)
```ts
telemetry.setContext(context)  // On mount
telemetry.clearContext()        // On unmount
```

### Error Tracking
```ts
telemetry.captureError(error)
telemetry.captureException(error, metadata?)
```

### Events & Business Metrics
```ts
telemetry.trackEvent(name, properties?)
```

### Distributed Tracing
```ts
telemetry.startSpan(name, attributes?)
telemetry.endSpan(span)
telemetry.measure(name, fn)  // Auto-span creation
```

### User Context
```ts
telemetry.setUser(userId, email?, attributes?)
```

## What Gets Collected

### Automatic Instrumentation

**Errors:**
- Uncaught exceptions
- Unhandled promise rejections
- React Error Boundary errors
- Failed MFE remote module loads
- API failures

**Performance:**
- Core Web Vitals (LCP, CLS, INP, FCP, TTFB)
- Page load and navigation timing
- MFE remote entry download times
- Module Federation load times
- Lazy component mount times
- API request latency
- Long tasks (>50ms)

**Traces:**
- Application startup
- Page/route navigation
- Remote MFE loading
- React component rendering
- HTTP requests (auto-instrumented)
- Custom business operations

### Automatic Context

Every telemetry event includes:
- `shellVersion` - Shell app version
- `mfe` - MFE identifier (from `setContext`)
- `mfeVersion` - MFE version (from `setContext`)
- `route` - Current application route
- `userId` - User identifier (from `setUser`)
- `tenant` - Tenant/organization ID
- `environment` - `development`/`staging`/`production`
- `browser` - User agent info
- `sessionId` - Browser session ID

Applications **never manually pass** this context; it's propagated automatically.

## Expected Data Schemas

### Trace Attributes (Tempo)

```js
{
  "service.name": "shell" | "orders-mfe" | ...,
  "service.version": "1.5.0",
  "service.namespace": "dash-telemetry",
  "mfe": "orders",
  "mfe.version": "2.3.1",
  "shell.version": "1.5.0",
  "user.id": "user-123",
  "tenant": "acme-corp",
  "environment": "production",
  "route": "/orders/42",
  "session.id": "sess-abc123"
}
```

### Log Fields (Loki)

```js
{
  "app": "shell",
  "level": "error",
  "message": "Failed to load remote module",
  "mfe": "orders",
  "version": "2.3.1",
  "traceID": "abc123...",
  "error.type": "ModuleFederationError",
  "error.stack": "...",
  "context": { ... }
}
```

### Metrics (Prometheus via OTel Collector)

```
dash_telemetry_lcp_seconds{mfe="orders", environment="production"}
dash_telemetry_cls_ratio{mfe="orders", environment="production"}
dash_telemetry_inp_milliseconds{mfe="orders", environment="production"}
dash_telemetry_errors_total{mfe="orders", type="api_failure"}
dash_telemetry_mfe_load_duration_seconds{mfe="orders", remote="http://..."}
```

## Typical Queries

### TraceQL (Tempo)

```traceql
# Find all traces with errors
{ status = error }

# Find slow page navigations
{ name = "Page Navigation" && duration > 2s }

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

# Trace specific user's errors
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

## Integration with Frontend

### Environment Configuration

```bash
# .env.development (local development)
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# .env.production
VITE_OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com
```

### Shell Initialization

```ts
import { telemetry } from '@edgar-treischl/dash-telemetry';

// Called once during Shell startup
telemetry.init({
  app: "shell",
  version: import.meta.env.VITE_APP_VERSION,
  environment: import.meta.env.MODE,  // 'development' | 'production'
  serviceName: "dash-shell"
});

// Set user context after authentication
telemetry.setUser(user.id, user.email, {
  tenant: user.tenant,
  role: user.role
});
```

### MFE Usage

```ts
import { telemetry } from '@edgar-treischl/dash-telemetry';
import { useEffect } from 'react';

export function OrdersMFE() {
  useEffect(() => {
    // Register MFE context on mount
    telemetry.setContext({
      mfe: 'orders',
      version: '2.3.1'
    });

    // Cleanup on unmount
    return () => telemetry.clearContext();
  }, []);

  const handleCheckout = async () => {
    try {
      const result = await telemetry.measure('checkout-process', async () => {
        return await api.checkout(cart);
      });

      telemetry.trackEvent('checkout-completed', {
        amount: result.value.total,
        itemCount: cart.items.length
      });
    } catch (error) {
      telemetry.captureException(error, {
        operation: 'checkout',
        step: 'payment'
      });
    }
  };

  return <div>...</div>;
}
```

## Why This Architecture?

### Problems It Solves

1. **Duplicate SDK Initialization**: Without centralization, each MFE would initialize its own OpenTelemetry instance, causing conflicts and wasted resources
2. **Inconsistent Context**: Manual context passing leads to missing or inconsistent metadata across MFEs
3. **Vendor Lock-in**: Direct use of vendor SDKs (Sentry, DataDog) makes migration expensive
4. **API Complexity**: Developers don't need to learn OpenTelemetry internals, just the simple public API

### Benefits

- ✅ Single OpenTelemetry SDK instance shared across all MFEs
- ✅ Consistent telemetry data with automatic context
- ✅ Vendor-neutral (swap backends without code changes)
- ✅ Simple API for application teams
- ✅ Scales as new MFEs are added (no per-MFE backend setup)

## Further Reading

- **dash-telemetry GitHub**: https://github.com/edgar-treischl/dash-telemetry
- **API Reference**: `@edgar-treischl/dash-telemetry/API_REFERENCE.md`
- **Implementation Guide**: `@edgar-treischl/dash-telemetry/docs/03_IMPLEMENTATION.md`
