#!/usr/bin/env node

/**
 * Test script to send synthetic telemetry data to OTel Collector
 * Mimics the data format from @edgar-treischl/dash-telemetry
 */

const https = require('http');

const OTEL_ENDPOINT = 'http://localhost:4318';
const TRACE_ID = generateTraceId();
const SPAN_ID = generateSpanId();

// Generate random IDs
function generateTraceId() {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function generateSpanId() {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function now() {
  return Date.now() * 1000000; // nanoseconds
}

// Simulate trace data
function createTracePayload() {
  const startTime = now();
  const endTime = startTime + 250000000; // 250ms duration

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'shell' } },
            { key: 'service.version', value: { stringValue: '1.5.0' } },
            { key: 'service.namespace', value: { stringValue: 'dash-telemetry' } },
            { key: 'mfe', value: { stringValue: 'orders' } },
            { key: 'mfe.version', value: { stringValue: '2.3.1' } },
            { key: 'shell.version', value: { stringValue: '1.5.0' } },
            { key: 'user.id', value: { stringValue: 'user-test-123' } },
            { key: 'tenant', value: { stringValue: 'test-tenant' } },
            { key: 'environment', value: { stringValue: 'development' } },
            { key: 'route', value: { stringValue: '/orders/42' } },
            { key: 'session.id', value: { stringValue: 'sess-test-abc123' } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: 'dash-telemetry',
              version: '1.0.0',
            },
            spans: [
              {
                traceId: TRACE_ID,
                spanId: SPAN_ID,
                name: 'Remote MFE Loading: orders',
                kind: 1, // SPAN_KIND_INTERNAL
                startTimeUnixNano: startTime,
                endTimeUnixNano: endTime,
                attributes: [
                  { key: 'mfe.name', value: { stringValue: 'orders' } },
                  { key: 'mfe.url', value: { stringValue: 'http://localhost:5001/remoteEntry.js' } },
                  { key: 'operation', value: { stringValue: 'mfe.load' } },
                ],
                status: { code: 1 }, // STATUS_CODE_OK
              },
              {
                traceId: TRACE_ID,
                spanId: generateSpanId(),
                parentSpanId: SPAN_ID,
                name: 'Route Navigation: /orders/42',
                kind: 1,
                startTimeUnixNano: endTime,
                endTimeUnixNano: endTime + 150000000, // 150ms
                attributes: [
                  { key: 'route.path', value: { stringValue: '/orders/42' } },
                  { key: 'route.params', value: { stringValue: '{"id":"42"}' } },
                  { key: 'operation', value: { stringValue: 'navigation' } },
                ],
                status: { code: 1 },
              },
            ],
          },
        ],
      },
    ],
  };
}

// Simulate log data
function createLogPayload() {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'orders-mfe' } },
            { key: 'service.version', value: { stringValue: '2.3.1' } },
            { key: 'service.namespace', value: { stringValue: 'dash-telemetry' } },
            { key: 'mfe', value: { stringValue: 'orders' } },
            { key: 'user.id', value: { stringValue: 'user-test-123' } },
            { key: 'tenant', value: { stringValue: 'test-tenant' } },
            { key: 'environment', value: { stringValue: 'development' } },
          ],
        },
        scopeLogs: [
          {
            scope: {
              name: 'dash-telemetry',
              version: '1.0.0',
            },
            logRecords: [
              {
                timeUnixNano: now(),
                severityNumber: 9, // INFO
                severityText: 'info',
                body: { stringValue: 'Order #42 loaded successfully' },
                attributes: [
                  { key: 'level', value: { stringValue: 'info' } },
                  { key: 'mfe', value: { stringValue: 'orders' } },
                  { key: 'traceID', value: { stringValue: TRACE_ID } },
                  { key: 'operation', value: { stringValue: 'order.load' } },
                ],
                traceId: TRACE_ID,
                spanId: SPAN_ID,
              },
              {
                timeUnixNano: now() + 5000000000, // 5 seconds later
                severityNumber: 17, // ERROR
                severityText: 'error',
                body: { stringValue: 'Failed to fetch order details: Network timeout' },
                attributes: [
                  { key: 'level', value: { stringValue: 'error' } },
                  { key: 'mfe', value: { stringValue: 'orders' } },
                  { key: 'traceID', value: { stringValue: TRACE_ID } },
                  { key: 'error.type', value: { stringValue: 'NetworkError' } },
                  { key: 'error.message', value: { stringValue: 'Network timeout' } },
                  { key: 'http.status_code', value: { intValue: 0 } },
                ],
                traceId: TRACE_ID,
                spanId: SPAN_ID,
              },
            ],
          },
        ],
      },
    ],
  };
}

// Send data to OTel Collector
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

    const req = https.request(options, (res) => {
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

// Main execution
async function main() {
  console.log('🚀 Sending synthetic telemetry data to OTel Collector...\n');

  try {
    // Send traces
    console.log('📊 Sending traces...');
    const tracePayload = createTracePayload();
    await sendOTLP(`${OTEL_ENDPOINT}/v1/traces`, tracePayload);
    console.log('✅ Traces sent successfully');
    console.log(`   Trace ID: ${TRACE_ID}`);
    console.log(`   Spans: ${tracePayload.resourceSpans[0].scopeSpans[0].spans.length}`);

    // Send logs
    console.log('\n📝 Sending logs...');
    const logPayload = createLogPayload();
    await sendOTLP(`${OTEL_ENDPOINT}/v1/logs`, logPayload);
    console.log('✅ Logs sent successfully');
    console.log(`   Log records: ${logPayload.resourceLogs[0].scopeLogs[0].logRecords.length}`);

    console.log('\n✨ All telemetry data sent successfully!');
    console.log('\n📌 Next steps:');
    console.log('   1. Open Grafana: http://localhost:3000');
    console.log('   2. Go to Explore → Tempo');
    console.log(`   3. Search for trace ID: ${TRACE_ID}`);
    console.log('   4. Go to Explore → Loki');
    console.log('   5. Query: {job="dash-telemetry/orders-mfe"}');
  } catch (error) {
    console.error('❌ Error sending telemetry:', error.message);
    process.exit(1);
  }
}

main();
