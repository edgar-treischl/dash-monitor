Correct LogQL JSON Queries

When Loki's JSON parser extracts nested fields, it flattens them with underscores. So:


# ✅ CORRECT - Use underscores for nested paths
{level="error"} | json | attributes_mfe="orders"
{level="error"} | json | resources_mfe="orders"
{level="error"} | json | attributes_error_type="NetworkError"
{level="error"} | json | resources_service_name="orders-mfe"

{level=~"error|warn"} | json | mfe="orders" | error_type!=""

# Query by service name
{level="error"} | json | resources_service_name="orders-mfe"

# Query by tenant
{level="error"} | json | resources_tenant="test-tenant"

# Query by user
{level="error"} | json | resources_user_id="user-test-123"

# All logs from orders MFE (from either attributes or resources)
{job=~"dash-telemetry.*"} | json | resources_mfe="orders"

JSON Structure in Loki

attributes.mfe         → attributes_mfe
attributes.error.type  → attributes_error_type
resources.mfe          → resources_mfe
resources.service.name → resources_service_name
