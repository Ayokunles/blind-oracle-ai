# BlindOracle Progress And Roadmap

This document tracks what has been completed so far and what still needs work for the Zama RWA submission.

## Current Status Summary

| Area | Status | Notes |
|------|--------|-------|
| Public ERC20 demo vault | Done | Users can create a vault, deposit, withdraw, and view balances. |
| Wallet balance validation | Done | Deposit now shows `Insufficient wallet balance` before sending a transaction. |
| Vault balance validation | Done | Withdraw now shows `Insufficient vault balance` before sending a transaction. |
| RWA display symbol | Done | Frontend displays `RWA` while using the deployed ERC20 contract behind the scenes. |
| AI analyst backend | Done for demo | Reads live Sepolia state and returns analysis. |
| AI analyst dashboard placement | Reverted | Removed from dashboard to keep the app simple. Analyst remains in its own tab. |
| FHE vault contract | Done for demo | Contract is deployed at `0x8A18528D7e88C481dB341a9D8eE50E4e8D4aF537` and has compliance controls. |
| FHE vault UI | Done for focused demo | Added a separate Confidential Vault tab for encrypted private vault creation and encrypted handle display. The main dashboard stays simple. |
<<<<<<< HEAD
| Zama KMS decrypt flow | Not started | Needs SDK/KMS integration and permission flow. |g
=======
| Zama KMS decrypt flow | Not started | Needs SDK/KMS integration and permission flow. |
>>>>>>> d2df176cb3828cedfb74f8898dd12cce542c8762
| Compliance/access control | Done for baseline | Public and FHE vault contracts now have owner-managed compliance toggles and allowlists. |
| Token switching | Deferred | Removed from the dashboard for focus. Public vault deposits use the configured RWA token only. |
| Multi-asset support | Not started | Future work after single-token demo is solid. |
| Real price/APY data | Not started | Current price/APY are hardcoded demo values. |

## What To Build Next

Recommended immediate next steps:

1. Add encrypted private deposit and withdrawal actions to the Confidential Vault tab.
2. Add Zama KMS user-decrypt permission flow for authorized balance reveal.
3. Add admin UI or scripts for compliance allowlisting.
4. Decide later whether token switching should support multiple vault/token deployments.
5. Add multi-asset support.
6. Replace hardcoded price/APY data with a live source.

## Completed So Far

### Frontend

- Built the main BlindOracle dashboard with wallet connection, vault balances, token minting, portfolio view, and AI analyst tab.
- Added live Sepolia reads for:
  - public vault balance
  - deposit count
  - ERC20 wallet balance
  - vault existence
- Removed side-by-side FHE/public vault cards after review because they made the dashboard harder to understand.
- Removed token selector from the dashboard to keep the demo focused on the configured RWA token.
- Removed the dashboard AI analyst panel after review; the AI analyst remains available in its own tab.
- Added a separate Confidential Vault tab:
  - encrypts an initial private balance with the Zama relayer SDK
  - calls `createPrivateVault(...)`
  - shows the encrypted balance handle and Zama KMS note
  - keeps FHE details out of the main dashboard
- Added safer deposit validation:
  - blocks empty or invalid amounts
  - blocks non-whole-number input
  - blocks deposits above wallet balance with `Insufficient wallet balance`
- Added safer withdraw validation:
  - blocks invalid amounts
  - blocks withdrawals above vault balance with `Insufficient vault balance`
- Updated visible token display back to `RWA` while still using the deployed ERC20 token contract behind the scenes.
- Updated UI language to say ERC20 asset/token where appropriate.
- Removed the FHE pipeline card from the main dashboard to keep the first screen focused on the demo flow.

### Contracts

- `BlindOracleVault.sol` supports the working public ERC20 vault demo.
- `BlindOracleFHEVault.sol` exists as the confidential vault path with encrypted balance handle support.
- `BlindOracleAnalyst.sol` exists for oracle query/response flows.
- `MockRWAToken.sol` provides the current deployed Sepolia test token.
- `BlindOracleVault.sol` and `BlindOracleFHEVault.sol` now include baseline compliance controls:
  - owner-managed compliance toggle
  - owner-managed user allowlist
  - allowlist update events

### Oracle / AI Analyst

- Oracle backend reads live Sepolia state with viem.
- `POST /analyze` returns portfolio analysis from live wallet and vault state.
- Groq is optional; the backend falls back to deterministic rule-based analysis.
- Fallback analysis now uses the live token symbol from the snapshot instead of hardcoded `RWA`.

## Key Improvements Needed

### 1. ERC20 / RWA Support

Goal: make the frontend clearly use BlindOracle's RWA token as the main asset. Token switching is deferred until multi-vault or multi-asset support is designed.

Tasks:

- Keep the main display token as `RWA` for the demo.
- Keep the default/selected token focused on the configured RWA token.
- Revisit token switching after the multi-asset model is designed.
- Clearly label the currently active token address.
- Keep user-facing labels focused on the `RWA` token.
- Important technical note: the current public vault assumes 18-decimal ERC20 units.

### 2. Confidential FHE Vault Visibility

Goal: make the Zama/FHE value visible in the UI, not only in the contracts.

Tasks:

- Add frontend reads for `BlindOracleFHEVault.sol`. Done.
- Clearly show the encrypted balance handle. Done.
- Add this note beside the handle:

```text
This balance is encrypted - only authorized parties can decrypt via Zama KMS.
```

- Add loading and empty states for users without a confidential vault. Done.
- Add a copy button for the encrypted handle. Done.
- Add encrypted private deposit and withdrawal actions. Next.

### 3. Basic Compliance And Access Control

Goal: make the RWA story stronger by adding basic compliance primitives.

Tasks:

- Add allowlist or role-based access control to contracts.
- Restrict vault creation/deposit for non-allowlisted users.
- Add owner/admin role management.
- Emit events for allowlist updates.
- Add tests for:
  - allowed user can create/deposit
  - blocked user cannot create/deposit
  - admin can update compliance status
  - non-admin cannot update compliance status

### 4. Public Vault And Confidential Vault Separation

Goal: make the product direction clear without making the dashboard confusing.

Tasks:

- Keep the dashboard focused on the working public ERC20 vault. Done.
- Keep the AI analyst in its own tab. Done.
- Keep the confidential FHE flow in a separate tab. Done.
- Add calls-to-action for creating a confidential vault. Done.
- Add private encrypted deposit/withdraw buttons later.

### 5. AI Analyst Prominence

Goal: make AI feel like a core feature, not a secondary tab.

Tasks:

- Add a prominent AI analyst panel on the dashboard.
- Keep custom question input visible.
- Add stronger prompt chips, for example:
  - `How much can I deposit?`
  - `How can I earn more?`
  - `Assess my RWA risk`
  - `Compare public vs confidential vault`
- Show latest AI answer near portfolio stats.
- Make offline/oracle-unavailable states clearer.

### 6. Multi-Asset Support

Goal: support RWA plus at least one additional token later.

Tasks:

- Add contract/data model support for multiple assets.
- Add frontend portfolio allocation across assets.
- Add oracle snapshot support for multiple token addresses.
- Add per-token price and APY feeds.
- Add tests for deposits and portfolio reporting across multiple assets.

### 7. Real Price And APY Data

Goal: replace demo constants with real or live data.

Tasks:

- Replace hardcoded `VITE_RWA_USD_PRICE`.
- Replace hardcoded `VITE_RWA_APY_PERCENT`.
- Use an API or oracle source for price and APY.
- Show source and last-updated timestamp in the UI.
- Add fallback behavior if the feed is unavailable.

## Recommended Next Build Order

1. Add encrypted private deposit and withdrawal actions.
2. Add Zama KMS user-decrypt permission flow.
3. Add admin allowlist management UI or scripts.
4. Decide the final token-switching model after multi-asset support is designed.
5. Add multi-asset support.
6. Replace demo price/APY values with live data.

## Current Known Limitations

- Public vault balances are intentionally readable for the demo.
- Confidential vault creation is available in its own tab, but private deposit/withdraw actions are not wired yet.
- The full Zama KMS decryption permission flow is not implemented in the frontend.
- Public vault assumes 18-decimal ERC20 tokens.
- Price and APY are still demo/config values.
- Multi-asset portfolio support is not yet implemented.
