require('dotenv').config();

const httpServer = require('http');
const crypto = require('crypto');
const { createPublicClient, createWalletClient, decodeEventLog, formatUnits, http, isAddress } = require('viem');
const { sepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const deployment = require('../deployment-blindoracle.json');
const ANALYST_ABI = require('../artifacts/contracts/BlindOracleAnalyst.sol/BlindOracleAnalyst.json').abi;
const VAULT_ABI = require('../artifacts/contracts/BlindOracleVault.sol/BlindOracleVault.json').abi;
const TOKEN_ABI = require('../artifacts/contracts/MockRWAToken.sol/MockRWAToken.json').abi;

const QUERY_SUBMITTED_EVENT = ANALYST_ABI.find((item) => item.name === 'QuerySubmitted');

const CONFIG = {
  rpcUrl: process.env.RPC_URL || 'https://sepolia.gateway.tenderly.co',
  privateKey: process.env.PRIVATE_KEY,
  analystAddress: process.env.CONTRACT_ADDRESS || deployment.BlindOracle.analyst,
  vaultAddress: process.env.VAULT_ADDRESS || deployment.BlindOracle.vault,
  tokenAddress: process.env.TOKEN_ADDRESS || deployment.MockToken.address,
  port: Number(process.env.ORACLE_PORT || 8787),
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
};

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(CONFIG.rpcUrl),
});

const account = CONFIG.privateKey ? privateKeyToAccount(CONFIG.privateKey) : null;
const walletClient = account
  ? createWalletClient({
      chain: sepolia,
      transport: http(CONFIG.rpcUrl),
      account,
    })
  : null;

const processedQueries = new Set();

function toJSONSafe(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item)));
}

function sendJson(res, statusCode, payload) {
  const body = statusCode === 204 ? '' : JSON.stringify(toJSONSafe(payload));
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readPortfolioSnapshot(userAddress) {
  const [blockNumber, tokenSymbol, tokenName, tokenDecimals, tokenBalance, hasVault] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.readContract({ address: CONFIG.tokenAddress, abi: TOKEN_ABI, functionName: 'symbol' }),
    publicClient.readContract({ address: CONFIG.tokenAddress, abi: TOKEN_ABI, functionName: 'name' }),
    publicClient.readContract({ address: CONFIG.tokenAddress, abi: TOKEN_ABI, functionName: 'decimals' }),
    publicClient.readContract({ address: CONFIG.tokenAddress, abi: TOKEN_ABI, functionName: 'balanceOf', args: [userAddress] }),
    publicClient.readContract({ address: CONFIG.vaultAddress, abi: VAULT_ABI, functionName: 'hasVault', args: [userAddress] }),
  ]);

  let vaultBalance = 0n;
  let depositCount = 0n;

  if (hasVault) {
    [vaultBalance, depositCount] = await Promise.all([
      publicClient.readContract({
        address: CONFIG.vaultAddress,
        abi: VAULT_ABI,
        functionName: 'getBalance',
        account: userAddress,
      }),
      publicClient.readContract({
        address: CONFIG.vaultAddress,
        abi: VAULT_ABI,
        functionName: 'getDepositCount',
        args: [userAddress],
      }),
    ]);
  }

  const walletTokenBalance = Number(formatUnits(tokenBalance, tokenDecimals));
  const vaultedTokenBalance = Number(vaultBalance);
  const totalTrackedTokens = walletTokenBalance + vaultedTokenBalance;

  return {
    source: 'live-sepolia-onchain',
    readAt: new Date().toISOString(),
    blockNumber,
    userAddress,
    contracts: {
      analyst: CONFIG.analystAddress,
      vault: CONFIG.vaultAddress,
      token: CONFIG.tokenAddress,
    },
    token: {
      name: tokenName,
      symbol: tokenSymbol,
      decimals: tokenDecimals,
      walletRaw: tokenBalance,
      walletFormatted: walletTokenBalance,
    },
    vault: {
      exists: hasVault,
      balanceRaw: vaultBalance,
      balanceFormatted: vaultedTokenBalance,
      depositCount,
    },
    derived: {
      totalTrackedTokens,
      vaultedSharePercent: totalTrackedTokens > 0 ? (vaultedTokenBalance / totalTrackedTokens) * 100 : 0,
      walletSharePercent: totalTrackedTokens > 0 ? (walletTokenBalance / totalTrackedTokens) * 100 : 0,
    },
    limitations: [
      'The vault escrows the mock ERC20 token and records a plaintext demo balance; production FHE accounting is not enabled yet.',
      'No live price feed, APY feed, or multi-asset allocation feed is connected yet.',
    ],
  };
}

function getRuleBasedLiveAnalysis(queryText, snapshot) {
  const symbol = snapshot.token.symbol;
  const vaultBalance = snapshot.vault.balanceFormatted.toLocaleString();
  const walletBalance = snapshot.token.walletFormatted.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const total = snapshot.derived.totalTrackedTokens.toLocaleString(undefined, { maximumFractionDigits: 4 });
  const vaultShare = snapshot.derived.vaultedSharePercent.toFixed(2);
  const walletShare = snapshot.derived.walletSharePercent.toFixed(2);

  if (!snapshot.vault.exists) {
    return `Your RWA allocation is currently 100% liquid wallet holdings: ${walletBalance} ${symbol}. Create a BlindOracle vault and deposit tokens to begin building a protected vault allocation.`;
  }

  const lower = queryText.toLowerCase();
  if (lower.includes('allocation') || lower.includes('portfolio')) {
    return `Your RWA token allocation is ${vaultShare}% secured in the BlindOracle vault (${vaultBalance} ${symbol}) and ${walletShare}% still liquid in your wallet (${walletBalance} ${symbol}). Total tracked exposure is ${total} ${symbol}; consider moving more tokens into the vault if your goal is stronger protected allocation.`;
  }

  if (lower.includes('yield') || lower.includes('apr') || lower.includes('return')) {
    return `Your vault allocation currently holds ${vaultBalance} ${symbol} across ${snapshot.vault.depositCount} deposit${Number(snapshot.vault.depositCount) === 1 ? '' : 's'}. Yield is not calculated yet because this RWA token has no connected rate feed, but your protected allocation is ${vaultShare}% of total tracked holdings.`;
  }

  if (lower.includes('risk')) {
    return `Your current RWA allocation is mostly liquid wallet exposure at ${walletShare}%, with ${vaultShare}% protected in the vault. A higher vault allocation can reduce wallet-side exposure, while keeping too much in the wallet leaves more tokens outside the protected vault flow.`;
  }

  return `Your RWA token position totals ${total} ${symbol}: ${vaultBalance} ${symbol} in the BlindOracle vault and ${walletBalance} ${symbol} in your wallet. That gives you a ${vaultShare}% protected vault allocation and ${walletShare}% liquid wallet allocation.`;
}

async function getAIResponse(queryText, snapshot) {
  const hasGroqKey = CONFIG.groqApiKey && CONFIG.groqApiKey !== 'your_groq_api_key_here';

  if (!hasGroqKey) {
    return {
      text: getRuleBasedLiveAnalysis(queryText, snapshot),
      model: 'live-rule-based-fallback',
    };
  }

  try {
    const axios = require('axios');
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: CONFIG.groqModel,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `You are the BlindOracle live portfolio analyst.

Use only the live on-chain snapshot provided by the backend. Do not invent balances, APY, risk scores, market prices, or asset allocations. If a data source is not connected, say that plainly and suggest the next integration needed.

Keep the answer concise, useful, and specific. Mention the Sepolia block number so the user knows it is live.`,
          },
          {
            role: 'user',
            content: `User question: ${queryText}

Live snapshot:
${JSON.stringify(toJSONSafe(snapshot), null, 2)}`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${CONFIG.groqApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      text: response.data.choices[0].message.content,
      model: CONFIG.groqModel,
    };
  } catch (error) {
    console.error('Groq API error:', error.message);
    return {
      text: getRuleBasedLiveAnalysis(queryText, snapshot),
      model: 'live-rule-based-fallback',
    };
  }
}

function mockEncrypt(value) {
  const hash = crypto.createHash('sha256').update(value.toString()).digest('hex');
  return `0x${hash}`;
}

function mockProof() {
  return `0x${'00'.repeat(64)}`;
}

async function encryptResponse(responseText) {
  return {
    handle: mockEncrypt(responseText),
    proof: mockProof(),
  };
}

async function submitResponse(queryId, encryptedResponse) {
  if (!walletClient) {
    throw new Error('PRIVATE_KEY is required for on-chain oracle responses');
  }

  const hash = await walletClient.writeContract({
    address: CONFIG.analystAddress,
    abi: ANALYST_ABI,
    functionName: 'respondToQuery',
    args: [BigInt(queryId), encryptedResponse.handle, encryptedResponse.proof],
  });

  console.log(`Response submitted. Transaction hash: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Response transaction confirmed.');
  return hash;
}

async function processQuery(queryId) {
  if (processedQueries.has(queryId.toString())) return;

  console.log(`Processing on-chain query #${queryId}...`);
  processedQueries.add(queryId.toString());

  try {
    const [user, queryType, responded] = await publicClient.readContract({
      address: CONFIG.analystAddress,
      abi: ANALYST_ABI,
      functionName: 'getQueryDetails',
      args: [BigInt(queryId)],
    });

    if (responded) {
      console.log(`Query #${queryId} already responded; skipping.`);
      return;
    }

    const snapshot = await readPortfolioSnapshot(user);
    const analysis = await getAIResponse(queryType, snapshot);
    const encryptedResponse = await encryptResponse(analysis.text);
    await submitResponse(queryId, encryptedResponse);

    console.log(`Query #${queryId} processed successfully.`);
  } catch (error) {
    console.error(`Error processing query #${queryId}:`, error.message);
    processedQueries.delete(queryId.toString());
  }
}

async function handleAnalyzeRequest(req, res) {
  try {
    const body = JSON.parse(await readBody(req));
    const userAddress = body.userAddress;
    const query = (body.query || '').trim();

    if (!isAddress(userAddress)) {
      return sendJson(res, 400, { error: 'A valid userAddress is required.' });
    }

    if (!query) {
      return sendJson(res, 400, { error: 'A non-empty query is required.' });
    }

    const snapshot = await readPortfolioSnapshot(userAddress);
    const analysis = await getAIResponse(query, snapshot);

    return sendJson(res, 200, {
      analysis: analysis.text,
      model: analysis.model,
      snapshot,
    });
  } catch (error) {
    console.error('Analyze request failed:', error.message);
    return sendJson(res, 500, { error: error.message || 'Analysis failed.' });
  }
}

function startApiServer() {
  const server = httpServer.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      return sendJson(res, 204, {});
    }

    if (req.method === 'GET' && req.url === '/health') {
      return sendJson(res, 200, {
        ok: true,
        mode: 'live-onchain-analysis',
        analystAddress: CONFIG.analystAddress,
        vaultAddress: CONFIG.vaultAddress,
        tokenAddress: CONFIG.tokenAddress,
      });
    }

    if (req.method === 'POST' && req.url === '/analyze') {
      return handleAnalyzeRequest(req, res);
    }

    return sendJson(res, 404, { error: 'Not found.' });
  });

  server.listen(CONFIG.port, () => {
    console.log(`Live analyst API listening at http://localhost:${CONFIG.port}`);
  });
}

async function startListening() {
  if (!walletClient || !account) {
    console.log('PRIVATE_KEY not set; on-chain response listener disabled. HTTP live analysis still works.');
    return;
  }

  console.log('Starting optional on-chain query listener...');
  console.log(`Analyst contract: ${CONFIG.analystAddress}`);
  console.log(`Operator: ${account.address}`);

  const latestBlock = await publicClient.getBlockNumber();
  const fromBlock = latestBlock - BigInt(100);

  const unwatch = publicClient.watchEvent({
    address: CONFIG.analystAddress,
    event: QUERY_SUBMITTED_EVENT,
    fromBlock,
    onLogs: (logs) => {
      logs.forEach((log) => {
        const decoded = decodeEventLog({
          abi: ANALYST_ABI,
          data: log.data,
          topics: log.topics,
        });
        processQuery(decoded.args.queryId);
      });
    },
    onError: (error) => {
      console.error('Event listening error:', error.message);
    },
  });

  process.on('SIGINT', () => {
    console.log('Shutting down oracle listener...');
    unwatch();
    process.exit(0);
  });
}

startApiServer();
startListening().catch(console.error);
