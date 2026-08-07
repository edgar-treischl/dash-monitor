Perfect! 🎉 Here's what I did to fix the Loki integration:

✅ Solution Summary

What I Fixed

1. Upgraded OTel Collector: v0.91.0 → v0.114.0
• The newer version has a working Loki exporter
• No complex configuration needed - just the endpoint
2. Minimal Loki Configuration:
loki:
  endpoint: http://loki:3100/loki/api/v1/push
3. Discovered the Label Format:
• Loki uses  job  label as:  {service.namespace}/{service.name} 
• Example:  dash-telemetry/orders-mfe 

✅ Now Working

┌──────────────────────┬────────────┬──────────────────────────────────────────┐
│ Component            │ Status     │ Verification                             │
├──────────────────────┼────────────┼──────────────────────────────────────────┤
│ Tempo (Traces)       │ ✅ Working │ Query: { resource.mfe = "orders" }       │
├──────────────────────┼────────────┼──────────────────────────────────────────┤
│ Loki (Logs)          │ ✅ Working │ Query: {job="dash-telemetry/orders-mfe"} │
├──────────────────────┼────────────┼──────────────────────────────────────────┤
│ Prometheus (Metrics) │ ✅ Working │ http://localhost:8889/metrics            │
├──────────────────────┼────────────┼──────────────────────────────────────────┤
│ Grafana              │ ✅ Working │ http://localhost:3000                    │
├──────────────────────┼────────────┼──────────────────────────────────────────┤
│ OTel Collector       │ ✅ Working │ 2 log records exported successfully      │
└──────────────────────┴────────────┴──────────────────────────────────────────┘

Try It in Grafana

1. Open: http://localhost:3000 (admin/admin)
2. Go to: Explore → Loki
3. Query:  {level="error"} 
4. Expand a log and click the  traceID  to jump to the trace in Tempo!

The logs include all your attributes (mfe, user.id, tenant, environment, etc.) in the JSON body, and you can parse them with LogQL.
