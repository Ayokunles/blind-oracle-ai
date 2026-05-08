require('dotenv').config();

const httpServer = require('http');
const crypto = require('crypto');
const { createPublicClient, createWalletClient, decodeEventLog, formatUnits, http, isAddress } = require('viem');
const { sepolia } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const deployment = require('../deployment-blindoracle.json');
const ANALYST_ABI = require('../artifacts/contracts/BlindOracleAnalyst.sol/BlindOracleAnalyst.json').abi;
const VAULT_ABI = require('../artifacts/contracts/BlindOracleVault.sol/BlindOracleVault.json').abi;
const FHE_VAULT_ABI = require('../artifacts/contracts/BlindOracleFHEVault.sol/BlindOracleFHEVault.json').abi;
const TOKEN_ABI = require('../artifacts/contracts/MockRWAToken.sol/MockRWAToken.json').abi;

const QUERY_SUBMITTED_EVENT = ANALYST_ABI.find((item) => item.name === 'QuerySubmitted');

const CONFIG = {
  rpcUrl: process.env.RPC_URL || 'https://sepolia.gateway.tenderly.co',
  privateKey: process.env.PRIVATE_KEY,
  analystAddress: process.env.CONTRACT_ADDRESS || deployment.BlindOracle.analyst,
  vaultAddress: process.env.VAULT_ADDRESS || deployment.BlindOracle.vault,
  fheVaultAddress: process.env.FHE_VAULT_ADDRESS || deployment.BlindOracle.fheVault,
  tokenAddress: process.env.TOKEN_ADDRESS || deployment.MockToken.address,
  port: Number(process.env.ORACLE_PORT || 8787),
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  yieldApyBps: Number(process.env.YIELD_APY_BPS || 520),
  yieldSource: process.env.YIELD_SOURCE || 'configured-demo-rate',
  rwaUsdPrice: Number(process.env.RWA_USD_PRICE || 1),
  priceApiUrl: process.env.PRICE_API_URL || 'https://api.coingecko.com/api/v3/simple/price?ids=ondo-finance&vs_currencies=usd',
  priceCacheTtlMs: Number(process.env.PRICE_CACHE_TTL_MS || 60000),
  apySourceUrl: process.env.APY_SOURCE_URL || '',
};

// ── Price feed cache ────────────────────────────────────────────────────────
let priceCache = { price: CONFIG.rwaUsdPrice, apy: CONFIG.yieldApyBps / 100, source: 'config-fallback', lastUpdated: null, fetchedAt: 0 };

async function fetchLivePrice() {
  const now = Date.now();
  if (priceCache.lastUpdated && now - priceCache.fetchedAt < CONFIG.priceCacheTtlMs) {
    return priceCache;
  }

  try {
    const axios = require('axios');
    const res = await axios.get(CONFIG.priceApiUrl, { timeout: 5000 });
    // CoinGecko returns { ethereum: { usd: 3200 } } for the default URL
    const keys = Object.keys(res.data);
    const firstKey = keys[0];
    const price = res.data[firstKey]?.usd ?? CONFIG.rwaUsdPrice;

    let apy = CONFIG.yieldApyBps / 100;
    if (CONFIG.apySourceUrl) {
      try {
        const apyRes = await axios.get(CONFIG.apySourceUrl, { timeout: 5000 });
        apy = Number(apyRes.data?.apy ?? apyRes.data?.apyPercent ?? apy);
      } catch { /* keep default */ }
    }

    priceCache = { price, apy, source: 'live-coingecko', lastUpdated: new Date().toISOString(), fetchedAt: now };
  } catch (err) {
    console.error('Price feed fetch failed:', err.message);
    priceCache = { ...priceCache, source: 'config-fallback', lastUpdated: new Date().toISOString(), fetchedAt: now };
  }

  return priceCache;
}

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

async function readPortfolioSnapshot(userAddress, extraTokenAddresses = [], fheUsdcBalance = 0) {
  const [blockNumber, tokenSymbol, tokenName, tokenDecimals, tokenBalance, hasVault, hasPrivateVault] = await Promise.all([
    publicClient.getBlockNumber(),
    publicClient.readContract({ address: CONFIG.tokenAddress, abi: TOKEN_ABI, functionName: 'symbol' }),
    publicClient.readContract({ address: CONFIG.tokenAddress, abi: TOKEN_ABI, functionName: 'name' }),
    publicClient.readContract({ address: CONFIG.tokenAddress, abi: TOKEN_ABI, functionName: 'decimals' }),
    publicClient.readContract({ address: CONFIG.tokenAddress, abi: TOKEN_ABI, functionName: 'balanceOf', args: [userAddress] }),
    publicClient.readContract({ address: CONFIG.vaultAddress, abi: VAULT_ABI, functionName: 'hasVault', args: [userAddress] }),
    CONFIG.fheVaultAddress
      ? publicClient.readContract({ address: CONFIG.fheVaultAddress, abi: FHE_VAULT_ABI, functionName: 'hasPrivateVault', args: [userAddress] })
      : Promise.resolve(false),
  ]);

  let vaultBalance = 0n;
  let depositCount = 0n;
  let encryptedBalanceHandle = null;
  let privateOperationCount = 0n;

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

  if (hasPrivateVault) {
    [encryptedBalanceHandle, privateOperationCount] = await Promise.all([
      publicClient.readContract({
        address: CONFIG.fheVaultAddress,
        abi: FHE_VAULT_ABI,
        functionName: 'getEncryptedBalanceHandle',
        args: [userAddress],
      }),
      publicClient.readContract({
        address: CONFIG.fheVaultAddress,
        abi: FHE_VAULT_ABI,
        functionName: 'getPrivateOperationCount',
        args: [userAddress],
      }),
    ]);
  }

  const livePriceFeed = await fetchLivePrice();
  const rwaUsdPrice = livePriceFeed.price;
  const apyPercent = livePriceFeed.apy;

  const walletTokenBalance = Number(formatUnits(tokenBalance, tokenDecimals));
  const vaultedTokenBalance = Number(vaultBalance);
  
  // ── Multi-asset balance reads ──────────────────────────────────────────
  const additionalAssets = [];
  let totalAdditionalUsd = fheUsdcBalance || 0; // Include simulated FHE USDC
  if (Array.isArray(extraTokenAddresses) && extraTokenAddresses.length > 0) {
    const ERC20_BALANCE_ABI = [{ type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
      { type: 'function', name: 'symbol', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
      { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' }];

    for (const addr of extraTokenAddresses.slice(0, 5)) {
      try {
        const [bal, sym, dec] = await Promise.all([
          publicClient.readContract({ address: addr, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [userAddress] }),
          publicClient.readContract({ address: addr, abi: ERC20_BALANCE_ABI, functionName: 'symbol' }),
          publicClient.readContract({ address: addr, abi: ERC20_BALANCE_ABI, functionName: 'decimals' }),
        ]);
        const formatted = Number(formatUnits(bal, dec));
        additionalAssets.push({ address: addr, symbol: sym, decimals: dec, walletRaw: bal.toString(), walletFormatted: formatted });
        
        // Assume USDC/USDT symbols are $1.00
        if (sym.toUpperCase().includes('USD')) {
          totalAdditionalUsd += formatted;
        }
      } catch (err) {
        additionalAssets.push({ address: addr, error: err.message });
      }
    }
  }

  const totalTrackedUsdValue = ((walletTokenBalance + vaultedTokenBalance) * rwaUsdPrice) + totalAdditionalUsd;
  const totalTrackedTokens = walletTokenBalance + vaultedTokenBalance; // Primary RWA asset count
  const estimatedAnnualYieldTokens = vaultedTokenBalance * (apyPercent / 100);
  const estimatedAnnualYieldUsd = estimatedAnnualYieldTokens * rwaUsdPrice;

  return {
    source: 'live-sepolia-onchain',
    readAt: new Date().toISOString(),
    blockNumber,
    userAddress,
    contracts: {
      analyst: CONFIG.analystAddress,
      vault: CONFIG.vaultAddress,
      fheVault: CONFIG.fheVaultAddress,
      token: CONFIG.tokenAddress,
    },
    token: {
      name: tokenName,
      symbol: tokenSymbol,
      decimals: tokenDecimals,
      walletRaw: tokenBalance.toString(),
      walletFormatted: walletTokenBalance,
    },
    vault: {
      exists: hasVault,
      balanceRaw: vaultBalance.toString(),
      balanceFormatted: vaultedTokenBalance,
      depositCount: depositCount.toString(),
    },
    confidentialVault: {
      exists: hasPrivateVault,
      encryptedBalanceHandle,
      operationCount: privateOperationCount.toString(),
      privacyModel: 'Zama FHE encrypted balance handle',
      decryptability: 'Only authorized parties can decrypt through Zama KMS permission flows.',
    },
    additionalAssets,
    derived: {
      totalTrackedTokens,
      totalTrackedUsdValue,
      vaultedSharePercent: totalTrackedUsdValue > 0 ? ((vaultedTokenBalance * rwaUsdPrice) / totalTrackedUsdValue) * 100 : 0,
      walletSharePercent: totalTrackedUsdValue > 0 ? (((walletTokenBalance * rwaUsdPrice) + totalAdditionalUsd) / totalTrackedUsdValue) * 100 : 0,
    },
    yield: {
      source: livePriceFeed.source,
      apyBps: Math.round(apyPercent * 100),
      apyPercent,
      estimatedAnnualYieldTokens,
      estimatedAnnualYieldUsd,
      rwaUsdPrice,
    },
    priceFeed: livePriceFeed,
    limitations: [
      'The vault escrows the mock ERC20 token and records a plaintext demo balance; production FHE accounting is not enabled yet.',
      'The Confidential FHE Vault stores encrypted balance handles; plaintext balances are not returned by the contract.',
    ],
  };
}

function getRuleBasedLiveAnalysis(queryText, snapshot) {
  const lower = queryText.toLowerCase();
  if (lower.includes('how are you') || lower.includes('hello') || lower.includes('hi ') || lower === 'hi') {
    return "I'm doing great! I'm currently monitoring the Sepolia blockchain for your RWA holdings. How can I help you with your portfolio today?";
  }

  const symbol = 'RWA';
  const vaultBalance = snapshot.vault.balanceFormatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const walletBalance = snapshot.token.walletFormatted.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const total = snapshot.derived.totalTrackedTokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const vaultShare = snapshot.derived.vaultedSharePercent.toFixed(2);
  const walletShare = snapshot.derived.walletSharePercent.toFixed(2);
  const depositCount = Number(snapshot.vault.depositCount);
  const apy = snapshot.yield.apyPercent.toFixed(2);
  const annualYield = snapshot.yield.estimatedAnnualYieldTokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const annualYieldUsd = snapshot.yield.estimatedAnnualYieldUsd.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
  const fullVaultYieldTokens = snapshot.derived.totalTrackedTokens * (snapshot.yield.apyPercent / 100);
  const extraYieldTokens = Math.max(0, fullVaultYieldTokens - snapshot.yield.estimatedAnnualYieldTokens);
  const fullVaultYield = fullVaultYieldTokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const extraYield = extraYieldTokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const fullVaultYieldUsd = (fullVaultYieldTokens * snapshot.yield.rwaUsdPrice).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
  const hasPrivateVault = Boolean(snapshot.confidentialVault?.exists);
  const privateOps = Number(snapshot.confidentialVault?.operationCount || 0);
  const encryptedHandle = snapshot.confidentialVault?.encryptedBalanceHandle;
  const shortHandle = encryptedHandle ? `${encryptedHandle.slice(0, 10)}...${encryptedHandle.slice(-6)}` : 'not created yet';

  if (lower.includes('public vault') || lower.includes('confidential vault') || lower.includes('compare')) {
    return `BlindOracle currently shows two paths for your ${symbol} exposure. Your public vault has ${vaultBalance} ${symbol} with ${depositCount} deposit operation${depositCount === 1 ? '' : 's'}; this is readable for the live ERC20 demo. Your Confidential FHE Vault is ${hasPrivateVault ? `created with encrypted handle ${shortHandle}` : 'not created yet'}, so Zama FHE can represent the balance as ciphertext instead of exposing plaintext financial data.`;
  }

  if (lower.includes('zama') || lower.includes('fhe') || lower.includes('protect') || lower.includes('privacy')) {
    return `BlindOracle uses Zama FHE for the confidential vault path: the balance is stored as an encrypted handle, and authorized decryption is handled through Zama KMS permission flows. That means the app can keep RWA accounting on-chain while avoiding plaintext balance exposure in the confidential path.`;
  }

  if (lower.includes('encrypted') || lower.includes('private risk') || lower.includes('balance risk')) {
    if (!hasPrivateVault) {
      return `Your encrypted balance risk is mainly setup risk right now: you have not created a Confidential FHE Vault yet. In BlindOracle, creating it moves the private accounting path to a Zama FHE encrypted handle so observers do not see the plaintext confidential balance.`;
    }

    return `Your Confidential FHE Vault exists and has ${privateOps} private operation${privateOps === 1 ? '' : 's'}. The encrypted balance handle is ${shortHandle}; the risk to watch is access control around who can request decryption through Zama KMS, not public plaintext balance leakage.`;
  }

  if (lower.includes('earn yield privately') || (lower.includes('yield') && (lower.includes('private') || lower.includes('privately')))) {
    return `Yes, BlindOracle's direction is private RWA yield: keep the public demo vault for transparent ERC20 deposits, then use the Confidential FHE Vault to represent sensitive balances with Zama FHE. In the current demo, yield is estimated from the public vaulted balance at ${apy}% APY; private yield accounting and encrypted private deposits are the next product step.`;
  }

  if (!snapshot.vault.exists) {
    return `You have ${walletBalance} ${symbol} available in your wallet, but no vault has been created yet. Create a vault and move a portion of your holdings into it to start building a protected allocation.`;
  }

  const wantsEarningsAdvice =
    lower.includes('earn') ||
    lower.includes('grow') ||
    lower.includes('optimize') ||
    lower.includes('increase') ||
    lower.includes('make more') ||
    lower.includes('more yield') ||
    lower.includes('more return') ||
    lower.includes('yield') ||
    lower.includes('apr') ||
    lower.includes('return') ||
    lower.includes('deposit');

  if (wantsEarningsAdvice) {
    if (snapshot.token.walletFormatted > 0) {
      return `To earn more, the direct move is to vault more of your liquid balance. You currently have ${walletBalance} ${symbol} available to deposit. If you moved those into the vault, your estimated annual yield would rise at ${apy}% APY, adding roughly ${extraYield} ${symbol} to your portfolio every year.`;
    }
    return `Your full tracked balance is already vaulted. At the current ${apy}% APY, you are earning about ${annualYield} ${symbol} per year. To increase this, you would need to add more ${symbol} to your wallet first.`;
  }

  if (lower.includes('balance') || lower.includes('how much') || lower.includes('my tokens')) {
    const base = `You have ${walletBalance} ${symbol} in your wallet and ${vaultBalance} ${symbol} in the public vault.`;
    const priv = hasPrivateVault ? ` Your Confidential Vault is active and has recorded ${privateOps} private operations securely.` : " You haven't used the Confidential Vault yet.";
    return base + priv;
  }

  if (lower.includes('allocation') || lower.includes('portfolio')) {
    return `Your portfolio is weighted toward the vault: ${vaultShare}% is vaulted (${vaultBalance} ${symbol}) and ${walletShare}% remains liquid in your wallet (${walletBalance} ${symbol}). Total tracked exposure is ${total} ${symbol}.`;
  }

  if (lower.includes('risk')) {
    return `Your main exposure is split between vaulted and liquid holdings: ${vaultShare}% is in the vault and ${walletShare}% remains in your wallet. Keeping more funds vaulted can reduce wallet-side exposure, while keeping some liquid balance preserves flexibility.`;
  }

  if (lower.includes('private balance') || (lower.includes('balance') && lower.includes('private'))) {
    if (!hasPrivateVault) return "You haven't created a Confidential FHE Vault yet. Once created, your private balance will be stored as an encrypted Zama handle.";
    return `Your private balance is stored as an encrypted Zama FHE handle (${shortHandle}). Because it is encrypted, the exact number is hidden from the public blockchain, but I can see you have performed ${privateOps} private operation${privateOps === 1 ? '' : 's'}.`;
  }

  const publicSummary = `${vaultBalance} ${symbol} in the public vault and ${walletBalance} ${symbol} in your wallet`;
  const privateSummary = hasPrivateVault ? ` plus an encrypted balance in your Confidential Vault (${privateOps} ops)` : '';
  
  return `You currently track ${total} ${symbol}: ${publicSummary}${privateSummary}. This gives you a ${vaultShare}% public vaulted allocation and a ${walletShare}% liquid allocation.`;
}

function buildAnalystContext(snapshot) {
  return {
    product: 'BlindOracle',
    privacyTechnology: 'Zama FHE',
    asset: 'RWA',
    vaultBalance: snapshot.vault.balanceFormatted,
    walletBalance: snapshot.token.walletFormatted,
    publicVaultExists: snapshot.vault.exists,
    confidentialVaultExists: snapshot.confidentialVault.exists,
    encryptedBalanceHandle: snapshot.confidentialVault.encryptedBalanceHandle,
    privateOperationCount: Number(snapshot.confidentialVault.operationCount),
    confidentialVaultNote:
      'BlindOracle Confidential FHE Vault stores the balance as an encrypted handle. Only authorized parties can decrypt through Zama KMS permission flows.',
    totalTrackedTokens: snapshot.derived.totalTrackedTokens,
    totalTrackedUsdValue: snapshot.derived.totalTrackedUsdValue,
    vaultedSharePercent: snapshot.derived.vaultedSharePercent,
    walletSharePercent: snapshot.derived.walletSharePercent,
    depositCount: Number(snapshot.vault.depositCount),
    apyPercent: snapshot.yield.apyPercent,
    estimatedAnnualYieldTokens: snapshot.yield.estimatedAnnualYieldTokens,
    estimatedAnnualYieldUsd: snapshot.yield.estimatedAnnualYieldUsd,
    fullVaultEstimatedAnnualYieldTokens: snapshot.derived.totalTrackedTokens * (snapshot.yield.apyPercent / 100),
    additionalYieldIfWalletIsVaultedTokens:
      Math.max(0, snapshot.derived.totalTrackedTokens * (snapshot.yield.apyPercent / 100) - snapshot.yield.estimatedAnnualYieldTokens),
    dataNotes: [
      'This is a single-asset RWA portfolio view.',
      'The public vault is readable for the live ERC20 demo.',
      'The confidential vault is the Zama FHE path for private RWA exposure.',
      'Multi-asset allocation and external market pricing are not connected yet.',
    ],
  };
}

function cleanAnalystText(text) {
  return text
    .replace(/^\s*Live Sepolia analysis at block\s+\d+\s*:\s*/i, '')
    .replace(/^\s*Sepolia analysis at block\s+\d+\s*:\s*/i, '')
    .replace(/\bMTBILL\b/g, 'RWA')
    .replace(/\bmock ERC20 token\b/gi, 'RWA token')
    .replace(/\bdemo token\b/gi, 'RWA token')
    .replace(/\bplaintext accounting model\b/gi, 'current vault model')
    .replace(/\bdeployed contracts?\b/gi, 'current data source')
    .replace(/\bproduction FHE balance accounting\b/gi, 'private balance accounting')
    .trim();
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
            content: `SYSTEM DESIGNATION: BlindOracle Sovereign Intelligence Analyst.
            PURPOSE: Generate high-fidelity risk assessments and allocation logic for institutional-grade RWA portfolios.
            STYLE: Cold, calculated, and strictly data-driven. Eliminate all conversational filler, greetings, and pleasantries.
            
            OPERATIONAL PARAMETERS:
            1. Summarize account data with mathematical precision.
            2. Identify vulnerabilities in current asset distribution.
            3. Optimize for maximum yield within current Zama FHE constraints.
            4. When referencing privacy, focus on the cryptographic security of the FHE balance handle.
            5. Present findings as intelligence summaries. Never use a "helpful assistant" tone.
            
            DATA CONSTRAINTS:
            - Refer to the primary asset as RWA.
            - Do not disclose contract addresses or block numbers.
            - Only acknowledge existing on-chain data provided in the context.`,
          },
          {
            role: 'user',
            content: `User question: ${queryText}

Portfolio context:
${JSON.stringify(buildAnalystContext(snapshot), null, 2)}`,
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
      text: cleanAnalystText(response.data.choices[0].message.content),
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
    const fheUsdcBalance = Number(body.fheUsdcBalance || 0);
    const query = (body.query || '').trim();
    const additionalTokens = Array.isArray(body.additionalTokens) ? body.additionalTokens.filter(isAddress) : [];

    if (!isAddress(userAddress)) {
      return sendJson(res, 400, { error: 'A valid userAddress is required.' });
    }

    if (!query) {
      return sendJson(res, 400, { error: 'A non-empty query is required.' });
    }

    const snapshot = await readPortfolioSnapshot(userAddress, additionalTokens, fheUsdcBalance);
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

async function handlePriceFeed(req, res) {
  try {
    const feed = await fetchLivePrice();
    return sendJson(res, 200, feed);
  } catch (error) {
    return sendJson(res, 500, { error: error.message || 'Price feed failed.' });
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
        fheVaultAddress: CONFIG.fheVaultAddress,
        tokenAddress: CONFIG.tokenAddress,
      });
    }

    if (req.method === 'GET' && req.url === '/price-feed') {
      return handlePriceFeed(req, res);
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
