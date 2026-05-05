# BlindOracle - Confidential RWA Vault with Encrypted AI Intelligence

BlindOracle is a privacy-preserving RWA management platform built for the Zama FHE ecosystem.

It demonstrates how real-world asset vaults can:

- Store balances in encrypted form using Zama FHE
- Enforce compliance gating
- Enable AI-driven portfolio analysis
- Maintain on-chain transparency without exposing user financial data

BlindOracle combines a working Sepolia ERC20 vault, an FHE-native private ledger contract, and an oracle-backed AI analyst that reads live on-chain state.

The current app is intentionally split into two layers:

- **Live demo flow**: users mint mock RWA tokens, create a vault, deposit/withdraw tokens, and ask an AI analyst for portfolio analysis based on live Sepolia reads.
- **FHE-native path**: the separate Confidential Vault tab uses the Zama relayer SDK to encrypt an initial balance, create a private vault, and show the encrypted balance handle without cluttering the main dashboard.

For the current work log and remaining roadmap, see [`PROGRESS.md`](./PROGRESS.md).

## Architecture

```text
Frontend (React + wagmi)
  -> Smart contracts (Sepolia)
  -> Oracle API (Node.js + viem + optional Groq)
  -> Optional on-chain oracle response worker
```

## Components

### Smart Contracts (`/contracts`)

- **BlindOracleVault.sol** - working ERC20 demo vault
  - `createVault(uint64 initialBalance)` - create a new vault
  - `deposit(uint64 amount)` - deposit mock RWA tokens
  - `withdraw(uint64 amount)` - withdraw mock RWA tokens
  - `getBalance()` - read the demo plaintext balance
  - `setComplianceRequired(bool required)` - owner toggles compliance gating
  - `setUserAllowed(address user, bool allowed)` - owner manages the allowlist

- **BlindOracleFHEVault.sol** - FHE-native private ledger
  - `createPrivateVault(...)` - create a vault with encrypted initial balance
  - `depositPrivate(...)` - add encrypted amount
  - `withdrawPrivate(...)` - subtract encrypted amount
  - `getEncryptedBalanceHandle(address user)` - return encrypted handle, not plaintext
  - `grantBalanceAccess(address viewer)` - allow another address to request decryption through the Zama permission flow
  - `setComplianceRequired(bool required)` - owner toggles compliance gating
  - `setUserAllowed(address user, bool allowed)` - owner manages the allowlist

- **BlindOracleAnalyst.sol** - query handler for oracle responses
  - `submitQuery(string queryType)` - submit a portfolio query
  - `respondToQuery(...)` - oracle owner responds with encrypted result
  - `getResult(uint256 queryId)` - user reads encrypted result handle

- **MockRWAToken.sol** - testnet ERC20 token displayed in the app as `RWA`

### Frontend (`/frontend`)

React-based UI with:

- Wallet connection through RainbowKit + wagmi
- Simple vault management for the public RWA demo vault
- Token minting for testnet use
- Portfolio allocation from live wallet/vault balances
- AI analyst interface in its own tab
- Dedicated Confidential Vault tab for encrypted FHE balance creation and handle display
- Clear transaction validation for insufficient wallet and vault balances

Run locally:

```bash
cd frontend
npm install
npm run dev
```

For deployment, configure:

```env
VITE_ANALYST_API_URL=https://your-oracle-host.example
VITE_RPC_URL=https://your-sepolia-rpc.example
VITE_BLIND_ORACLE_VAULT=0xEBe26e87b898152e387C4f18F4C8DA932cbDC29f
VITE_BLIND_ORACLE_ANALYST=0xC2b2677E092191f96373CA54920fAc16863F92Ed
VITE_BLIND_ORACLE_FHE_VAULT=0x8A18528D7e88C481dB341a9D8eE50E4e8D4aF537
VITE_MOCK_TOKEN=0x0a9A09B392f95D8999a1a5a14E09cd378Fc23F78
VITE_DISPLAY_TOKEN_SYMBOL=RWA
VITE_RWA_USD_PRICE=1
VITE_RWA_APY_PERCENT=5.2
```

### Oracle Backend (`/oracle`)

Node.js service that:

- Exposes `POST /analyze` for frontend portfolio analysis
- Reads live Sepolia contract state with viem
- Uses Groq when `GROQ_API_KEY` is configured
- Falls back to deterministic rule-based analysis without a Groq key
- Optionally watches `QuerySubmitted` events and submits on-chain responses when `PRIVATE_KEY` is configured

Run locally:

```bash
cd oracle
npm install
cp .env.example .env
npm start
```

The live analysis API runs at `http://localhost:8787/analyze` by default.

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| MockRWAToken | `0x0a9A09B392f95D8999a1a5a14E09cd378Fc23F78` |
| BlindOracleVault | `0xEBe26e87b898152e387C4f18F4C8DA932cbDC29f` |
| BlindOracleAnalyst | `0xC2b2677E092191f96373CA54920fAc16863F92Ed` |
| BlindOracleFHEVault | `0x8A18528D7e88C481dB341a9D8eE50E4e8D4aF537` |

## Quick Start

### 1. Compile and Test

```bash
npm install
npx hardhat compile
npm test
```

On Windows PowerShell, if execution policy blocks `npm` or `npx`, use `npm.cmd` and `npx.cmd`.

### 2. Deploy Contracts

```bash
npx hardhat run scripts/deploy-blindoracle.ts --network sepolia
```

### 3. Start Oracle

```bash
cd oracle
npm start
```

### 4. Run Frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173` and connect a Sepolia wallet.

## User Flow

1. Connect wallet.
2. Mint test RWA tokens from the `Get Tokens` tab.
3. Create the vault.
4. Deposit or withdraw RWA tokens. The frontend blocks deposits above wallet balance and withdrawals above vault balance before sending a transaction.
5. Ask the AI analyst custom questions from the Analyst tab.
6. Open the Confidential Vault tab to create a private FHE vault and view the encrypted balance handle.

Example analyst prompts:

- "How much can I deposit?"
- "How can I earn more?"
- "Assess my RWA risk"
- "Compare public vs confidential vault"

## Compliance Controls

Both vault contracts include baseline compliance controls for the RWA demo:

- `complianceRequired` controls whether allowlisting is enforced.
- `isAllowed(address user)` stores allowlist status.
- `setComplianceRequired(bool required)` is owner-only.
- `setUserAllowed(address user, bool allowed)` is owner-only.
- Events are emitted when compliance mode or allowlist status changes.

When compliance is enabled, non-allowlisted users cannot create or deposit into the vault.

## Token Support

The frontend displays the main asset as `RWA` through `VITE_DISPLAY_TOKEN_SYMBOL`.

The deployed `BlindOracleVault` escrows one immutable ERC20 asset token configured through `VITE_MOCK_TOKEN`. The dashboard intentionally focuses on that RWA token only.

Important current limitation: the public vault assumes 18-decimal ERC20 units.

## Production Notes

This is a hackathon demo with known simplifications:

1. The active ERC20 vault stores a demo plaintext balance so deposits and withdrawals work with standard ERC20 transfers.
2. The oracle's on-chain response encryption is simulated with a hash/proof placeholder.
3. The Confidential Vault tab creates encrypted input proofs for initial private vault creation. Private deposits, withdrawals, and user decryption are still next steps.
4. Yield and price are configurable demo feeds. Replace them with a live oracle/API source before production.
5. Multi-asset allocation feeds are not connected yet.
6. The full Zama KMS decryption permission flow is not implemented in the frontend yet.

## Deployment Notes

The frontend can be hosted on Vercel. The oracle should be hosted on a platform that supports a persistent Node process, such as Render, Railway, Fly.io, or a VPS. Vercel serverless functions are fine for a stateless `/analyze` refactor, but they are not reliable for long-running `watchEvent` listeners.

## Tech Stack

- **Smart contracts**: Solidity 0.8.24, Zama FHEVM libraries, Hardhat
- **Frontend**: React, Vite, wagmi, RainbowKit, Tailwind CSS
- **Backend**: Node.js, viem, Groq API
- **Testing**: Hardhat

## Competition Track

Submitted to: **Zama Developer Program Mainnet Season 2**

- Track: **RWA + Confidential Finance**
- Partnership alignment: **T-REX (Tokenized Real Estate Exchange)**

## License

MIT
