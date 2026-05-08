require('dotenv').config();
const { createPublicClient, createWalletClient, http, parseEther } = require('viem');
const { sepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const CONTRACT_ABI = [
  {
    type: 'function',
    name: 'submitQuery',
    inputs: [
      { name: 'inputQuery', type: 'bytes32[]' },
      { name: 'inputProof', type: 'bytes[]' }
    ],
    outputs: [{ name: 'queryId', type: 'uint256' }],
    stateMutability: 'payable'
  },
  {
    type: 'function',
    name: 'inferenceFee',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'event',
    name: 'QuerySubmitted',
    inputs: [
      { indexed: true, name: 'queryId', type: 'uint256' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'timestamp', type: 'uint256' }
    ]
  }
];

const CONFIG = {
  rpcUrl: process.env.RPC_URL || 'https://sepolia.gateway.tenderly.co',
  privateKey: process.env.PRIVATE_KEY,
  contractAddress: process.env.CONTRACT_ADDRESS,
};

const account = privateKeyToAccount(CONFIG.privateKey);

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(CONFIG.rpcUrl),
});

const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(CONFIG.rpcUrl),
  account,
});

async function submitTestQuery() {
  console.log('🧪 Submitting test query...\n');
  console.log(`Contract: ${CONFIG.contractAddress}`);
  console.log(`From: ${account.address}\n`);

  try {
    // Get the required fee
    const fee = await publicClient.readContract({
      address: CONFIG.contractAddress,
      abi: CONTRACT_ABI,
      functionName: 'inferenceFee',
    });

    console.log(`💰 Inference fee: ${fee.toString()} wei\n`);

    // Create mock encrypted data (bytes32 array)
    // In production, this would be real FHE-encrypted data
    const mockQuery = [
      '0x' + '01'.repeat(32), // Mock encrypted "Hello"
      '0x' + '02'.repeat(32), // Mock encrypted "World"
    ];

    const mockProofs = [
      '0x' + '00'.repeat(64),
      '0x' + '00'.repeat(64),
    ];

    console.log('📝 Submitting query to contract...');

    // Submit the query
    const hash = await walletClient.writeContract({
      address: CONFIG.contractAddress,
      abi: CONTRACT_ABI,
      functionName: 'submitQuery',
      args: [mockQuery, mockProofs],
      value: fee,
    });

    console.log(`✅ Transaction sent: ${hash}`);
    console.log('⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}!`);
    console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

    // Find the QuerySubmitted event
    const queryEvent = receipt.logs.find(log => {
      try {
        const parsed = publicClient.parseEvent({
          abi: CONTRACT_ABI,
          data: log.data,
          topics: log.topics,
        });
        return parsed.eventName === 'QuerySubmitted';
      } catch {
        return false;
      }
    });

    if (queryEvent) {
      console.log('\n📬 QuerySubmitted event detected!');
      console.log('The oracle should now process this query.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('insufficient funds')) {
      console.log('\n💡 Tip: Make sure the wallet has enough Sepolia ETH for gas + inference fee');
    }
  }
}

submitTestQuery();
