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
  port: Number(process.env.PORT || process.env.ORACLE_PORT || 8787),
  groqApiKey: process.env.GROQ_API_KEY,
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  yieldApyBps: Number(process.env.YIELD_APY_BPS || 520),
  yieldSource: process.env.YIELD_SOURCE || 'configured-demo-rate',
  rwaUsdPrice: 0.45,
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
  const symbol = 'RWA';
  const formatToken = (value) => Number(value || 0).toFixed(4);
  const formatPercent = (value) => Number(value || 0).toFixed(2);
  const formatUsdValue = (value) => `$${Number(value || 0).toFixed(2)}`;
  const sectioned = (sections) =>
    sections
      .filter((section) => section?.content)
      .map((section) => section.label ? `${section.label}\n${section.content}` : section.content)
      .join('\n\n');

  if (lower.includes('how are you') || lower.includes('hello') || lower.includes('hi ') || lower === 'hi') {
    return sectioned(
      [{ content: 'I can answer wallet, portfolio, vault, balance, yield, risk, and privacy questions for your connected BlindOracle account.' }]
    );
  }

  const vaultBalance = formatToken(snapshot.vault.balanceFormatted);
  const walletBalance = formatToken(snapshot.token.walletFormatted);
  const total = formatToken(snapshot.derived.totalTrackedTokens);
  const vaultShare = snapshot.derived.vaultedSharePercent.toFixed(2);
  const walletShare = snapshot.derived.walletSharePercent.toFixed(2);
  const depositCount = Number(snapshot.vault.depositCount);
  const apy = snapshot.yield.apyPercent.toFixed(2);
  const annualYield = formatToken(snapshot.yield.estimatedAnnualYieldTokens);
  const annualYieldUsd = formatUsdValue(snapshot.yield.estimatedAnnualYieldUsd);
  const fullVaultYieldTokens = snapshot.derived.totalTrackedTokens * (snapshot.yield.apyPercent / 100);
  const extraYieldTokens = Math.max(0, fullVaultYieldTokens - snapshot.yield.estimatedAnnualYieldTokens);
  const fullVaultYield = formatToken(fullVaultYieldTokens);
  const extraYield = formatToken(extraYieldTokens);
  const fullVaultYieldUsd = formatUsdValue(fullVaultYieldTokens * snapshot.yield.rwaUsdPrice);
  const hasPrivateVault = Boolean(snapshot.confidentialVault?.exists);
  const privateOps = Number(snapshot.confidentialVault?.operationCount || 0);
  const encryptedHandle = snapshot.confidentialVault?.encryptedBalanceHandle;
  const shortHandle = encryptedHandle ? `${encryptedHandle.slice(0, 10)}...${encryptedHandle.slice(-6)}` : 'not created yet';

  if (lower.includes('public vault') || lower.includes('confidential vault') || lower.includes('compare')) {
    return sectioned(
      [
        { content: `Your public vault holds ${vaultBalance} ${symbol}; your Confidential FHE Vault is ${hasPrivateVault ? 'active' : 'not created yet'}.` },
        { label: 'Comparison Breakdown', content: `Public vault exposure is readable at ${vaultBalance} ${symbol} with ${depositCount} deposit operation${depositCount === 1 ? '' : 's'}. Confidential FHE Vault status is ${hasPrivateVault ? `active with encrypted handle ${shortHandle}` : 'not created yet'}, so sensitive balances can be represented as ciphertext instead of plaintext.` },
      ]
    );
  }

  if (lower.includes('zama') || lower.includes('fhe') || lower.includes('protect') || lower.includes('privacy')) {
    return sectioned(
      [{ content: 'Zama FHE protects the confidential vault by storing private balances as encrypted handles instead of plaintext values.' }]
    );
  }

  if (lower.includes('encrypted') || lower.includes('private risk') || lower.includes('balance risk')) {
    if (!hasPrivateVault) {
      return sectioned(
        [
          { content: 'You do not have encrypted balance protection active yet because no Confidential FHE Vault exists.' },
          { label: 'Vulnerability Assessment', content: 'The current vulnerability is setup risk: private accounting is unavailable until the confidential vault exists.' },
        ]
      );
    }

    return sectioned(
      [
        { content: `Your Confidential FHE Vault is active with ${privateOps} private operation${privateOps === 1 ? '' : 's'}.` },
        { label: 'Vulnerability Assessment', content: `Primary risk shifts from plaintext balance leakage to decryption permission control around handle ${shortHandle}.` },
      ]
    );
  }

  if (lower.includes('earn yield privately') || (lower.includes('yield') && (lower.includes('private') || lower.includes('privately')))) {
    return sectioned(
      [
        { content: `Private yield is represented by the confidential path, while current yield simulation uses the public vaulted balance at ${apy}% APY.` },
        { label: 'Optimization Analysis', content: 'Use the public vault for yield simulation and the Confidential FHE Vault for private balance representation.' },
      ]
    );
  }

  if (!snapshot.vault.exists) {
    return sectioned(
      [{ content: `You can deposit up to ${walletBalance} ${symbol} from your current liquid balance after creating a vault.` }]
    );
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

  const wantsDepositCapacity =
    lower.includes('how much can i deposit') ||
    lower.includes('how much may i deposit') ||
    lower.includes('what can i deposit') ||
    lower.includes('deposit limit') ||
    lower.includes('max deposit') ||
    lower.includes('maximum deposit') ||
    (lower.includes('how much') && lower.includes('deposit'));

  if (wantsDepositCapacity) {
    return sectioned(
      [{ content: `You can deposit up to ${walletBalance} ${symbol} from your current liquid balance.` }]
    );
  }

  if (wantsEarningsAdvice) {
    if (snapshot.token.walletFormatted > 0) {
      return sectioned(
        [
          { content: `You can deposit up to ${walletBalance} ${symbol} from your current liquid balance.` },
          { label: 'Optimization Analysis', content: `Vaulting the liquid balance at ${apy}% APY could add about ${extraYield} ${symbol} per year.` },
        ]
      );
    }
    return sectioned(
      [
        { content: `You do not have additional liquid ${symbol} available to deposit right now.` },
        { label: 'Optimization Analysis', content: `Current vaulted position earns about ${annualYield} ${symbol} per year at ${apy}% APY (${annualYieldUsd}).` },
      ]
    );
  }

  if (lower.includes('balance') || lower.includes('how much') || lower.includes('my tokens')) {
    return sectioned(
      [{ content: `You have ${walletBalance} ${symbol} in your wallet and ${vaultBalance} ${symbol} in the public vault.` }]
    );
  }

  if (lower.includes('allocation') || lower.includes('portfolio')) {
    return sectioned(
      [{ content: `Your portfolio is ${vaultShare}% vaulted and ${walletShare}% liquid across ${total} ${symbol}.` }]
    );
  }

  if (lower.includes('risk')) {
    return sectioned(
      [
        { content: `Your current risk is concentrated in a ${vaultShare}% vaulted and ${walletShare}% liquid split.` },
        { label: 'Vulnerability Assessment', content: `Exposure is split between ${vaultShare}% vaulted and ${walletShare}% liquid. Wallet liquidity preserves flexibility, but it is not contributing to vault yield.` },
      ]
    );
  }

  if (lower.includes('private balance') || (lower.includes('balance') && lower.includes('private'))) {
    if (!hasPrivateVault) return sectioned(
      [{ content: 'You do not have a private balance yet because no Confidential FHE Vault exists.' }]
    );
    return sectioned(
      [{ content: `Your private balance is represented by encrypted handle ${shortHandle}.` }]
    );
  }

  const publicSummary = `${vaultBalance} ${symbol} in the public vault and ${walletBalance} ${symbol} in your wallet`;
  const privateSummary = hasPrivateVault ? ` plus an encrypted balance in your Confidential Vault (${privateOps} ops)` : '';
  
  return sectioned(
    [{ content: `You currently track ${total} ${symbol}: ${publicSummary}${privateSummary}.` }]
  );
}

function isWalletPortfolioQuestion(queryText) {
  const lower = String(queryText || '').toLowerCase();
  const allowedTerms = [
    'wallet',
    'portfolio',
    'vault',
    'balance',
    'token',
    'tokens',
    'rwa',
    'usdc',
    'asset',
    'assets',
    'allocation',
    'deposit',
    'withdraw',
    'mint',
    'yield',
    'apy',
    'apr',
    'earn',
    'risk',
    'exposure',
    'liquid',
    'liquidity',
    'private',
    'privacy',
    'confidential',
    'encrypted',
    'fhe',
    'zama',
  ];

  return allowedTerms.some((term) => lower.includes(term));
}

function buildAnalystContext(snapshot) {
  const token = (value) => Number(value || 0).toFixed(4);
  const percent = (value) => Number(value || 0).toFixed(2);
  const usd = (value) => Number(value || 0).toFixed(2);

  return {
    product: 'BlindOracle',
    privacyTechnology: 'Zama FHE',
    asset: 'RWA',
    vaultBalance: token(snapshot.vault.balanceFormatted),
    walletBalance: token(snapshot.token.walletFormatted),
    publicVaultExists: snapshot.vault.exists,
    confidentialVaultExists: snapshot.confidentialVault.exists,
    encryptedBalanceHandle: snapshot.confidentialVault.encryptedBalanceHandle,
    privateOperationCount: Number(snapshot.confidentialVault.operationCount),
    confidentialVaultNote:
      'BlindOracle Confidential FHE Vault stores the balance as an encrypted handle. Only authorized parties can decrypt through Zama KMS permission flows.',
    totalTrackedTokens: token(snapshot.derived.totalTrackedTokens),
    totalTrackedUsdValue: usd(snapshot.derived.totalTrackedUsdValue),
    vaultedSharePercent: percent(snapshot.derived.vaultedSharePercent),
    walletSharePercent: percent(snapshot.derived.walletSharePercent),
    depositCount: Number(snapshot.vault.depositCount),
    apyPercent: percent(snapshot.yield.apyPercent),
    estimatedAnnualYieldTokens: token(snapshot.yield.estimatedAnnualYieldTokens),
    estimatedAnnualYieldUsd: usd(snapshot.yield.estimatedAnnualYieldUsd),
    fullVaultEstimatedAnnualYieldTokens: token(snapshot.derived.totalTrackedTokens * (snapshot.yield.apyPercent / 100)),
    additionalYieldIfWalletIsVaultedTokens:
      token(Math.max(0, snapshot.derived.totalTrackedTokens * (snapshot.yield.apyPercent / 100) - snapshot.yield.estimatedAnnualYieldTokens)),
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
    .replace(/\s*Direct Answer:?\s*/gi, '\n')
    .replace(/\s*(Vulnerability Assessment:?)\s*/gi, '\n\nVulnerability Assessment\n')
    .replace(/\s*(Optimization Analysis:?)\s*/gi, '\n\nOptimization Analysis\n')
    .replace(/\s*(Comparison Breakdown:?)\s*/gi, '\n\nComparison Breakdown\n')
    .replace(/\s*(Recommendation:?)\s*/gi, '\n\nRecommendation\n')
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
            6. Always directly answer the user's question first in one sentence with no label or heading.
            7. Only include sections that match the question:
               - "How much can I deposit?" or general balance questions: answer sentence only.
               - Earnings, yield, APY, performance, or "earn more" questions: answer sentence + Optimization Analysis only.
               - Risk or vulnerability questions: answer sentence + Vulnerability Assessment only.
               - Public vs confidential vault comparison questions: answer sentence + Comparison Breakdown only.
               - General wallet or portfolio questions: answer sentence only.
            8. Format analysis labels on their own line, with content on the next line. Do not use inline "Label: content" formatting.
            
            DATA CONSTRAINTS:
            - Refer to the primary asset as RWA.
            - Do not disclose contract addresses or block numbers.
            - All percentages must use exactly 2 decimal places with toFixed(2)-style formatting.
            - All token amounts must use no more than 4 decimal places with toFixed(4)-style formatting.
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

    if (query.length < 3) {
      return sendJson(res, 400, { error: 'Please enter a valid question' });
    }

    if (!isWalletPortfolioQuestion(query)) {
      return sendJson(res, 200, {
        analysis: 'Ask a question related to your wallet or portfolio.',
        model: 'scope-filter',
        snapshot: null,
      });
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

  server.listen(CONFIG.port, '0.0.0.0', () => {
    console.log(`Live analyst API listening at http://0.0.0.0:${CONFIG.port}`);
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
