param(
  [int]$Port = 8080
)

$env:HOST_PORT = "$Port"
docker compose up --build
