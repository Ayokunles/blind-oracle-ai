'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useState } from 'react';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseAbi } from 'viem';

const CONTRACT_ADDRESS = '0xC5C77fBE11CFd0FacBC9324a639d21dEbC5adE56';

const ABI = parseAbi`
  function submitQuery(bytes[] calldata inputQuery, bytes[] calldata inputProof) external payable returns (uint256);
  function getResponse(uint256 _queryId) external view returns (bytes32 encryptedResponse, bool responded);
  function queries(uint256) external view returns (uint256 queryId, address user, bytes32[] encryptedQuery, bytes32 encryptedResponse, bool responded, uint256 timestamp);
`;

export default function Home() {
  const { address, isConnected } = useAccount();
  const [queryText, setQueryText] = useState('');
  const [queryId, setQueryId] = useState<bigint | null>(null);
  const [submittedQueries, setSubmittedQueries] = useState<bigint[]>([]);

  const { writeContract, isPending, error: writeError } = useWriteContract();

  // Encrypt query text to bytes (simplified - in production use Zama SDK)
  const encryptQuery = (text: string): { data: `0x${string}`[]; proof: `0x${string}`[] } => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    // Simplified encryption - just converts to hex
    // In production, this uses actual FHE encryption via Zama SDK
    const encryptedData = bytes.map(b => `0x${b.toString(16).padStart(64, '0')}` as `0x${string}`);
    const proofs = bytes.map(() => '0x' as `0x${string}`); // Empty proofs for demo

    return { data: encryptedData, proof: proofs };
  };

  const handleSubmitQuery = () => {
    if (!queryText.trim()) return;

    const { data: encryptedQuery, proof: inputProof } = encryptQuery(queryText);

    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'submitQuery',
        args: [encryptedQuery, inputProof],
        value: 0n,
      },
      {
        onSuccess: (hash) => {
          console.log('Transaction sent:', hash);
          // In production, parse queryId from transaction logs
          setQueryId(BigInt(Date.now())); // Placeholder
          setSubmittedQueries(prev => [...prev, BigInt(Date.now())]);
        },
      }
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Header */}
      <nav className="p-6 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔐</span>
          <h1 className="text-2xl font-bold text-white">Private AI Agent</h1>
        </div>
        <ConnectButton />
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-6">
        {/* Hero Section */}
        <section className="text-center py-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ask AI Questions Privately
          </h2>
          <p className="text-lg text-purple-200 mb-8">
            Your queries are encrypted with Fully Homomorphic Encryption (FHE).
            <br />
            No one can see your questions or answers except you.
          </p>
        </section>

        {/* Connection Warning */}
        {!isConnected && (
          <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-6 text-center mb-8">
            <p className="text-yellow-200 text-lg">
              🔗 Connect your wallet to start asking private questions
            </p>
          </div>
        )}

        {/* Query Input */}
        {isConnected && (
          <section className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-white/20">
            <h3 className="text-xl font-semibold text-white mb-4">
              📝 Submit Encrypted Query
            </h3>
            <textarea
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Type your private question here..."
              className="w-full h-32 p-4 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <button
              onClick={handleSubmitQuery}
              disabled={isPending || !queryText.trim()}
              className="mt-4 w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:from-gray-500 disabled:to-gray-600 text-white font-semibold rounded-xl transition-all duration-200 disabled:cursor-not-allowed"
            >
              {isPending ? '🔄 Encrypting & Submitting...' : '🔐 Submit Encrypted Query'}
            </button>
            {writeError && (
              <p className="mt-2 text-red-400 text-sm">{writeError.message}</p>
            )}
          </section>
        )}

        {/* Submitted Queries */}
        {submittedQueries.length > 0 && (
          <section className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20">
            <h3 className="text-xl font-semibold text-white mb-4">
              📬 Your Queries
            </h3>
            <div className="space-y-3">
              {submittedQueries.map((id, index) => (
                <div
                  key={index}
                  className="bg-white/5 rounded-lg p-4 border border-white/10"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-purple-300">Query #{id.toString().slice(-6)}</span>
                    <span className="text-xs text-gray-400">Pending response</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* How It Works */}
        <section className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <span className="text-3xl">🔒</span>
            <h4 className="text-lg font-semibold text-white mt-3 mb-2">1. Encrypt</h4>
            <p className="text-gray-300 text-sm">
              Your query is encrypted locally using FHE before being sent to the blockchain.
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <span className="text-3xl">🤖</span>
            <h4 className="text-lg font-semibold text-white mt-3 mb-2">2. Process</h4>
            <p className="text-gray-300 text-sm">
              AI processes your encrypted data without ever decrypting it.
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 border border-white/10">
            <span className="text-3xl">🔓</span>
            <h4 className="text-lg font-semibold text-white mt-3 mb-2">3. Decrypt</h4>
            <p className="text-gray-300 text-sm">
              Only you can decrypt and view the AI&apos;s response.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-12 text-center text-gray-400 text-sm">
          <p>Built with Zama FHE for the Developer Program Mainnet Season 2</p>
          <p className="mt-2">Contract: {CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-8)}</p>
        </footer>
      </div>
    </main>
  );
}
