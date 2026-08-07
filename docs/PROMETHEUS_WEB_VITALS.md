# Prometheus & Web Vitals Monitoring

This document describes the Prometheus integration and Web Vitals monitoring added to `dash-monitor`, and what the `dash-telemetry` SDK needs to send for the metrics to appear.

---

## What Was Added

### 1. Prometheus Service (`docker-compose.yml`)

A dedicated Prometheus container was added to the stack:

```
prom/prometheus:v2.51.0  →  http://localhost:9090
```

It scrapes `dash_telemetry_*` metrics from the OTel Collector's Prometheus exporter every 15 seconds and stores them with a 7-day retention. Data is persisted in `./data/prometheus`.

Previously, the Grafana Prometheus datasource pointed directly at the OTel Collector's raw exporter (`otel-collector:8889`). It now points at the Prometheus server (`prometheus:9090`), which enables proper PromQL range queries, alerting, and historical data.

### 2. Prometheus Scrape Config (`prometheus/prometheus.yml`)

Two scrape jobs:
- `otel-collector-metrics` — scrapes `dash_telemetry_*` metrics from port 8889 (exported by the OTel Collector)
- `otel-collector-internal` — scrapes the collector's own health metrics from port 8888

### 3. Web Vitals Dashboard (`grafana/dashboards/web-vitals.json`)

A provisioned Grafana dashboard with six panels covering all five Core Web Vitals:

| Panel | Metric | Unit | Good / Needs Improvement / Poor |
|-------|--------|------|----------------------------------|
| LCP p75 | Largest Contentful Paint | seconds | < 2.5s / < 4s / ≥ 4s |
| INP p75 | Interaction to Next Paint | milliseconds | < 200ms / < 500ms / ≥ 500ms |
| CLS latest | Cumulative Layout Shift | score | < 0.1 / < 0.25 / ≥ 0.25 |
| FCP p75 | First Contentful Paint | seconds | < 1.8s / < 3s / ≥ 3s |
| TTFB p75 | Time to First Byte | seconds | < 0.8s / < 1.8s / ≥ 1.8s |
| Summary | LCP + CLS + INP (all MFEs) | mixed | color-coded stat tiles |

All time-series panels break down values per `mfe` label (e.g. `orders`, `inventory`).

**PromQL note:** Queries use `histogram_quantile` directly on raw buckets (no `rate()`). This works correctly for both single-shot test data and continuous frontend data sent as cumulative histograms.

### 4. Test Files

| File | Purpose |
|------|---------|
| `test-web-vitals.js` | Sends synthetic Web Vitals via OTLP for two MFEs (`orders`, `inventory`) |
| `test-telemetry.sh` | Extended — now also sends Web Vitals after trace + log |

Run either to populate the dashboard with test data:
```bash
node test-web-vitals.js
# or
./test-telemetry.sh
```

---

## Expected Metric Names in Prometheus

The OTel Collector's Prometheus exporter applies the `dash_telemetry` namespace prefix (configured in `otel-collector/config.yml`). After a metric named `lcp` arrives via OTLP, it becomes:

| OTLP metric name | Prometheus metric name | Type |
|------------------|------------------------|------|
| `lcp` | `dash_telemetry_lcp_seconds_bucket/count/sum` | histogram |
| `inp` | `dash_telemetry_inp_milliseconds_bucket/count/sum` | histogram |
| `cls` | `dash_telemetry_cls_ratio` | gauge |
| `fcp` | `dash_telemetry_fcp_seconds_bucket/count/sum` | histogram |
| `ttfb` | `dash_telemetry_ttfb_seconds_bucket/count/sum` | histogram |

---

## What to Add in `dash-telemetry` SDK

The SDK needs to report Web Vitals as OpenTelemetry **metrics** and send them to the collector via OTLP. The recommended approach is to use the [`web-vitals`](https://github.com/GoogleChrome/web-vitals) library as the measurement source and the OTel JS SDK metrics API as the transport.

### Dependencies

```bash
npm install web-vitals @opentelemetry/sdk-metrics @opentelemetry/exporter-metrics-otlp-http
```

### Instruments to Create

Create these instruments once, on `telemetry.init()`:

```ts
import { getMeter } from './otel-setup' // your existing MeterProvider

const meter = getMeter('dash-telemetry')

// Histograms — for distribution / percentile queries
const lcpHistogram  = meter.createHistogram('lcp',  { unit: 's',  description: 'Largest Contentful Paint' })
const inpHistogram  = meter.createHistogram('inp',  { unit: 'ms', description: 'Interaction to Next Paint' })
const fcpHistogram  = meter.createHistogram('fcp',  { unit: 's',  description: 'First Contentful Paint' })
const ttfbHistogram = meter.createHistogram('ttfb', { unit: 's',  description: 'Time to First Byte' })

// Gauge — CLS is a cumulative score, not a distribution
const clsGauge = meter.createObservableGauge('cls', { unit: '1', description: 'Cumulative Layout Shift' })
```

### Reporting Web Vitals

```ts
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals'

// Attributes shared across all vitals — match what the rest of the SDK sends
const attrs = {
  mfe:         context.mfe,         // e.g. 'orders'
  environment: context.environment, // e.g. 'production'
  route:       context.route,       // e.g. '/orders/42'
}

onLCP(({ value })  => lcpHistogram.record(value / 1000, attrs))  // ms → s
onINP(({ value })  => inpHistogram.record(value, attrs))          // already ms
onFCP(({ value })  => fcpHistogram.record(value / 1000, attrs))   // ms → s
onTTFB(({ value }) => ttfbHistogram.record(value / 1000, attrs))  // ms → s

// CLS: update the observable gauge via a callback
let clsValue = 0
onCLS(({ value }) => { clsValue = value })
clsGauge.addCallback(result => result.observe(clsValue, attrs))
```

### MeterProvider Setup (if not already present)

```ts
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'

const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: `${VITE_OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
      }),
      exportIntervalMillis: 30_000, // flush every 30s
    }),
  ],
})
```

> **Tip:** LCP and CLS are only finalized when the page is hidden/unloaded. Pass `{ reportAllChanges: false }` (the default) to `onLCP` / `onCLS` to get the final value, and flush the exporter in a `visibilitychange` handler to ensure the last batch is sent before the page closes.

```ts
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    meterProvider.forceFlush()
  }
})
```

---

## Quick Reference: Prometheus Endpoints

| URL | Purpose |
|-----|---------|
| `http://localhost:9090` | Prometheus UI |
| `http://localhost:8889/metrics` | Raw OTel Collector exporter (scraped by Prometheus) |
| `http://localhost:8888/metrics` | OTel Collector internal health metrics |

## Quick Reference: PromQL Examples

```promql
# p75 LCP by MFE (requires multiple data points over time for rate())
histogram_quantile(0.75, sum by (mfe, le) (dash_telemetry_lcp_seconds_bucket))

# Average INP by MFE
avg by (mfe) (dash_telemetry_inp_milliseconds_sum / dash_telemetry_inp_milliseconds_count)

# CLS per MFE (latest)
dash_telemetry_cls_ratio

# Error rate alongside LCP (cross-signal correlation)
rate(dash_telemetry_errors_total[5m])
```
