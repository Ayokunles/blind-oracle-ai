# BlindOracle Oracle Backend

Backend service for BlindOracle. It reads live Sepolia contract state, exposes a frontend analysis API, and can optionally process `QuerySubmitted` events from `BlindOracleAnalyst`.

## Runtime Modes

- **HTTP API**: always available. `POST /analyze` returns a live portfolio analysis for the supplied wallet.
- **Event worker**: enabled only when `PRIVATE_KEY` is set. It watches `QuerySubmitted` events and attempts to submit encrypted responses on-chain.

## Setup

```bash
cd oracle
npm install
cp .env.example .env
npm start
```

Configure `.env`:

```env
RPC_URL=https://sepolia.gateway.tenderly.co
ORACLE_PORT=8787
CONTRACT_ADDRESS=0xC2b2677E092191f96373CA54920fAc16863F92Ed
VAULT_ADDRESS=0xEBe26e87b898152e387C4f18F4C8DA932cbDC29f
TOKEN_ADDRESS=0x0a9A09B392f95D8999a1a5a14E09cd378Fc23F78
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
PRIVATE_KEY=
YIELD_APY_BPS=520
YIELD_SOURCE=configured-demo-rate
RWA_USD_PRICE=1
```

`GROQ_API_KEY` is optional. Without it, the API still reads live chain data and returns a deterministic rule-based summary.

`PRIVATE_KEY` is optional. Without it, the HTTP API works, but on-chain response submission is disabled.

`YIELD_APY_BPS` powers the current yield feed. `520` means `5.20%` APY. For production, keep the same snapshot fields and replace this configured value with a live source such as a Chainlink feed, a Treasury yield API, or your own signed oracle update.

## API

Health check:

```bash
GET http://localhost:8787/health
```

Analyze a wallet:

```bash
POST http://localhost:8787/analyze
Content-Type: application/json

{
  "userAddress": "0x...",
  "query": "Analyze my RWA portfolio"
}
```

The response includes:

- `analysis` - Groq or rule-based answer
- `model` - model/fallback used
- `snapshot` - live on-chain balances, vault state, block number, and known limitations
- `snapshot.yield` - APY, estimated annual yield, yield source, and RWA display price

## How It Works

```text
Frontend
  -> POST /analyze
  -> Oracle reads token/vault state from Sepolia
  -> Oracle calls Groq if configured, otherwise uses rule-based analysis
  -> Frontend displays the answer and snapshot metadata

Optional worker:
BlindOracleAnalyst QuerySubmitted event
  -> Oracle reads query details
  -> Oracle generates analysis
  -> Oracle submits a mock encrypted response
```

## Production Considerations

- Split the HTTP API and event worker into separate deployable processes.
- Add rate limiting and structured logs.
- Use a managed secret store for private keys.
- Replace mock response encryption with the real Zama SDK/KMS flow.
- Add retry/queue handling for failed on-chain response submissions.

## FHE Status

The current on-chain response path uses simulated encryption for demonstration. A production deployment needs Zama KMS/decryption permissions, real encrypted input proofs, and frontend SDK support for user-controlled decryption.
