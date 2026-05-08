# BlindOracle - Confidential RWA Management Platform

**Built with Zama FHE for the RWA + Confidential Finance track**

BlindOracle is a privacy-preserving RWA (Real World Asset) management platform that allows users to:
- Create encrypted vaults for RWA tokens
- Deposit/withdraw assets privately
- Get AI-powered portfolio analysis on **encrypted data** using Zama's Fully Homomorphic Encryption (FHE)

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Smart Contracts │────▶│   Oracle        │
│  (React + wagmi)│     │  (BlindOracle)   │     │  (Node.js + Groq)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                        Zama FHE
                    (encrypted data)
```

## Components

### 1. Smart Contracts (`/contracts`)

- **BlindOracleVault.sol** - Encrypted vault for RWA tokens
  - `createVault(uint64 initialBalance)` - Create a new vault
  - `deposit(uint64 amount)` - Deposit tokens
  - `withdraw(uint64 amount)` - Withdraw tokens
  - `getBalance()` - View your balance

- **BlindOracleAnalyst.sol** - AI query handler
  - `submitQuery(string queryType)` - Submit encrypted portfolio query
  - `respondToQuery(...)` - Oracle responds with encrypted result
  - `getResult(uint256 queryId)` - Get encrypted result

- **MockRWAToken.sol** - Mock ERC20 token for testing (T-Bill backed)

### 2. Frontend (`/frontend`)

React-based UI with:
- Wallet connection (RainbowKit + wagmi)
- Vault management (create, deposit, withdraw)
- Portfolio dashboard with allocation charts
- AI Analyst query interface

**Run frontend:**
```bash
cd frontend
npm install
npm run dev
```

### 3. Oracle Backend (`/oracle`)

Node.js service that:
- Listens for `QuerySubmitted` events
- Processes queries with Groq AI
- Submits encrypted responses back to contract

**Run oracle:**
```bash
cd oracle
npm install
cp .env.example .env  # Add your Groq API key
node index.js
```

## Deployed Contracts (Sepolia Testnet)

| Contract | Address |
|----------|---------|
| MockRWAToken | `0x0a9A09B392f95D8999a1a5a14E09cd378Fc23F78` |
| BlindOracleVault | `0xEBe26e87b898152e387C4f18F4C8DA932cbDC29f` |
| BlindOracleAnalyst | `0xC2b2677E092191f96373CA54920fAc16863F92Ed` |

## Quick Start

### 1. Deploy Contracts

```bash
cd /c/Users/Lenovo/zama-ai-agent
npx hardhat compile
npx hardhat run scripts/deploy-blindoracle.ts --network sepolia
```

On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd`/`npx.cmd` instead:

```bash
npx.cmd hardhat compile
npx.cmd hardhat run scripts/deploy-blindoracle.ts --network sepolia
```

### 2. Start Oracle

```bash
cd oracle
npm start
```

The oracle exposes a live analysis API at `http://localhost:8787/analyze`. Put your `GROQ_API_KEY` in `oracle/.env` if you want Groq to generate the answer. Without a Groq key, the API still reads live Sepolia contract data and returns a rule-based live summary.

### 3. Run Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:3000 and connect your wallet!

## How It Works

### User Flow

1. **Connect Wallet** - Connect MetaMask or any wagmi-compatible wallet
2. **Create Vault** - Initialize your encrypted vault with 1000 MTBILL
3. **Mint Tokens** - Get test tokens via the "Mint" button
4. **Deposit** - Add RWA tokens to your vault
5. **Ask AI Analyst** - Submit queries like:
   - "Analyze my RWA portfolio"
   - "What's my asset allocation?"
   - "Calculate my yield"
   - "Risk assessment"

### Oracle Flow

1. User submits query → `QuerySubmitted` event emitted
2. Oracle detects event → Fetches query details
3. Oracle reads live Sepolia contract state and calls Groq AI → Gets portfolio analysis
4. Oracle encrypts response → Submits to contract
5. User decrypts result → Views private analysis

## Demo Features

- **Live Portfolio Reads** - Analyst responses are based on fresh Sepolia reads for the connected wallet
- **Real Groq Integration** - Server-side AI responses using llama-3.1-8b-instant when `GROQ_API_KEY` is configured
- **Dark/Light Mode** - Toggle theme in the header
- **Attack Mode** - See what attackers would see without FHE encryption

## Production Notes

This is a **hackathon demo** with the following simplifications:

1. **Plaintext Balances** - Production will use `euint64` with Zama FHE
2. **Simulated Encryption** - Oracle uses mock encryption (bytes32 hash)
3. **No KMS Integration** - Production requires Zama KMS for decryption

### Production Migration Path

To enable full FHE:

```solidity
// In BlindOracleVault.sol
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";

struct Vault {
    euint64 balance;  // Encrypted balance
    // ...
}

function deposit(uint64 amount, bytes calldata inputProof) external {
    euint64 encryptedAmount = FHE.fromExternal(amount, inputProof);
    vault.balance = FHE.add(vault.balance, encryptedAmount);
}
```

## Tech Stack

- **Smart Contracts**: Solidity 0.8.24, Zama FHEVM
- **Frontend**: React, wagmi, RainbowKit, Tailwind CSS
- **Backend**: Node.js, viem, Groq API
- **Testing**: Hardhat

## Competition Track

Submitted to: **Zama Developer Program Mainnet Season 2**
- Track: **RWA + Confidential Finance**
- Partnership alignment: **T-REX (Tokenized Real Estate Exchange)**

## License

MIT

## Built with ❤️ using Zama FHE
