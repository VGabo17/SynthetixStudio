#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="./backups/d1"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/synthetix-d1-${TIMESTAMP}.sql"

mkdir -p "${BACKUP_DIR}"

echo "Backing up D1 database to ${BACKUP_FILE}..."
wrangler d1 execute synthetik-studio --command=".dump" > "${BACKUP_FILE}"

echo "Uploading backup to R2..."
wrangler r2 object put synthetix-studio-backups/"$(basename "${BACKUP_FILE}")" --file "${BACKUP_FILE}" --bucket synthetix-studio-assets

echo "Backup completed: ${BACKUP_FILE}"
