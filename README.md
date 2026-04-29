# Simplified Stock Market Service

This project implements the internship task: a simplified stock market with wallets, a central bank inventory, audit log, and chaos endpoint.

## Tech Stack

- TypeScript + Node.js + Fastify
- Redis for shared state across API instances
- Docker Compose + Nginx for local high availability

## Requirements

- Docker
- Docker Compose
- (Optional for local non-docker run) Node.js 22+

## Run with one command

### Windows (PowerShell)

```powershell
./start.ps1 -Port 8080
```

### Linux/macOS

```bash
./start.sh 8080
```

Service will be available at `http://localhost:8080` (or another passed port).

## API Endpoints

- `POST /wallets/{wallet_id}/stocks/{stock_name}` with body `{ "type": "buy" | "sell" }`
- `GET /wallets/{wallet_id}`
- `GET /wallets/{wallet_id}/stocks/{stock_name}`
- `GET /stocks`
- `POST /stocks` with body `{ "stocks": [{ "name": "stock1", "quantity": 10 }] }`
- `GET /log`
- `POST /chaos`

## Behavior Details

- Stock price is fixed at 1.
- Wallet balance/funds are not tracked.
- Wallet is created automatically on first buy/sell attempt.
- Buy/sell operations are immediate.
- Bank is the only liquidity provider.
- Initial state is empty bank and no wallets.
- Audit log contains only successful wallet operations (buy/sell), in occurrence order.
- `POST /chaos` terminates only the instance that served the request.

## HA Setup

- Nginx load balances requests to `api1` and `api2`.
- Both API instances share state via Redis.
- If one instance dies (`/chaos`), the product remains available through the other one.

## Example Flow

```bash
curl -X POST http://localhost:8080/stocks \
  -H "Content-Type: application/json" \
  -d '{"stocks":[{"name":"stock1","quantity":2},{"name":"stock2","quantity":1}]}'

curl -X POST http://localhost:8080/wallets/w1/stocks/stock1 \
  -H "Content-Type: application/json" \
  -d '{"type":"buy"}'

curl http://localhost:8080/wallets/w1
curl http://localhost:8080/stocks
curl http://localhost:8080/log
```

## Local Development (without Docker)

```bash
npm install
npm run dev
```

Uses:
- `PORT` (default `3000`)
- `HOST` (default `0.0.0.0`)
- `REDIS_URL` (default `redis://127.0.0.1:6379`)

## Tests

```bash
npm install
npm test
```

The test suite covers:
- Happy path for bank + wallet operations
- Error mappings (`404`, `400`)
- Concurrency scenario for buy operations
- Chaos endpoint behavior
