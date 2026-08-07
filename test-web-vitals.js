#!/usr/bin/env node

/**
 * Test script to send synthetic Web Vitals metrics to OTel Collector
 * Mimics the Core Web Vitals data from @edgar-treischl/dash-telemetry
 *
 * Metrics sent:
 *   - LCP  (Largest Contentful Paint)   — dash_telemetry_lcp_seconds
 *   - CLS  (Cumulative Layout Shift)    — dash_telemetry_cls_ratio
 *   - INP  (Interaction to Next Paint)  — dash_telemetry_inp_milliseconds
 *   - FCP  (First Contentful Paint)     — dash_telemetry_fcp_seconds
 *   - TTFB (Time to First Byte)         — dash_telemetry_ttfb_seconds
 */

const http = require('http');

const OTEL_ENDPOINT = 'http://localhost:4318';

function now() {
  return Date.now() * 1000000; // nanoseconds
}

// OTel histogram data point helper
function histogramDataPoint(value, attributes = []) {
  const startTime = now() - 5000000000; // 5s ago
  const endTime = now();
  return {
    attributes,
    startTimeUnixNano: startTime,
    timeUnixNano: endTime,
    count: '1',
    sum: value,
    bucketCounts: ['0', '0', '1', '0', '0'],
    explicitBounds: [0.1, 0.5, 1.0, 2.5, 5.0],
    min: value,
    max: value,
  };
}

// OTel gauge data point helper
function gaugeDataPoint(value, attributes = []) {
  return {
    attributes,
    timeUnixNano: now(),
    asDouble: value,
  };
}

function mfeAttrs(mfe, environment = 'development') {
  return [
    { key: 'mfe', value: { stringValue: mfe } },
    { key: 'environment', value: { stringValue: environment } },
    { key: 'route', value: { stringValue: '/orders/42' } },
  ];
}

// Simulate realistic Web Vitals metrics for two MFEs
function createWebVitalsPayload() {
  const mfes = ['orders', 'inventory'];

  const lcpDataPoints = mfes.map((mfe) =>
    histogramDataPoint(mfe === 'orders' ? 1.8 : 2.6, mfeAttrs(mfe))
  );
  const clsDataPoints = mfes.map((mfe) =>
    gaugeDataPoint(mfe === 'orders' ? 0.04 : 0.12, mfeAttrs(mfe))
  );
  const inpDataPoints = mfes.map((mfe) =>
    histogramDataPoint(mfe === 'orders' ? 120 : 250, mfeAttrs(mfe))
  );
  const fcpDataPoints = mfes.map((mfe) =>
    histogramDataPoint(mfe === 'orders' ? 0.9 : 1.4, mfeAttrs(mfe))
  );
  const ttfbDataPoints = mfes.map((mfe) =>
    histogramDataPoint(mfe === 'orders' ? 0.15 : 0.32, mfeAttrs(mfe))
  );

  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'shell' } },
            { key: 'service.version', value: { stringValue: '1.5.0' } },
            { key: 'service.namespace', value: { stringValue: 'dash-telemetry' } },
            { key: 'environment', value: { stringValue: 'development' } },
            { key: 'user.id', value: { stringValue: 'user-test-123' } },
            { key: 'tenant', value: { stringValue: 'test-tenant' } },
          ],
        },
        scopeMetrics: [
          {
            scope: { name: 'dash-telemetry', version: '1.0.0' },
            metrics: [
              {
                name: 'lcp',
                description: 'Largest Contentful Paint in seconds',
                unit: 's',
                histogram: {
                  dataPoints: lcpDataPoints,
                  aggregationTemporality: 2, // CUMULATIVE
                },
              },
              {
                name: 'cls',
                description: 'Cumulative Layout Shift score',
                unit: '1',
                gauge: {
                  dataPoints: clsDataPoints,
                },
              },
              {
                name: 'inp',
                description: 'Interaction to Next Paint in milliseconds',
                unit: 'ms',
                histogram: {
                  dataPoints: inpDataPoints,
                  aggregationTemporality: 2,
                },
              },
              {
                name: 'fcp',
                description: 'First Contentful Paint in seconds',
                unit: 's',
                histogram: {
                  dataPoints: fcpDataPoints,
                  aggregationTemporality: 2,
                },
              },
              {
                name: 'ttfb',
                description: 'Time to First Byte in seconds',
                unit: 's',
                histogram: {
                  dataPoints: ttfbDataPoints,
                  aggregationTemporality: 2,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function sendOTLP(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint);
    const data = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🚀 Sending synthetic Web Vitals metrics to OTel Collector...\n');

  try {
    const payload = createWebVitalsPayload();
    const metrics = payload.resourceMetrics[0].scopeMetrics[0].metrics;

    console.log('📊 Sending Web Vitals metrics...');
    await sendOTLP(`${OTEL_ENDPOINT}/v1/metrics`, payload);
    console.log('✅ Metrics sent successfully');

    console.log('\n   Metrics included:');
    metrics.forEach((m) => {
      const type = m.histogram ? 'histogram' : 'gauge';
      const count = m.histogram
        ? m.histogram.dataPoints.length
        : m.gauge.dataPoints.length;
      console.log(`   • ${m.name} (${type}, ${count} MFEs) — ${m.description}`);
    });

    console.log('\n✨ Web Vitals data sent successfully!');
    console.log('\n📌 Next steps:');
    console.log('   1. Open Grafana: http://localhost:3000');
    console.log('   2. Go to Explore → Prometheus');
    console.log('   3. Query: dash_telemetry_lcp_seconds_sum');
    console.log('   4. Or open the "Web Vitals" dashboard');
    console.log('\n   PromQL examples:');
    console.log(
      '   • 95th pct LCP by MFE: histogram_quantile(0.95, rate(dash_telemetry_lcp_seconds_bucket[5m]))'
    );
    console.log('   • CLS by MFE:           dash_telemetry_cls_ratio{job="otel-collector-metrics"}');
    console.log('   • Avg INP by MFE:       avg by (mfe) (dash_telemetry_inp_milliseconds_sum / dash_telemetry_inp_milliseconds_count)');
  } catch (error) {
    console.error('❌ Error sending metrics:', error.message);
    process.exit(1);
  }
}

main();
