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



## Next

Excellent! ✅ Now everything is ready. Here's what will happen now:

What's Configured ✅

1. Datasources auto-provision - Tempo, Loki, Prometheus will be automatically added
2. Dashboard auto-provisions - Your  monitor.json  dashboard will appear in the "Dash Telemetry" folder

Test It

# Stop containers and remove data
docker compose down -v
rm -rf data/

# Start fresh
docker compose up -d

# Wait ~10 seconds for Grafana to start
sleep 10

# Open Grafana
open http://localhost:3000

Login: admin / admin

Your dashboard should automatically appear under: Dashboards → Dash Telemetry → monitor

Key Changes Made

I set  "id": null  in your  monitor.json . Grafana assigns a new ID when provisioning, so the exported dashboard's hardcoded ID needs to be removed.

Future Dashboards

When you create new dashboards:

1. Export via Grafana UI: Share → Export → Save to file
2. Save to  grafana/dashboards/your-dashboard.json 
3. Edit the JSON and set  "id": null 
4. Restart Grafana:  docker compose restart grafana 

That's it! Your setup is now fully automated. 🎉