\getenv runtime_password POSTGRES_RUNTIME_PASSWORD
CREATE ROLE apply_runtime LOGIN PASSWORD :'runtime_password';
GRANT CONNECT ON DATABASE apply TO apply_runtime;
GRANT USAGE ON SCHEMA public TO apply_runtime;
