/**
 * Private AI Agent - Client-side integration
 *
 * This module handles:
 * - Encrypting user queries using Zama SDK
 * - Submitting encrypted queries to the contract
 * - Retrieving and decrypting responses
 */

import { ZamaSDK, RelayerWeb, IndexedDBStorage } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// Contract ABI (minimal - add full ABI after compilation)
const PRIVATE_AI_ABI = [
  {
    inputs: [{ name: "_encryptedQuery", type: "bytes[]" }],
    name: "submitQuery",
    outputs: [{ name: "queryId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "_queryId", type: "uint256" }],
    name: "getResponse",
    outputs: [
      { name: "encryptedResponse", type: "bytes" },
      { name: "responded", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export class PrivateAIAgent {
  private sdk: ZamaSDK;
  private contractAddress: string;

  constructor(contractAddress: string, privateKey: string) {
    // Create viem clients
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(),
    });

    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const walletClient = createWalletClient({
      chain: sepolia,
      transport: http(),
      account,
    });

    // Initialize Zama SDK
    this.sdk = new ZamaSDK({
      relayer: new RelayerWeb({
        network: "sepolia",
        chainId: 11155111,
      }),
      signer: new ViemSigner({ walletClient, publicClient }),
      storage: new IndexedDBStorage(),
    });

    this.contractAddress = contractAddress;
  }

  /**
   * Encrypt a text query and submit to the contract
   */
  async submitQuery(queryText: string): Promise<bigint> {
    console.log("🔐 Encrypting query...");

    // Convert text to encrypted tokens (simplified - in production, use proper tokenization)
    const queryBytes = new TextEncoder().encode(queryText);

    // Get the token instance for encryption
    const token = await this.sdk.createToken(this.contractAddress);

    // Encrypt each byte (simplified approach)
    const encryptedQuery = await Promise.all(
      Array.from(queryBytes).map((byte) => token.encrypt(byte))
    );

    console.log("📤 Submitting encrypted query...");

    // Submit to contract
    const txHash = await token.transact("submitQuery", [encryptedQuery], {
      value: 0n,
    });

    console.log("✅ Query submitted! Tx:", txHash);

    // Parse queryId from transaction (simplified - parse actual logs in production)
    const queryId = BigInt(Date.now()); // Placeholder
    return queryId;
  }

  /**
   * Retrieve and decrypt the response
   */
  async getResponse(queryId: bigint): Promise<string> {
    console.log("📥 Retrieving response...");

    const token = await this.sdk.createToken(this.contractAddress);

    // Get encrypted response from contract
    const { encryptedResponse, responded } = await token.call("getResponse", [
      queryId,
    ]);

    if (!responded) {
      throw new Error("Query not yet responded to");
    }

    console.log("🔓 Decrypting response...");

    // Decrypt the response
    const decryptedBytes = await token.decrypt(encryptedResponse);

    // Convert bytes back to string
    const responseText = new TextDecoder().decode(decryptedBytes);

    return responseText;
  }

  /**
   * Full flow: submit query and wait for response
   */
  async query(queryText: string, pollIntervalMs: number = 5000): Promise<string> {
    const queryId = await this.submitQuery(queryText);

    console.log("⏳ Waiting for response...");

    // Poll for response
    while (true) {
      try {
        const response = await this.getResponse(queryId);
        return response;
      } catch (e) {
        console.log("Still waiting...");
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }
  }
}

// Usage example
async function main() {
  const contractAddress = "0x..."; // Your deployed contract
  const privateKey = process.env.PRIVATE_KEY!;

  const agent = new PrivateAIAgent(contractAddress, privateKey);

  // Submit a private query
  const response = await agent.query("What is 2 + 2?");
  console.log("🎉 Response:", response);
}

// Uncomment to run directly
// main();
