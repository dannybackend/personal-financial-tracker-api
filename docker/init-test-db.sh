#!/bin/bash
# Runs automatically on first container startup (docker-entrypoint-initdb.d),
# only when the postgres_data volume is freshly created. Creates a second,
# disposable database for integration tests, sibling to the main dev database.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ${POSTGRES_DB}_test;
EOSQL
