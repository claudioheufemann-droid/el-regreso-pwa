#!/bin/bash

# Test script for deudores API endpoints
# Usage: bash scripts/test-deudores-api.sh [base_url] [file_path]

BASE_URL=${1:-http://localhost:3000}
FILE_PATH=${2:-./Deudores\ \(2\).xlsx}

echo "Testing Deudores API"
echo "===================="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Health check
echo "1. GET /api/deudores/upload (health check)"
curl -s "$BASE_URL/api/deudores/upload" | jq . || echo "FAILED"
echo ""

# Test 2: Upload file
if [ -f "$FILE_PATH" ]; then
  echo "2. POST /api/deudores/upload (upload file)"
  curl -s -X POST "$BASE_URL/api/deudores/upload" \
    -F "file=@$FILE_PATH" | jq .
  echo ""
else
  echo "2. POST /api/deudores/upload (SKIPPED - file not found at $FILE_PATH)"
  echo ""
fi

# Test 3: Get list
echo "3. GET /api/deudores/list (fetch all deudores)"
curl -s "$BASE_URL/api/deudores/list" | jq '.[0:2]' || echo "FAILED"
echo ""

# Test 4: Get stats
echo "4. GET /api/deudores/upload?_stats=1 (get statistics)"
curl -s "$BASE_URL/api/deudores/upload" | jq . || echo "FAILED"
echo ""

# Test 5: Cron endpoint health check
echo "5. GET /api/deudores/cron-upload (cron endpoint health check)"
curl -s "$BASE_URL/api/deudores/cron-upload" | jq . || echo "FAILED"
echo ""

echo "Tests completed!"
