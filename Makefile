.PHONY: help clean clean-all start stop status logs test check-health health open grafana

help:
	@echo "dash-monitor - Observability Backend for dash-telemetry"
	@echo ""
	@echo "Available targets:"
	@echo "  make start          Start all services (docker compose up -d)"
	@echo "  make stop           Stop services, preserve data (docker compose down)"
	@echo "  make clean          Clean data/ directory only (docker compose down -v)"
	@echo "  make clean-all      Remove all data and containers"
	@echo "  make status         Show service status (docker compose ps)"
	@echo "  make logs           Stream logs from all services"
	@echo "  make test           Run telemetry tests (bash and Node.js)"
	@echo "  make test-bash      Run bash curl-based telemetry test"
	@echo "  make test-node      Run Node.js telemetry test"
	@echo "  make test-vitals    Run Web Vitals test"
	@echo "  make check-health   Check health of all services"
	@echo "  make health         Alias for check-health"
	@echo "  make grafana        Open Grafana in browser (http://localhost:3000)"
	@echo "  make open           Alias for grafana"

# Start all services in the background
start:
	@echo "🚀 Starting dash-monitor stack..."
	docker compose up -d
	@echo "✅ Services started. Running health checks..."
	@sleep 2
	@$(MAKE) check-health

# Stop services (preserve data)
stop:
	@echo "🛑 Stopping services..."
	docker compose down
	@echo "✅ Services stopped"

# Clean data directory only (docker compose down -v removes named volumes)
clean:
	@echo "🧹 Cleaning data directory and stopping services..."
	docker compose down -v
	@if [ -d "data" ]; then rm -rf data; echo "✅ Data directory removed"; fi

# Remove everything including stopped containers
clean-all: clean
	@echo "🗑️  Removing all dash-monitor containers..."
	docker compose rm -f
	@echo "✅ All containers removed"

# Show service status
status:
	@echo "📊 Service Status:"
	@docker compose ps

# Stream logs from all services
logs:
	docker compose logs -f

# Health checks
check-health: health

health:
	@echo "🏥 Checking service health..."
	@echo "⏳ Waiting 10 seconds for services to stabilize..."
	@sleep 10
	@echo ""
	@echo "Collector OTLP HTTP endpoint (4318):"
	@curl -s http://localhost:4318/v1/traces -H "Content-Type: application/json" -d '{"resourceSpans":[]}' -w " ✅ HTTP %{http_code}\n" || echo " ❌ Not responding"
	@echo ""
	@echo "Tempo readiness (3200):"
	@curl -s http://localhost:3200/ready -w "✅ HTTP %{http_code}\n" || echo " ❌ Not responding"
	@echo ""
	@echo "Loki readiness (3100):"
	@curl -s http://localhost:3100/ready -w "✅ HTTP %{http_code}\n" || echo " ❌ Not responding"
	@echo ""
	@echo "Grafana (3000):"
	@curl -s http://localhost:3000/api/health -w "✅ HTTP %{http_code}\n" || echo " ❌ Not responding"
	@echo ""
	@echo "Collector metrics (8888):"
	@curl -s http://localhost:8888/metrics -w "✅ HTTP %{http_code}\n" | head -1 || echo " ❌ Not responding"

# Run all tests
test: test-bash test-node test-vitals

# Bash curl-based test
test-bash:
	@echo "🧪 Running bash telemetry test..."
	@bash test/test-telemetry.sh

# Node.js test
test-node:
	@echo "🧪 Running Node.js telemetry test..."
	@if command -v node &> /dev/null; then \
		node test/test-telemetry.js; \
	else \
		echo "⚠️  Node.js not found. Skipping Node.js test."; \
	fi

# Web Vitals test
test-vitals:
	@echo "🧪 Running Web Vitals test..."
	@if command -v node &> /dev/null; then \
		node test/test-web-vitals.js; \
	else \
		echo "⚠️  Node.js not found. Skipping Web Vitals test."; \
	fi

# Open Grafana in browser
grafana:
	@echo "🌐 Opening Grafana (http://localhost:3000)..."
	@if command -v open &> /dev/null; then \
		open http://localhost:3000; \
	elif command -v xdg-open &> /dev/null; then \
		xdg-open http://localhost:3000; \
	elif command -v wslview &> /dev/null; then \
		wslview http://localhost:3000; \
	else \
		echo "👉 Visit http://localhost:3000 in your browser"; \
	fi

# Alias for grafana
open: grafana
