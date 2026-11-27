set -euo pipefail

node tests/session-http.mjs http://127.0.0.1:3010

# Check the production entry point with the public development key.
if timeout 30 docker compose run --rm --no-deps -T -e SESSION_MODE=https app > "$RUNNER_TEMP/session-start.log" 2>&1; then
  echo "Server accepted the local session key in HTTPS mode"
  exit 1
else
  code=$?
  test "$code" -ne 124
  grep -q 'SESSION_SECRET must' "$RUNNER_TEMP/session-start.log"
fi

tls_dir=$(mktemp -d)
cleanup() {
  docker rm -f session-ci-proxy session-ci-app >/dev/null 2>&1 || true
}
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
  -addext 'subjectAltName=IP:127.0.0.1' -keyout "$tls_dir/key.pem" -out "$tls_dir/cert.pem"
export SESSION_SECRET
SESSION_SECRET=$(openssl rand -hex 32)
docker compose run -d --no-deps --name session-ci-app -p 127.0.0.1:3011:3000 \
  -e SESSION_MODE=https -e SESSION_SECRET app
cat > "$tls_dir/default.conf" <<'NGINX'
server {
  listen 127.0.0.1:3443 ssl;
  ssl_certificate /tls/cert.pem;
  ssl_certificate_key /tls/key.pem;
  location / {
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_pass http://127.0.0.1:3011;
  }
}
NGINX
docker run -d --name session-ci-proxy --network host -v "$tls_dir:/tls:ro" \
  -v "$tls_dir/default.conf:/etc/nginx/conf.d/default.conf:ro" nginx:stable-alpine
curl -fsS --cacert "$tls_dir/cert.pem" --retry 12 --retry-all-errors --retry-delay 1 \
  --max-time 5 https://127.0.0.1:3443/login -o /dev/null
NODE_EXTRA_CA_CERTS="$tls_dir/cert.pem" node tests/session-http.mjs https://127.0.0.1:3443
