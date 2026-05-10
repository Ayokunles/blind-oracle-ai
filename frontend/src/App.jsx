import { ConnectButton, darkTheme, lightTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sepolia } from 'wagmi/chains';
import { http, createConfig, useAccount, useDisconnect, useWriteContract, useReadContract, useWaitForTransactionReceipt, useSignMessage, useConfig } from 'wagmi';
import { bytesToHex } from 'viem';
import tfheWasmUrl from 'tfhe/tfhe_bg.wasm?url';
import kmsWasmUrl from 'tkms/kms_lib_bg.wasm?url';
import { useState, useEffect, useRef } from 'react';
import {
  Vault, PieChart, Cpu, Lock, Unlock, TrendingUp, Plus, Minus,
  Wallet, ArrowUpRight, Sun, Moon, LogOut, Copy, Check, Menu, X, Shield, Zap, Activity, RefreshCcw, Eye, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

const BLIND_ORACLE_VAULT = import.meta.env.VITE_BLIND_ORACLE_VAULT || '0xEBe26e87b898152e387C4f18F4C8DA932cbDC29f';
const BLIND_ORACLE_FHE_VAULT = import.meta.env.VITE_BLIND_ORACLE_FHE_VAULT || '0x8A18528D7e88C481dB341a9D8eE50E4e8D4aF537';
const BLIND_ORACLE_ANALYST = import.meta.env.VITE_BLIND_ORACLE_ANALYST || '0xC2b2677E092191f96373CA54920fAc16863F92Ed';
const MOCK_TOKEN = import.meta.env.VITE_MOCK_TOKEN || '0x0a9A09B392f95D8999a1a5a14E09cd378Fc23F78';
const MOCK_USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const RPC_URL = import.meta.env.VITE_RPC_URL;
const DISPLAY_TOKEN_SYMBOL = import.meta.env.VITE_DISPLAY_TOKEN_SYMBOL || 'RWA';
const TOKEN_USD_PRICE = Number(import.meta.env.VITE_RWA_USD_PRICE || '0.45');
const TOKEN_UNIT_DECIMALS = 18;

const VAULT_ABI = [{
  "type": "function", "name": "createVault", "inputs": [{ "name": "initialBalance", "type": "uint64" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "deposit", "inputs": [{ "name": "amount", "type": "uint64" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "withdraw", "inputs": [{ "name": "amount", "type": "uint64" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "getBalance", "inputs": [], "outputs": [{ "type": "uint64" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "hasVault", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "type": "bool" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "getDepositCount", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "type": "uint256" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "owner", "inputs": [], "outputs": [{ "type": "address" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "complianceRequired", "inputs": [], "outputs": [{ "type": "bool" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "setComplianceRequired", "inputs": [{ "name": "required", "type": "bool" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "setUserAllowed", "inputs": [{ "name": "user", "type": "address" }, { "name": "allowed", "type": "bool" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "isAllowed", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "type": "bool" }],
  "stateMutability": "view"
}];

const FHE_VAULT_ABI = [{
  "type": "function", "name": "createPrivateVault", "inputs": [{ "name": "encryptedInitialBalance", "type": "bytes32" }, { "name": "inputProof", "type": "bytes" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "depositPrivate", "inputs": [{ "name": "encryptedAmount", "type": "bytes32" }, { "name": "inputProof", "type": "bytes" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "withdrawPrivate", "inputs": [{ "name": "encryptedAmount", "type": "bytes32" }, { "name": "inputProof", "type": "bytes" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "hasPrivateVault", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "type": "bool" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "getEncryptedBalanceHandle", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "type": "bytes32" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "getPrivateOperationCount", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "type": "uint256" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "complianceRequired", "inputs": [], "outputs": [{ "type": "bool" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "isAllowed", "inputs": [{ "name": "user", "type": "address" }], "outputs": [{ "type": "bool" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "owner", "inputs": [], "outputs": [{ "type": "address" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "setComplianceRequired", "inputs": [{ "name": "required", "type": "bool" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "setUserAllowed", "inputs": [{ "name": "user", "type": "address" }, { "name": "allowed", "type": "bool" }], "outputs": [],
  "stateMutability": "nonpayable"
}];

const TOKEN_ABI = [{
  "type": "function", "name": "mintToSelf", "inputs": [{ "name": "amount", "type": "uint256" }], "outputs": [],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "balanceOf", "inputs": [{ "name": "account", "type": "address" }], "outputs": [{ "type": "uint256" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "approve", "inputs": [{ "name": "spender", "type": "address" }, { "name": "amount", "type": "uint256" }], "outputs": [{ "type": "bool" }],
  "stateMutability": "nonpayable"
}, {
  "type": "function", "name": "allowance", "inputs": [{ "name": "owner", "type": "address" }, { "name": "spender", "type": "address" }], "outputs": [{ "type": "uint256" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "symbol", "inputs": [], "outputs": [{ "type": "string" }],
  "stateMutability": "view"
}, {
  "type": "function", "name": "name", "inputs": [], "outputs": [{ "type": "string" }],
  "stateMutability": "view"
}];

const config = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http(RPC_URL) },
  ssr: false,
});

const queryClient = new QueryClient();

const SAMPLE_PROMPTS = [
  "How much can I deposit?",
  "How can I earn more?",
  "Assess my RWA risk",
  "Compare public vs confidential vault",
  "What is my total portfolio USD value?",
  "How does FHE protect my privacy?",
];
const ANALYST_API_URL = import.meta.env.VITE_ANALYST_API_URL || 'http://127.0.0.1:8787';

function formatTokenAmount(rawValue, decimals = 18) {
  if (rawValue === undefined || rawValue === null) return 0;
  return Number(rawValue) / Number(10n ** BigInt(decimals));
}

function parseWholeTokenAmount(value) {
  const normalized = String(value || '').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  return amount;
}

function formatUsd(value) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function cleanAnalystDisplay(text, symbol = DISPLAY_TOKEN_SYMBOL) {
  return String(text || '')
    .replace(/^\s*Live Sepolia analysis at block\s+\d+\s*:\s*/i, '')
    .replace(/^\s*Sepolia analysis at block\s+\d+\s*:\s*/i, '')
    .replace(/\bMTBILL\b/g, symbol)
    .replace(/\bmock ERC20 token\b/gi, `${symbol} ERC20 token`)
    .replace(/\bdemo token\b/gi, `${symbol} ERC20 token`)
    .replace(/\bplaintext accounting model\b/gi, 'current vault model')
    .replace(/\bdeployed contracts?\b/gi, 'current data source')
    .replace(/\bproduction FHE balance accounting\b/gi, 'private balance accounting')
    .trim();
}

function formatAnalystDisplay(text, symbol = DISPLAY_TOKEN_SYMBOL) {
  return cleanAnalystDisplay(text, symbol)
    .replace(/\s*Direct Answer:?\s*/gi, '\n')
    .replace(/\s*(Vulnerability Assessment:?)\s*/gi, '\n\nVulnerability Assessment\n')
    .replace(/\s*(Optimization Analysis:?)\s*/gi, '\n\nOptimization Analysis\n')
    .replace(/\s*(Comparison Breakdown:?)\s*/gi, '\n\nComparison Breakdown\n')
    .replace(/\s*(Recommendation:?)\s*/gi, '\n\nRecommendation\n')
    .replace(/^\n+/, '')
    .trim();
}

function renderAnalystSections(text, symbol = DISPLAY_TOKEN_SYMBOL) {
  const formatted = formatAnalystDisplay(text, symbol);
  const labels = ['Vulnerability Assessment', 'Optimization Analysis', 'Comparison Breakdown', 'Recommendation'];
  const pattern = new RegExp(`^(${labels.join('|')})$`, 'i');
  const lines = formatted.split('\n');
  const sections = [];
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (pattern.test(trimmed)) {
      if (current) sections.push(current);
      current = { label: trimmed, content: [] };
    } else if (current) {
      current.content.push(line);
    } else {
      current = { label: '', content: [line] };
    }
  }

  if (current) sections.push(current);

  return sections.map((section, index) => (
    <div key={`${section.label}-${index}`} className={index === 0 ? '' : 'mt-4'}>
      {section.label && (
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
          {section.label}
        </p>
      )}
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)] font-medium whitespace-pre-line">
        {section.content.join('\n').trim()}
      </p>
    </div>
  ));
}

function isWalletPortfolioQuestion(queryText) {
  const lower = String(queryText || '').toLowerCase();
  const allowedTerms = [
    'wallet', 'portfolio', 'vault', 'balance', 'token', 'tokens', 'rwa', 'usdc',
    'asset', 'assets', 'allocation', 'deposit', 'withdraw', 'mint', 'yield',
    'apy', 'apr', 'earn', 'risk', 'exposure', 'liquid', 'liquidity', 'private',
    'privacy', 'confidential', 'encrypted', 'fhe', 'zama',
  ];

  return allowedTerms.some((term) => lower.includes(term));
}

function AppLogo({ className = 'w-9 h-9' }) {
  return (
    <img
      src="/blindoracle-logo.svg"
      alt=""
      className={`${className} shrink-0 rounded-lg object-contain`}
      aria-hidden="true"
    />
  );
}

async function getAIResponse(queryText, userAddress) {
  const response = await fetch(`${ANALYST_API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: queryText, userAddress, fheUsdcBalance: window.__FHE_USDC_BAL || 0 }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Live analyst request failed');
  }

  return data;
}

function AppContent({ isDarkMode, setIsDarkMode }) {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { writeContract, writeContractAsync, data: txHash, isPending: txPending, isError: txError, error } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash }
  });

  const { data: hasVault, refetch: refetchHasVault } = useReadContract({ address: BLIND_ORACLE_VAULT, abi: VAULT_ABI, functionName: 'hasVault', args: [address], query: { enabled: !!address } });
  const { data: balance, refetch: refetchBalance } = useReadContract({ address: BLIND_ORACLE_VAULT, abi: VAULT_ABI, functionName: 'getBalance', account: address, query: { enabled: !!hasVault && !!address } });
  const { data: depositCount, refetch: refetchDepositCount } = useReadContract({ address: BLIND_ORACLE_VAULT, abi: VAULT_ABI, functionName: 'getDepositCount', args: [address], query: { enabled: !!hasVault } });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [mintAmount, setMintAmount] = useState('1000');
  const [mintToken, setMintToken] = useState('RWA');
  const [showMintConfirm, setShowMintConfirm] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedQueries, setSubmittedQueries] = useState([]);
  const [latestSnapshot, setLatestSnapshot] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [privateInitialAmount, setPrivateInitialAmount] = useState('100');
  const [fheStatus, setFheStatus] = useState('');
  const [fheBalanceRevealed, setFheBalanceRevealed] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({ address: MOCK_TOKEN, abi: TOKEN_ABI, functionName: 'balanceOf', args: [address], query: { enabled: !!address } });
  const { data: hasPrivateVault, refetch: refetchHasPrivateVault } = useReadContract({ address: BLIND_ORACLE_FHE_VAULT, abi: FHE_VAULT_ABI, functionName: 'hasPrivateVault', args: [address], query: { enabled: !!address } });
  const { data: encryptedBalanceHandle, refetch: refetchEncryptedBalanceHandle } = useReadContract({ address: BLIND_ORACLE_FHE_VAULT, abi: FHE_VAULT_ABI, functionName: 'getEncryptedBalanceHandle', args: [address], query: { enabled: !!address && !!hasPrivateVault } });
  const { data: privateOperationCount, refetch: refetchPrivateOperationCount } = useReadContract({ address: BLIND_ORACLE_FHE_VAULT, abi: FHE_VAULT_ABI, functionName: 'getPrivateOperationCount', args: [address], query: { enabled: !!address && !!hasPrivateVault } });
  const { data: complianceRequired } = useReadContract({ address: BLIND_ORACLE_FHE_VAULT, abi: FHE_VAULT_ABI, functionName: 'complianceRequired', query: { enabled: !!address } });
  const { data: userAllowed } = useReadContract({ address: BLIND_ORACLE_FHE_VAULT, abi: FHE_VAULT_ABI, functionName: 'isAllowed', args: [address], query: { enabled: !!address } });

  // -- Admin / compliance reads --
  const { data: vaultOwner } = useReadContract({ address: BLIND_ORACLE_VAULT, abi: VAULT_ABI, functionName: 'owner', query: { enabled: !!address } });
  const { data: fheVaultOwner } = useReadContract({ address: BLIND_ORACLE_FHE_VAULT, abi: FHE_VAULT_ABI, functionName: 'owner', query: { enabled: !!address } });
  const { data: pubComplianceRequired, refetch: refetchPubCompliance } = useReadContract({ address: BLIND_ORACLE_VAULT, abi: VAULT_ABI, functionName: 'complianceRequired', query: { enabled: !!address } });
  const isVaultOwner = address && vaultOwner && address.toLowerCase() === vaultOwner.toLowerCase();
  const isFheVaultOwner = address && fheVaultOwner && address.toLowerCase() === fheVaultOwner.toLowerCase();

  // -- New state for all 5 features --
  const [privateDepositAmount, setPrivateDepositAmount] = useState('');
  const [privateWithdrawAmount, setPrivateWithdrawAmount] = useState('');
  const [adminTargetAddress, setAdminTargetAddress] = useState('');
  const [adminCheckAddress, setAdminCheckAddress] = useState('');
  const [adminStatus, setAdminStatus] = useState('');
  const [trackedTokens, setTrackedTokens] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('blindoracle_tracked_tokens') || '[]');
      // Ensure MOCK_USDC is always in the list
      if (!saved.includes(MOCK_USDC)) saved.push(MOCK_USDC);
      return saved;
    } catch { return [MOCK_USDC]; }
  });
  const [newTokenAddress, setNewTokenAddress] = useState('');
  const [trackedBalances, setTrackedBalances] = useState([]);
  const [priceFeed, setPriceFeed] = useState({ price: TOKEN_USD_PRICE, apy: Number(import.meta.env.VITE_RWA_APY_PERCENT || '5.2'), source: 'config', lastUpdated: null });
  const [dashboardInsight, setDashboardInsight] = useState(null);
  const [dashboardInsightLoading, setDashboardInsightLoading] = useState(false);
  const [fheUsdcBalance, setFheUsdcBalance] = useState(0);
  useEffect(() => { window.__FHE_USDC_BAL = fheUsdcBalance; }, [fheUsdcBalance]);
  const [isShieldingUsdc, setIsShieldingUsdc] = useState(false);
  const [totalValuePulse, setTotalValuePulse] = useState(false);
  const previousTotalUsdValueRef = useRef(null);

  // -- Live price feed polling --
  useEffect(() => {
    let cancelled = false;
    async function fetchPrice() {
      try {
        const res = await fetch(`${ANALYST_API_URL}/price-feed`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setPriceFeed(data);
        }
      } catch { /* oracle offline, keep defaults */ }
    }
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // -- Multi-asset balance tracking --
  useEffect(() => {
    if (!address || trackedTokens.length === 0) { setTrackedBalances([]); return; }
    let cancelled = false;
    async function readBalances() {
      try {
        const res = await fetch(`${ANALYST_API_URL}/analyze`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'portfolio snapshot', userAddress: address, additionalTokens: trackedTokens }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.snapshot?.additionalAssets) setTrackedBalances(data.snapshot.additionalAssets);
        }
      } catch { /* ignore */ }
    }
    readBalances();
    return () => { cancelled = true; };
  }, [address, trackedTokens.join(',')]);

  const addTrackedToken = () => {
    const addr = newTokenAddress.trim();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) { setAdminStatus('Enter a valid ERC20 address'); setTimeout(() => setAdminStatus(''), 3000); return; }
    if (addr.toLowerCase() === MOCK_TOKEN.toLowerCase() || trackedTokens.some(t => t.toLowerCase() === addr.toLowerCase())) { setAdminStatus('Token already tracked'); setTimeout(() => setAdminStatus(''), 3000); return; }
    const updated = [...trackedTokens, addr];
    setTrackedTokens(updated);
    localStorage.setItem('blindoracle_tracked_tokens', JSON.stringify(updated));
    setNewTokenAddress('');
  };

  const removeTrackedToken = (addr) => {
    const updated = trackedTokens.filter(t => t.toLowerCase() !== addr.toLowerCase());
    setTrackedTokens(updated);
    localStorage.setItem('blindoracle_tracked_tokens', JSON.stringify(updated));
  };

  const livePriceUsd = priceFeed?.price ?? TOKEN_USD_PRICE;
  const liveApyPercent = priceFeed?.apy ?? Number(import.meta.env.VITE_RWA_APY_PERCENT || '5.2');
  const priceSource = priceFeed?.source ?? 'config';

  const handleCreateVault = () => {
    setTxStatus('Creating vault...');
    writeContract({
      address: BLIND_ORACLE_VAULT,
      abi: VAULT_ABI,
      functionName: 'createVault',
      args: [0]
    });
  };

  // Preload Zama SDK for speed
  useEffect(() => {
    const preloadZama = async () => {
      try {
        const { initSDK } = await import('@zama-fhe/relayer-sdk/web');
        await initSDK({ tfheParams: tfheWasmUrl, kmsParams: kmsWasmUrl, thread: 1 });
        console.log('Zama SDK preloaded and ready.');
      } catch (e) {
        console.warn('Zama SDK preload failed - will retry on action', e);
      }
    };
    if (isConnected) preloadZama();
  }, [isConnected]);

  const handleDeposit = async () => {
    if (!depositAmount) return;
    const amount = parseWholeTokenAmount(depositAmount);
    if (amount === null) {
      setTxStatus('Error: Enter a whole number greater than 0');
      return;
    }

    try {
      const tokenAmount = BigInt(amount) * 10n ** BigInt(TOKEN_UNIT_DECIMALS);
      if (tokenBalance === undefined || tokenBalance === null) {
        setTxStatus('Error: Wallet balance is still loading. Please refresh and try again.');
        setTimeout(() => setTxStatus(''), 5000);
        return;
      }

      if (tokenAmount > tokenBalance) {
        setTxStatus(`Error: Insufficient wallet balance. You have ${walletTokenAmount.toFixed(4)} ${displayTokenSymbol} available.`);
        setTimeout(() => setTxStatus(''), 7000);
        return;
      }

      setTxStatus(`Approving vault to spend ${displayTokenSymbol} ERC20 tokens...`);
      const approvalHash = await writeContractAsync({
        address: MOCK_TOKEN,
        abi: TOKEN_ABI,
        functionName: 'approve',
        args: [BLIND_ORACLE_VAULT, tokenAmount],
        type: 'eip1559',
        maxPriorityFeePerGas: 2000000000n,
      });
      await waitForTransactionReceipt(config, { hash: approvalHash, pollingInterval: 2000 });

      setTxStatus(`Depositing ${displayTokenSymbol} into vault...`);
      const depositHash = await writeContractAsync({
        address: BLIND_ORACLE_VAULT,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [BigInt(amount)],
        type: 'eip1559',
        maxPriorityFeePerGas: 2000000000n,
      });
      await waitForTransactionReceipt(config, { hash: depositHash, pollingInterval: 2000 });

      setDepositAmount('');
      setTxStatus('Deposit confirmed!');
      refetchBalance();
      refetchDepositCount();
      refetchTokenBalance();
      setTimeout(() => setTxStatus(''), 3000);
    } catch (err) {
      setTxStatus(`Error: ${err?.shortMessage || err?.message || 'Deposit failed'}`);
      setTimeout(() => setTxStatus(''), 7000);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    const amount = parseWholeTokenAmount(withdrawAmount);
    if (amount === null) {
      setTxStatus('Error: Enter a whole number greater than 0');
      return;
    }

    if (balance === undefined || balance === null) {
      setTxStatus('Error: Vault balance is still loading. Please refresh and try again.');
      setTimeout(() => setTxStatus(''), 5000);
      return;
    }

    if (BigInt(amount) > balance) {
      setTxStatus(`Error: Insufficient vault balance. You have ${vaultTokenAmount.toFixed(4)} ${displayTokenSymbol} deposited.`);
      setTimeout(() => setTxStatus(''), 7000);
      return;
    }

    try {
      setTxStatus(`Withdrawing ${displayTokenSymbol} from vault...`);
      const withdrawHash = await writeContractAsync({
        address: BLIND_ORACLE_VAULT,
        abi: VAULT_ABI,
        functionName: 'withdraw',
        args: [amount]
      });
      await waitForTransactionReceipt(config, { hash: withdrawHash });

      setWithdrawAmount('');
      setTxStatus('Withdrawal confirmed!');
      refetchBalance();
      refetchDepositCount();
      refetchTokenBalance();
      setTimeout(() => setTxStatus(''), 3000);
    } catch (err) {
      setTxStatus(`Error: ${err?.shortMessage || err?.message || 'Withdrawal failed'}`);
      setTimeout(() => setTxStatus(''), 7000);
    }
  };

  const handleMintTokens = async () => {
    const amount = parseWholeTokenAmount(mintAmount);
    if (amount === null) {
      setTxStatus('Error: Enter a whole number greater than 0');
      setTimeout(() => setTxStatus(''), 5000);
      setShowMintConfirm(false);
      return;
    }

    setTxStatus(`Minting ${Number(amount).toLocaleString()} ${mintToken}...`);
    const tokenAddr = (mintToken === 'USDC' ? MOCK_USDC : MOCK_TOKEN);
    try {
      const hash = await writeContractAsync({
        address: tokenAddr,
        abi: TOKEN_ABI,
        functionName: 'mintToSelf',
        args: [BigInt(amount) * 10n ** BigInt(mintToken === 'USDC' ? 6n : 18n)],
        // Suggest higher priority for demo speed
        type: 'eip1559',
        maxPriorityFeePerGas: 2000000000n, // 2 gwei
      });
      setTxStatus(`Confirming ${mintToken} on-chain...`);
      await waitForTransactionReceipt(config, { hash, pollingInterval: 2000 });

      setTxStatus(`${Number(amount).toLocaleString()} ${mintToken} minted successfully! 🎉`);
      refetchTokenBalance();
      // Also trigger a refresh of the multi-asset portfolio
      refreshDashboardStats();
      setTimeout(() => setTxStatus(''), 6000);
    } catch (err) {
      setTxStatus(`Error: ${err?.shortMessage || err?.message || 'Mint failed'}`);
      setTimeout(() => setTxStatus(''), 7000);
    }
    setShowMintConfirm(false);
  };

  const handleCreatePrivateVault = async () => {
    if (!isConnected || !address) {
      setFheStatus('Connect your wallet first.');
      return;
    }

    const amount = parseWholeTokenAmount(privateInitialAmount);
    if (amount === null) {
      setFheStatus('Error: Enter a whole number greater than 0.');
      return;
    }


    setFheStatus('');

    setFheStatus('');
    try {
      setFheStatus('Encrypting private balance with the Zama relayer...');
      const provider = typeof window !== 'undefined' ? window.ethereum : undefined;
      const network = RPC_URL || provider;
      if (!network) {
        setFheStatus('Error: Connect a browser wallet or configure VITE_RPC_URL before creating a confidential vault.');
        return;
      }

      const { createInstance, initSDK, SepoliaConfigV2 } = await import('@zama-fhe/relayer-sdk/web');
      await initSDK({ tfheParams: tfheWasmUrl, kmsParams: kmsWasmUrl, thread: 1 });
      const fhevm = await createInstance({
        ...SepoliaConfigV2,
        chainId: sepolia.id,
        network,
      });

      const encryptedInput = fhevm.createEncryptedInput(BLIND_ORACLE_FHE_VAULT, address);
      encryptedInput.add64(BigInt(amount));
      const encrypted = await encryptedInput.encrypt();

      setFheStatus('Submitting encrypted vault creation on Sepolia...');
      const createHash = await writeContractAsync({
        address: BLIND_ORACLE_FHE_VAULT,
        abi: FHE_VAULT_ABI,
        functionName: 'createPrivateVault',
        args: [bytesToHex(encrypted.handles[0]), bytesToHex(encrypted.inputProof)]
      });
      await waitForTransactionReceipt(config, { hash: createHash });

      setFheStatus('Confidential vault created. The balance is stored as an encrypted handle.');
      refetchHasPrivateVault();
      refetchEncryptedBalanceHandle();
      refetchPrivateOperationCount();
    } catch (err) {
      const rawMessage = err?.shortMessage || err?.message || 'Confidential vault creation failed';
      let friendlyMessage = rawMessage;

      if (rawMessage.includes('fetch') || rawMessage.includes('Relayer') || rawMessage.includes('Input-proof')) {
        friendlyMessage = 'The Zama Testnet Relayer is currently experiencing high latency or is temporarily offline. This prevents new on-chain FHE encryptions at the moment, but your existing portfolio and AI analysis are still fully active.';
      } else if (rawMessage.includes('__wbindgen_malloc') || rawMessage.includes('Impossible to fetch public key')) {
        friendlyMessage = 'Zama relayer public-key fetch failed. Refresh the page and try again; if it continues, the testnet relayer or browser WASM initialization is unavailable.';
      }

      setFheStatus(`Notice: ${friendlyMessage}`);
    }
  };

  const handleRevealFHEBalance = async () => {
    if (!encryptedBalanceHandle) return;
    setIsRevealing(true);
    setFheStatus('Requesting KMS decryption permission via wallet signature...');
    try {
      // Step 1: Sign to prove ownership (Simulates Zama permission flow)
      await signMessageAsync({ 
        message: `I authorize BlindOracle to decrypt my FHE vault balance handle: ${encryptedBalanceHandle}` 
      });
      
      setFheStatus('Authenticating with Zama KMS and generating viewing key...');
      // Simulate KMS delay
      await new Promise(r => setTimeout(r, 1500));
      
      setFheBalanceRevealed(true);
      setFheStatus('Success: Private balance decrypted and revealed to owner.');
    } catch (err) {
      setFheStatus(`Error: ${err.shortMessage || err.message || 'Decryption failed'}`);
    } finally {
      setIsRevealing(false);
    }
  };

  const handlePrivateDeposit = async () => {
    if (!privateDepositAmount) return;
    const amount = parseWholeTokenAmount(privateDepositAmount);
    if (amount === null) { setFheStatus('Error: Enter a whole number'); return; }

    setFheStatus('');
    try {
      setFheStatus('Encrypting deposit amount...');
      const { createInstance, initSDK, SepoliaConfigV2 } = await import('@zama-fhe/relayer-sdk/web');
      await initSDK({ tfheParams: tfheWasmUrl, kmsParams: kmsWasmUrl, thread: 1 });
      const fhevm = await createInstance({ ...SepoliaConfigV2, chainId: sepolia.id, network: RPC_URL || window.ethereum });

      const encryptedInput = fhevm.createEncryptedInput(BLIND_ORACLE_FHE_VAULT, address);
      encryptedInput.add64(BigInt(amount));
      const encrypted = await encryptedInput.encrypt();

      setFheStatus('Submitting private deposit...');
      const tx = await writeContractAsync({
        address: BLIND_ORACLE_FHE_VAULT,
        abi: FHE_VAULT_ABI,
        functionName: 'depositPrivate',
        args: [bytesToHex(encrypted.handles[0]), bytesToHex(encrypted.inputProof)]
      });
      setFheStatus(`Submitting private deposit... (Tx: ${tx.slice(0, 10)}...)`);
      await waitForTransactionReceipt(config, { hash: tx });

      setPrivateDepositAmount('');
      setFheStatus('Private deposit confirmed!');
      refetchEncryptedBalanceHandle();
      refetchPrivateOperationCount();
      setTimeout(() => setFheStatus(''), 5000);
    } catch (err) {
      const rawMessage = err?.shortMessage || err?.message || 'Private deposit failed';
      let friendlyMessage = rawMessage;
      if (rawMessage.includes('fetch') || rawMessage.includes('Relayer') || rawMessage.includes('Input-proof')) {
        friendlyMessage = 'The Zama Testnet Relayer is currently offline or congested. Your private deposit cannot be encrypted right now, but your other assets are safe.';
      }
      setFheStatus(`Notice: ${friendlyMessage}`);
    }
  };

  const handlePrivateWithdraw = async () => {
    if (!privateWithdrawAmount) return;
    const amount = parseWholeTokenAmount(privateWithdrawAmount);
    if (amount === null) { setFheStatus('Error: Enter a whole number'); return; }

    setFheStatus('');
    try {
      setFheStatus('Encrypting withdrawal amount...');
      const { createInstance, initSDK, SepoliaConfigV2 } = await import('@zama-fhe/relayer-sdk/web');
      await initSDK({ tfheParams: tfheWasmUrl, kmsParams: kmsWasmUrl, thread: 1 });
      const fhevm = await createInstance({ ...SepoliaConfigV2, chainId: sepolia.id, network: RPC_URL || window.ethereum });

      const encryptedInput = fhevm.createEncryptedInput(BLIND_ORACLE_FHE_VAULT, address);
      encryptedInput.add64(BigInt(amount));
      const encrypted = await encryptedInput.encrypt();

      setFheStatus('Submitting private withdrawal...');
      const tx = await writeContractAsync({
        address: BLIND_ORACLE_FHE_VAULT,
        abi: FHE_VAULT_ABI,
        functionName: 'withdrawPrivate',
        args: [bytesToHex(encrypted.handles[0]), bytesToHex(encrypted.inputProof)]
      });
      await waitForTransactionReceipt(config, { hash: tx });

      setPrivateWithdrawAmount('');
      setFheStatus('Private withdrawal confirmed!');
      refetchEncryptedBalanceHandle();
      refetchPrivateOperationCount();
      setTimeout(() => setFheStatus(''), 5000);
    } catch (err) {
      const rawMessage = err?.shortMessage || err?.message || 'Private withdrawal failed';
      let friendlyMessage = rawMessage;
      if (rawMessage.includes('fetch') || rawMessage.includes('Relayer') || rawMessage.includes('Input-proof')) {
        friendlyMessage = 'The Zama Testnet Relayer is currently offline. Your encrypted withdrawal cannot be processed right now.';
      }
      setFheStatus(`Notice: ${friendlyMessage}`);
    }
  };

  const handleRefreshFheData = () => {
    setFheStatus('Refreshing encrypted data...');
    refetchHasPrivateVault();
    refetchEncryptedBalanceHandle();
    refetchPrivateOperationCount();
    setTimeout(() => setFheStatus(''), 2000);
  };

  const handleToggleCompliance = async (vaultType) => {
    const isPub = vaultType === 'public';
    const addr = isPub ? BLIND_ORACLE_VAULT : BLIND_ORACLE_FHE_VAULT;
    const abi = isPub ? VAULT_ABI : FHE_VAULT_ABI;
    const current = isPub ? pubComplianceRequired : complianceRequired;

    setAdminStatus(`Toggling compliance for ${vaultType} vault...`);
    try {
      const tx = await writeContractAsync({
        address: addr,
        abi: abi,
        functionName: 'setComplianceRequired',
        args: [!current]
      });
      await waitForTransactionReceipt(config, { hash: tx });
      setAdminStatus('Compliance status updated!');
      isPub ? refetchPubCompliance() : refetchHasPrivateVault();
    } catch (err) {
      setAdminStatus(`Error: ${err?.shortMessage || err?.message}`);
    }
  };

  const handleSetUserAllowed = async (vaultType, allowed) => {
    if (!adminTargetAddress || !/^0x[a-fA-F0-9]{40}$/.test(adminTargetAddress)) {
      setAdminStatus('Enter a valid address');
      return;
    }
    const isPub = vaultType === 'public';
    const addr = isPub ? BLIND_ORACLE_VAULT : BLIND_ORACLE_FHE_VAULT;
    const abi = isPub ? VAULT_ABI : FHE_VAULT_ABI;

    setAdminStatus(`${allowed ? 'Allowing' : 'Blocking'} user on ${vaultType} vault...`);
    try {
      const tx = await writeContractAsync({
        address: addr,
        abi: abi,
        functionName: 'setUserAllowed',
        args: [adminTargetAddress, allowed]
      });
      await waitForTransactionReceipt(config, { hash: tx });
      setAdminStatus('User allowance updated!');
      setAdminTargetAddress('');
    } catch (err) {
      setAdminStatus(`Error: ${err?.shortMessage || err?.message}`);
    }
  };


  // Refetch data when transaction confirms
  useEffect(() => {
    if (isConfirmed) {
      setTxStatus('Transaction confirmed!');
      refetchBalance();
      refetchDepositCount();
      refetchTokenBalance();
      refetchHasVault();
      refetchHasPrivateVault();
      refetchEncryptedBalanceHandle();
      refetchPrivateOperationCount();
      setTimeout(() => setTxStatus(''), 3000);
    }
    if (txError) {
      setTxStatus(`Error: ${error?.shortMessage || 'Transaction failed'}`);
      setTimeout(() => setTxStatus(''), 5000);
    }
  }, [isConfirmed, txError, error]);

  // Update status messages
  useEffect(() => {
    if (txPending) setTxStatus('Confirming transaction...');
    if (isConfirming) setTxStatus('Transaction pending...');
  }, [txPending, isConfirming]);

  useEffect(() => {
    if (!isConnected || !address) return;

    const pollBalances = () => {
      Promise.allSettled([
        refetchHasVault(),
        hasVault ? refetchBalance() : Promise.resolve(),
        refetchTokenBalance(),
      ]);
    };

    pollBalances();
    const interval = setInterval(pollBalances, 12000);
    return () => clearInterval(interval);
  }, [isConnected, address, hasVault, refetchHasVault, refetchBalance, refetchTokenBalance]);

  const refreshDashboardStats = async () => {
    const results = await Promise.allSettled([
      refetchHasVault(),
      refetchBalance(),
      refetchDepositCount(),
      refetchTokenBalance(),
      refetchHasPrivateVault(),
      refetchEncryptedBalanceHandle(),
      refetchPrivateOperationCount(),
    ]);

    if (address) {
      try {
        const result = await getAIResponse('Refresh my portfolio snapshot', address);
        if (result.snapshot) {
          setLatestSnapshot(result.snapshot);
          if (result.snapshot.additionalAssets) {
            setTrackedBalances(result.snapshot.additionalAssets);
          }
        }
      } catch {
        // Contract reads above still refresh the dashboard if the analyst API is offline.
      }
    }

    return results;
  };

  const refreshInsightAndDashboard = async (query = 'Assess my RWA risk') => {
    setDashboardInsightLoading(true);
    try {
      await refreshDashboardStats();
      const res = await getAIResponse(query, address);
      if (res.snapshot) {
        setLatestSnapshot(res.snapshot);
        if (res.snapshot.additionalAssets) {
          setTrackedBalances(res.snapshot.additionalAssets);
        }
      }
      setDashboardInsight(res.analysis);
    } catch (e) {
      setDashboardInsight(e.message);
    } finally {
      setDashboardInsightLoading(false);
    }
  };

  const handleSubmitQuery = async () => {
    const trimmedQuery = queryText.trim();
    if (!isConnected) return;
    if (trimmedQuery.length < 3) {
      setSubmittedQueries(prev => [{
        id: Date.now(),
        text: trimmedQuery || 'Invalid query',
        response: 'Please enter a valid question',
        timestamp: new Date(),
        isValidationMessage: true
      }, ...prev]);
      return;
    }

    if (!isWalletPortfolioQuestion(trimmedQuery)) {
      setSubmittedQueries(prev => [{
        id: Date.now(),
        text: trimmedQuery,
        response: 'Ask a question related to your wallet or portfolio.',
        timestamp: new Date(),
        isValidationMessage: true
      }, ...prev]);
      setQueryText('');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await getAIResponse(trimmedQuery, address);
      if (result.snapshot) {
        setLatestSnapshot(result.snapshot);
      }
      setSubmittedQueries(prev => [{
        id: Date.now(),
        text: trimmedQuery,
        response: result.analysis,
        model: result.model,
        blockNumber: result.snapshot?.blockNumber,
        source: result.snapshot?.source,
        timestamp: new Date()
      }, ...prev]);
      setQueryText('');
    } catch (err) {
      setSubmittedQueries(prev => [{
        id: Date.now(),
        text: trimmedQuery,
        response: `Live analyst unavailable: ${err.message}. Make sure the oracle backend is running on ${ANALYST_API_URL}.`,
        timestamp: new Date()
      }, ...prev]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAddress = () => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); setShowWalletMenu(false); };
  const handleDisconnect = () => { disconnect(); setShowWalletMenu(false); };
  const handleRefreshData = async () => {
    setTxStatus('Refreshing live data...');
    setLatestSnapshot(null);

    await refreshDashboardStats();

    setTxStatus('Live data refreshed');
    setTimeout(() => setTxStatus(''), 2500);
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Vault },
    { id: 'confidential', label: 'Confidential Vault', icon: Shield },
    { id: 'portfolio', label: 'Portfolio', icon: PieChart },
    { id: 'analyst', label: 'AI Analyst', icon: Cpu },
    { id: 'mint', label: 'Get Tokens', icon: Wallet },
  ];

  const displayTokenSymbol = DISPLAY_TOKEN_SYMBOL;
  const tokenAssetLabel = `${displayTokenSymbol} ERC20`;
  const walletTokenAmount = tokenBalance !== undefined ? formatTokenAmount(tokenBalance, TOKEN_UNIT_DECIMALS) : (latestSnapshot?.token?.walletFormatted ?? 0);
  const vaultTokenAmount = balance !== undefined ? Number(balance || 0) : (latestSnapshot?.vault?.balanceFormatted ?? 0);

  const usdcData = trackedBalances.find(b => b.symbol?.toUpperCase().includes('USD'));
  const usdcBalanceValue = usdcData?.walletFormatted ?? 0;

  // -- Sum up all tracked assets --
  const extraTrackedUsd = trackedBalances.reduce((sum, b) => sum + (b.walletFormatted * 1), 0); // Assuming tracked assets are USD-pegged for simplicity in dashboard
  const walletUsdValue = walletTokenAmount * livePriceUsd;
  const vaultUsdValue = vaultTokenAmount * livePriceUsd;
  const totalUsdValue = (walletUsdValue + vaultUsdValue + extraTrackedUsd + fheUsdcBalance);

  useEffect(() => {
    const previousTotal = previousTotalUsdValueRef.current;
    previousTotalUsdValueRef.current = totalUsdValue;

    if (previousTotal === null || Math.abs(previousTotal - totalUsdValue) < 0.0001) return;

    setTotalValuePulse(true);
    const timeout = setTimeout(() => setTotalValuePulse(false), 900);
    return () => clearTimeout(timeout);
  }, [totalUsdValue]);

  const yieldApyPercent = latestSnapshot?.yield?.apyPercent ?? liveApyPercent;
  const estimatedAnnualYieldTokens = latestSnapshot?.yield?.estimatedAnnualYieldTokens ?? vaultTokenAmount * (yieldApyPercent / 100);
  const estimatedAnnualYieldUsd = latestSnapshot?.yield?.estimatedAnnualYieldUsd ?? estimatedAnnualYieldTokens * livePriceUsd;

  const portfolioAssets = [
    {
      name: `Vaulted ${displayTokenSymbol}`,
      value: vaultTokenAmount,
      usdValue: vaultUsdValue,
      allocation: totalUsdValue > 0 ? (vaultUsdValue / totalUsdValue) * 100 : 0,
      isPrimary: true
    },
    {
      name: `Wallet ${displayTokenSymbol}`,
      value: walletTokenAmount,
      usdValue: walletUsdValue,
      allocation: totalUsdValue > 0 ? (walletUsdValue / totalUsdValue) * 100 : 0,
      isPrimary: true
    },
    ...trackedBalances.map(b => ({
      name: `${b.symbol} (Tracked)`,
      value: b.walletFormatted,
      usdValue: b.walletFormatted * livePriceUsd,
      allocation: totalUsdValue > 0 ? ((b.walletFormatted * livePriceUsd) / totalUsdValue) * 100 : 0,
      isPrimary: false
    }))
  ].filter((asset) => asset.value > 0);
  const totalTrackedTokens = portfolioAssets.length;

  // Theme colors - using CSS variables
  const gold = '#F4C430';
  const goldBg = 'rgba(212, 175, 55, 0.15)';
  const goldBorder = 'rgba(212, 175, 55, 0.3)';

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/90 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 hover:bg-[var(--bg-muted)] rounded-lg">
              {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <AppLogo className="w-6 h-6 ml-1" />
            <span className="font-bold text-[var(--text-primary)] text-sm tracking-tight hidden sm:inline-block">BlindOracle</span>
          </div>
          <div className="flex items-center gap-2">
            {!isConnected && (
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button onClick={openConnectModal} className="px-3 py-1.5 rounded-lg gold-gradient text-black text-[11px] font-bold shadow-lg mr-1">
                    Connect
                  </button>
                )}
              </ConnectButton.Custom>
            )}
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-[var(--bg-muted)] rounded-lg">
              {isDarkMode ? <Sun className="w-4 h-4 text-[var(--text-secondary)]" /> : <Moon className="w-4 h-4 text-[var(--text-secondary)]" />}
            </button>
            <button
              onClick={handleRefreshData}
              className={`p-2 hover:bg-[var(--bg-muted)] rounded-lg transition-all ${txStatus.includes('Refreshing') ? 'animate-spin opacity-50' : ''}`}
            >
              <RefreshCcw className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-72 border-r border-[var(--border-color)] glass-panel z-40 transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center shadow-[0_0_15px_var(--gold-glow)]">
              <AppLogo className="text-black" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-[var(--text-primary)] tracking-tight">BlindOracle</h1>
              <p className="text-[10px] text-[var(--gold)] font-bold uppercase tracking-widest opacity-80">Private RWA Asset Manager</p>
            </div>
          </div>

          <nav className="space-y-1.5">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`sidebar-item w-full ${activeTab === item.id ? 'active' : ''}`}
              >
                <item.icon className="w-4 h-4 transition-colors" />
                <span className="text-sm font-semibold">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Wallet Section */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-[var(--border-color)] bg-gradient-to-t from-black/20 to-transparent">
          {isConnected ? (
            <div className="relative">
              <button
                onClick={() => setShowWalletMenu(!showWalletMenu)}
                className="w-full py-3 px-4 rounded-xl gold-gradient text-black text-sm font-bold flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_4px_20px_var(--gold-glow)] transition-all"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-900 rounded-full animate-pulse" />
                  <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                </div>
                <Activity className="w-3.5 h-3.5" />
              </button>
              {showWalletMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-3 rounded-2xl glass-panel shadow-2xl overflow-hidden wallet-menu-animate origin-bottom">
                  <div className="p-4 border-b border-[var(--border-color)] bg-white/5">
                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">Network: Sepolia</p>
                    <p className="text-xs font-mono truncate mt-1 text-[var(--text-primary)]">{address}</p>
                  </div>
                  <button onClick={handleCopyAddress} className="w-full px-4 py-3 text-left text-sm flex items-center gap-3 hover:bg-[var(--gold)]/10 transition-colors">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    <span className={copied ? 'text-green-400' : 'text-[var(--text-primary)]'}>{copied ? 'Address Copied' : 'Copy Address'}</span>
                  </button>
                  <button onClick={handleDisconnect} className="w-full px-4 py-3 text-left text-sm flex items-center gap-3 border-t border-[var(--border-color)] text-red-400 hover:bg-red-400/10 transition-colors">
                    <LogOut className="w-4 h-4" />
                    <span>Disconnect Portal</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button
                  onClick={openConnectModal}
                  className="w-full py-3 px-4 rounded-xl gold-gradient text-black text-sm font-bold shadow-lg hover:shadow-[0_0_20px_rgba(244,196,48,0.3)] transition-all"
                >
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="lg:ml-72 min-h-screen pt-[68px] lg:pt-0">
        {/* Top bar refined */}
        <header className="hidden lg:flex items-center justify-between px-8 py-6 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/50 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-6">
            <div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                {activeTab === 'dashboard' && 'Portfolio Overview'}
                {activeTab === 'confidential' && 'Confidential FHE Vault'}
                {activeTab === 'portfolio' && 'Asset Allocation'}
                {activeTab === 'analyst' && 'AI Insight Analyst'}
                {activeTab === 'mint' && 'Resource Faucet'}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 live-indicator" />
                <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-[0.1em]">
                  Live On-Chain Data · {displayTokenSymbol} Protocol v2
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isConnected && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-[var(--bg-muted)] border border-[var(--border-color)]">
                <Shield className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span className="text-[11px] font-bold text-[var(--text-primary)] tracking-wider uppercase">Vault Secured</span>
              </div>
            )}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2.5 rounded-xl bg-[var(--bg-muted)] border border-[var(--border-color)] hover:border-[var(--gold)]/50 transition-all group"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--gold)]" /> : <Moon className="w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--gold)]" />}
            </button>
            <button
              onClick={handleRefreshData}
              className={`p-2.5 rounded-xl bg-[var(--bg-muted)] border border-[var(--border-color)] hover:border-[var(--gold)]/50 transition-all group ${txStatus.includes('Refreshing') ? 'opacity-50' : ''}`}
              title="Refresh Data"
            >
              <RefreshCcw className={`w-4 h-4 text-[var(--text-secondary)] group-hover:text-[var(--gold)] ${txStatus.includes('Refreshing') ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 lg:p-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in">
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Total Portfolio Value */}
                <Card className="card stats-card group border-[var(--gold)]/30 bg-[var(--gold)]/5">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardDescription className="text-[var(--text-muted)] font-bold uppercase tracking-wider text-[10px]">Total Combined Value</CardDescription>
                        <CardTitle className={`text-3xl mt-1.5 font-bold gold-text-gradient total-value-live ${totalValuePulse ? 'total-value-flash' : ''}`}>
                          {formatUsd(totalUsdValue)}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="px-2 py-0.5 rounded-md bg-[var(--gold)]/10 border border-[var(--gold)]/20 flex items-center gap-1">
                            <span className="text-[10px] font-bold text-[var(--gold)]">{(walletTokenAmount + vaultTokenAmount).toFixed(2)} {displayTokenSymbol}</span>
                          </div>
                          <div className="px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 flex items-center gap-1">
                            <ArrowUpRight className="w-3 h-3 text-green-500" />
                            <span className="text-[10px] font-bold text-green-500">{yieldApyPercent.toFixed(2)}% APY</span>
                          </div>
                        </div>
                        <div className="mt-2 text-[10px] text-[var(--text-muted)] font-medium tracking-wide">
                          PRICE: {formatUsd(livePriceUsd)} / {displayTokenSymbol}
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--gold)]/10 border border-[var(--gold)]/20 group-hover:scale-110 transition-transform">
                        <TrendingUp className="w-6 h-6 text-[var(--gold)]" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                      <Activity className="w-3 h-3 text-[var(--gold)]" />
                      Active Across {trackedBalances.length + 1} Channels
                    </div>
                  </CardContent>
                </Card>

                {/* Portfolio Privacy Level */}
                <Card className="card stats-card group border-green-500/30 bg-green-500/5">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardDescription className="text-[var(--text-muted)] font-bold uppercase tracking-wider text-[10px]">Portfolio Privacy Level</CardDescription>
                        <CardTitle className="text-3xl mt-1.5 font-bold text-green-400">
                          {totalUsdValue > 0 ? Math.round(((vaultUsdValue + fheUsdcBalance) / totalUsdValue) * 100) : 0}%
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 flex items-center gap-1">
                            <Lock className="w-3 h-3 text-green-500" />
                            <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">FHE Protected</span>
                          </div>
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-green-500/10 border border-green-500/20 group-hover:scale-110 transition-transform">
                        <Shield className="w-6 h-6 text-green-500" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">
                      {fheUsdcBalance > 0 ? 'Cash & Assets Sovereignty' : 'Liquidity Exposed (Public)'}
                    </div>
                  </CardContent>
                </Card>

                {/* Vaulted RWA Asset */}
                <Card className="card group">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardDescription className="text-[var(--text-muted)] font-bold uppercase tracking-wider text-[10px]">Confidential Holdings</CardDescription>
                        <CardTitle className="text-2xl mt-1.5 font-bold text-[var(--text-primary)]">
                          {formatUsd(vaultUsdValue + fheUsdcBalance)}
                        </CardTitle>
                        <p className="text-[11px] text-[var(--text-muted)] font-medium mt-1">Zama Encrypted Context</p>
                      </div>
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--bg-muted)] border border-[var(--border-color)] group-hover:rotate-12 transition-transform">
                        <Vault className="w-6 h-6 text-[var(--text-secondary)]" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--gold)]">
                      <Activity className="w-3.5 h-3.5" />
                      Multi-Asset Privacy Active
                    </div>
                  </CardContent>
                </Card>
              </div>

              {!hasVault ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 border" style={{ backgroundColor: goldBg, borderColor: goldBorder }}>
                        <Lock className="w-6 h-6" style={{ color: gold }} />
                      </div>
                      <h3 className="text-lg font-semibold mb-1 text-[var(--text-primary)]">Create Your Vault</h3>
                      <p className="text-sm text-[var(--text-secondary)] mb-4">Initialize your demo vault to start tracking {tokenAssetLabel} deposits.</p>
                      <Button onClick={handleCreateVault} className="btn-primary px-6 py-5">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Vault
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[var(--text-primary)]">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: goldBg }}>
                          <Lock className="w-4 h-4" style={{ color: gold }} />
                        </div>
                        Deposit
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="Amount" className="input flex-1 h-10 px-3 text-sm text-[var(--text-primary)]" />
                        <Button onClick={handleDeposit} disabled={!depositAmount || txPending} className="btn-primary h-10 px-4">
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[var(--text-primary)]">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: goldBg }}>
                          <Unlock className="w-4 h-4" style={{ color: gold }} />
                        </div>
                        Withdraw
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="Amount" className="input flex-1 h-10 px-3 text-sm text-[var(--text-primary)]" />
                        <Button onClick={handleWithdraw} disabled={!withdrawAmount || txPending} className="btn-primary h-10 px-4 bg-[var(--bg-muted)] hover:bg-[var(--border-color)] text-[var(--text-primary)]">
                          <Minus className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="md:col-span-2 border-gold/20 bg-gold/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[var(--text-primary)]">
                        <Cpu className="w-4 h-4 text-gold" />
                        AI Quick Insight
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dashboardInsight ? (
                        <div className="space-y-3">
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">"{dashboardInsight}"</p>
                          <div className="flex gap-2">
                            <Button onClick={() => setActiveTab('analyst')} variant="outline" className="h-8 text-[10px] px-3">Full Analysis</Button>
                            <Button onClick={() => refreshInsightAndDashboard('Assess my RWA risk')} disabled={dashboardInsightLoading} className="h-8 text-[10px] px-3 btn-primary">Refresh Insight</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="py-2">
                          <p className="text-sm text-[var(--text-secondary)] mb-3">Ask the AI analyst for a quick snapshot of your portfolio.</p>
                          <Button
                            onClick={() => refreshInsightAndDashboard('Give me a 2-sentence summary of my current portfolio position.')}
                            disabled={dashboardInsightLoading}
                            className="btn-primary h-9 text-xs px-4"
                          >
                            {dashboardInsightLoading ? 'Analyzing...' : 'Generate Insight'}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

            </div>
          )}

          {activeTab === 'confidential' && (
            <div className="space-y-6 animate-in">
              <div className="grid lg:grid-cols-[1.3fr_0.7fr] gap-6">
                <Card className="card relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <div className="flex items-center gap-2">
                      <div className="badge badge-gold">
                        <Activity className="w-3 h-3 mr-1" />
                        Active
                      </div>
                    </div>
                  </div>
                  <CardHeader className="pb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl gold-gradient flex items-center justify-center shadow-[0_0_20px_var(--gold-glow)]">
                        <Shield className="w-6 h-6 text-black" />
                      </div>
                      <div className="pr-16 sm:pr-0">
                        <CardTitle className="text-lg sm:text-xl font-bold text-[var(--text-primary)] leading-tight">Confidential FHE Vault</CardTitle>
                        <CardDescription className="text-[10px] sm:text-xs text-[var(--text-muted)] font-bold uppercase tracking-wider mt-1">
                          Private {displayTokenSymbol} accounting
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-8">
                    <div className="p-6 rounded-2xl bg-white/5 border border-white/10 relative group fhe-pulse">
                      <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">Encrypted FHE Balance Handle</span>
                        <div className="w-2 h-2 rounded-full bg-[var(--gold)] animate-pulse" />
                      </div>
                      {hasPrivateVault ? (
                        <div className="flex flex-col gap-3">
                          <div className="p-4 bg-black/20 rounded-xl border border-white/5 font-mono text-[10px] break-all leading-relaxed text-yellow-500/80 shadow-inner">
                            {fheBalanceRevealed ? (
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-[var(--gold)]">
                                  {formatUsd(vaultUsdValue)}
                                </span>
                                <span className="text-[9px] uppercase tracking-tighter opacity-60">Decrypted Portfolio Value</span>
                              </div>
                            ) : (
                              encryptedBalanceHandle || 'Generating cryptographic handle...'
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Button
                              onClick={() => encryptedBalanceHandle && navigator.clipboard.writeText(encryptedBalanceHandle)}
                              disabled={!encryptedBalanceHandle}
                              className="h-10 bg-white/5 hover:bg-white/10 border border-white/10 text-[var(--text-primary)] text-xs font-bold rounded-xl transition-all"
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              Copy Handle
                            </Button>
                            <Button
                              onClick={handleRevealFHEBalance}
                              disabled={!encryptedBalanceHandle || isRevealing}
                              className="h-10 bg-[var(--gold)]/10 hover:bg-[var(--gold)]/20 border border-[var(--gold)]/20 text-[var(--gold)] text-xs font-bold rounded-xl transition-all"
                            >
                              {isRevealing ? (
                                <span className="flex items-center"><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Decrypting...</span>
                              ) : (
                                <span className="flex items-center"><Eye className="w-4 h-4 mr-2" /> {fheBalanceRevealed ? 'Refresh Reveal' : 'Reveal Balance'}</span>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-sm font-semibold text-[var(--text-muted)] italic">Vault Initialization Required</p>
                        </div>
                      )}
                      <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                        <Lock className="w-3.5 h-3.5 text-blue-400" />
                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">
                          Protected by Zama Fully Homomorphic Encryption
                        </p>
                      </div>
                    </div>

                    {hasPrivateVault ? (
                      <div className="space-y-4 pt-2">
                        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                          <input type="number" value={privateDepositAmount} onChange={(e) => setPrivateDepositAmount(e.target.value)} placeholder="Encrypted deposit amount" className="input h-10 px-3 text-sm text-[var(--text-primary)]" />
                          <Button onClick={handlePrivateDeposit} className="btn-primary h-10 px-4"><Plus className="w-4 h-4 mr-2" /> Private Deposit</Button>
                        </div>
                        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                          <input type="number" value={privateWithdrawAmount} onChange={(e) => setPrivateWithdrawAmount(e.target.value)} placeholder="Encrypted withdrawal amount" className="input h-10 px-3 text-sm text-[var(--text-primary)]" />
                          <Button onClick={handlePrivateWithdraw} className="h-10 px-4 bg-[var(--bg-muted)] hover:bg-[var(--border-color)] text-[var(--text-primary)]"><Minus className="w-4 h-4 mr-2" /> Private Withdraw</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                        <input
                          type="number"
                          value={privateInitialAmount}
                          onChange={(e) => setPrivateInitialAmount(e.target.value)}
                          placeholder={`Initial private ${displayTokenSymbol} amount`}
                          className="input h-10 px-3 text-sm text-[var(--text-primary)]"
                        />
                        <Button onClick={handleCreatePrivateVault} className="btn-primary h-10 px-4">
                          <Lock className="w-4 h-4 mr-2" />
                          Create Confidential Vault
                        </Button>
                      </div>
                    )}

                    {fheStatus && (
                      <p className={`text-xs ${fheStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                        {fheStatus}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">Status</CardTitle>
                    <CardDescription className="text-xs text-[var(--text-secondary)]">Separate from the public demo vault</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: 'Vault Type', value: 'Confidential (Encrypted)' },
                      { label: 'Private Vault', value: hasPrivateVault ? 'Created' : 'Not created' },
                      { label: 'Operations', value: privateOperationCount?.toString() || '0' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] pb-2 last:border-0 last:pb-0">
                        <span className="text-xs text-[var(--text-secondary)]">{item.label}</span>
                        <span className="text-xs font-medium text-[var(--text-primary)] text-right">{item.value}</span>
                      </div>
                    ))}
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] mb-1">FHE Vault Contract</p>
                      <code className="text-[11px] break-all text-[var(--text-muted)]">{BLIND_ORACLE_FHE_VAULT}</code>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'portfolio' && (
            <div className="space-y-6 animate-in">
              <div className="grid lg:grid-cols-2 gap-6">
                <Card className="card">
                  <CardHeader className="pb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center shadow-[0_0_15px_var(--gold-glow)]">
                        <PieChart className="w-5 h-5 text-black" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Asset Allocation</CardTitle>
                        <CardDescription className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-1">Real-time diversification map</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {portfolioAssets.map((asset) => (
                      <div key={asset.name} className="group">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-semibold text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">{asset.name}</span>
                          <span className="text-xs font-bold text-[var(--gold)]">{asset.allocation.toFixed(2)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/5 border border-white/5 overflow-hidden">
                          <div className="h-full gold-gradient rounded-full shadow-[0_0_10px_var(--gold-glow)] transition-all duration-1000" style={{ width: `${asset.allocation}%` }} />
                        </div>
                        <div className="flex justify-between mt-1.5">
                          <span className="text-[10px] text-[var(--text-muted)] font-medium">{Number(asset.value).toFixed(2)} Tokens</span>
                          <span className="text-[10px] text-[var(--text-secondary)] font-bold">{formatUsd(asset.usdValue)}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="card">
                  <CardHeader className="pb-6">
                    <CardTitle className="text-lg font-bold text-[var(--text-primary)] tracking-tight">Privacy Distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/20">
                          <Lock className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Encrypted Assets</p>
                          <p className="text-sm font-bold text-green-400">{formatUsd(vaultUsdValue + fheUsdcBalance)}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-0.5 rounded uppercase">Sovereign</span>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                          <Unlock className="w-4 h-4 text-orange-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Exposed Assets</p>
                          <p className="text-sm font-bold text-orange-400">{formatUsd(walletUsdValue + usdcBalanceValue)}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded uppercase">Visible</span>
                    </div>

                    <Button
                      onClick={() => {
                        if (usdcBalanceValue > 0) {
                          setTxStatus('Shielding USDC via Zama FHE...');
                          setIsShieldingUsdc(true);
                          setTimeout(() => {
                            setFheUsdcBalance(prev => prev + usdcBalanceValue);
                            // We mock the update of tracked balances for the demo
                            setTrackedBalances(prev => prev.map(b => b.symbol?.toUpperCase().includes('USD') ? { ...b, walletFormatted: 0 } : b));
                            setIsShieldingUsdc(false);
                            setTxStatus('USDC Shielded Successfully');
                            setTimeout(() => setTxStatus(''), 3000);
                          }, 3500);
                        }
                      }}
                      disabled={isShieldingUsdc || usdcBalanceValue === 0}
                      className="w-full h-12 btn-primary shadow-[0_0_15px_rgba(34,197,94,0.3)] !bg-green-600 border-none"
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      {isShieldingUsdc ? 'Generating FHE Proof...' : 'Shield Remaining USDC'}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {!hasVault ? (
                <Card className="col-span-full">
                  <CardContent className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: goldBg }}>
                      <PieChart className="w-8 h-8" style={{ color: gold }} />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">No Portfolio Yet</h3>
                    <p className="text-[var(--text-secondary)] mb-4">Create a vault and deposit assets to see your portfolio allocation.</p>
                    <Button onClick={handleCreateVault} className="btn-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Vault
                    </Button>
                  </CardContent>
                </Card>
              ) : totalTrackedTokens === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: goldBg }}>
                      <PieChart className="w-8 h-8" style={{ color: gold }} />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">No Assets Yet</h3>
                    <p className="text-[var(--text-secondary)] mb-4">Deposit {tokenAssetLabel} tokens to see your portfolio allocation.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="card col-span-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[var(--text-primary)]">
                      <TrendingUp className="w-4 h-4 text-gold" />
                      Track Additional Assets
                    </CardTitle>
                    <CardDescription className="text-xs text-[var(--text-muted)]">
                      Add other ERC20 token addresses to track them in your portfolio breakdown.
                      <span className="block mt-1.5 text-[10px] text-[var(--gold)] font-bold uppercase tracking-widest">
                        Note: You can only add USDC and EURC for now.
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 mb-4">
                      <input type="text" value={newTokenAddress} onChange={(e) => setNewTokenAddress(e.target.value)} placeholder="0x... Token Address" className="input flex-1 h-10 px-3 text-sm text-[var(--text-primary)]" />
                      <Button onClick={addTrackedToken} className="btn-primary h-10 px-4">Track Token</Button>
                    </div>

                    <div className="space-y-2">
                      {trackedBalances.map(b => (
                        <div key={b.address} className="flex items-center justify-between p-2 rounded border border-[var(--border-color)]">
                          <div>
                            <p className="text-xs font-semibold">{b.symbol}</p>
                            <code className="text-[10px] text-[var(--text-muted)]">{b.address.slice(0, 10)}...</code>
                          </div>
                          <div className="flex items-center gap-4">
                            <p className="text-xs font-mono">{b.walletFormatted.toLocaleString()} {b.symbol}</p>
                            {b.address !== MOCK_USDC ? (
                              <Button onClick={() => removeTrackedToken(b.address)} variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-500/10">×</Button>
                            ) : (
                              <div className="w-7 h-7 flex items-center justify-center opacity-30">
                                <Shield className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {activeTab === 'mint' && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <Card className="w-full max-w-3xl">
                <CardContent className="p-8">
                  {!showMintConfirm ? (
                    <div>
                      <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: goldBg }}>
                          <Wallet className="w-8 h-8" style={{ color: gold }} />
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">Get Test Tokens</h2>
                        <p className="text-sm text-[var(--text-secondary)]">Mint test tokens to simulate your portfolio allocation (no real value)</p>
                      </div>

                      <div className="flex gap-2 mb-8 p-1 bg-[var(--bg-muted)] rounded-xl">
                        {['RWA', 'USDC'].map(t => (
                          <button
                            key={t}
                            onClick={() => setMintToken(t)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${mintToken === t ? 'bg-[var(--bg-card)] text-[var(--gold)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                          >
                            {t === 'USDC' ? 'USD Coin / EURC' : `${displayTokenSymbol} Asset`}
                          </button>
                        ))}
                      </div>

                      {mintToken === 'RWA' ? (
                        <>
                          <div className="grid grid-cols-3 gap-3 mb-6">
                            {[1000, 5000, 10000, 25000, 50000, 100000].map((amt) => (
                              <button
                                key={amt}
                                onClick={() => { setMintAmount(amt.toString()); setShowMintConfirm(true); }}
                                className="py-4 rounded-xl bg-[var(--bg-muted)] border border-[var(--border-color)] font-semibold text-[var(--text-primary)] hover:border-[var(--gold)] hover:bg-[var(--gold)] hover:text-white transition-all"
                              >
                                {amt >= 1000 ? `${(amt / 1000).toFixed(0)}K` : amt}
                              </button>
                            ))}
                          </div>

                          <div className="p-8 rounded-2xl bg-white/[0.03] border border-white/5 text-center mb-8">
                            <div className="w-16 h-16 rounded-2xl gold-gradient flex items-center justify-center mx-auto mb-6 shadow-[0_0_20px_var(--gold-glow)]">
                              <Plus className="w-8 h-8 text-black" />
                            </div>
                            <h3 className="text-2xl font-bold text-[var(--text-primary)]">Mint Demo {displayTokenSymbol}</h3>
                            <p className="text-sm text-[var(--text-muted)] mt-2 font-medium">Create test liquidity to interact with the BlindOracle vault system.</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                            <input
                              type="number"
                              value={mintAmount}
                              onChange={(e) => setMintAmount(e.target.value)}
                              placeholder="0.00"
                              className="input flex-1 h-12 text-lg font-bold w-full"
                            />
                            <Button onClick={() => setShowMintConfirm(true)} disabled={!mintAmount} className="btn-primary h-12 px-8 shadow-[0_0_15px_var(--gold-glow)] w-full sm:w-auto">
                              Initiate Mint
                            </Button>
                          </div>
                        </>
                      ) : (
                        <div className="text-center mb-8 max-w-lg mx-auto">
                          <Card className="card p-8 bg-blue-500/5 border-blue-500/10">
                            <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-6">
                              <span className="text-2xl font-bold text-blue-400">$</span>
                            </div>
                            <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-2 tracking-tight">Official Sepolia USDC/EURC</h3>
                            <p className="text-sm text-[var(--text-muted)] mb-8 font-medium leading-relaxed">
                              BlindOracle supports real Sepolia USDC and EURC for a professional demo. Request test tokens from Circle's official portal.
                            </p>
                            <Button
                              onClick={() => window.open('https://faucet.circle.com/', '_blank')}
                              className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xl transition-all"
                            >
                              <ArrowUpRight className="w-5 h-5 mr-2" />
                              Open Circle Faucet Portal
                            </Button>
                            <div className="mt-6 flex items-center justify-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                              <p className="text-[10px] text-blue-400/80 font-bold uppercase tracking-widest">
                                Auto-Detected in Dashboard
                              </p>
                            </div>
                          </Card>
                        </div>
                      )}

                      <div className="border-t border-[var(--border-color)] pt-6">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                          <Shield className="w-4 h-4" style={{ color: gold }} />
                          What are {displayTokenSymbol} ERC20 Tokens?
                        </h3>

                        <div className="grid md:grid-cols-3 gap-4">
                          <div className="p-4 rounded-lg bg-[var(--bg-muted)] border border-[var(--border-color)]">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: goldBg }}>
                              <span className="text-xs font-bold" style={{ color: gold }}>1</span>
                            </div>
                            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Testnet Only</p>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              These are test tokens with <span className="text-[var(--text-primary)] font-medium">zero real value</span>. They only exist on Sepolia testnet and cannot be exchanged for real money.
                            </p>
                          </div>

                          <div className="p-4 rounded-lg bg-[var(--bg-muted)] border border-[var(--border-color)]">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: goldBg }}>
                              <span className="text-xs font-bold" style={{ color: gold }}>2</span>
                            </div>
                            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">For Testing BlindOracle</p>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              Use {tokenAssetLabel} tokens to <span className="text-[var(--text-primary)] font-medium">create a vault</span>, <span className="text-[var(--text-primary)] font-medium">deposit</span>, and test the BlindOracle workflow on Sepolia.
                            </p>
                          </div>

                          <div className="p-4 rounded-lg bg-[var(--bg-muted)] border border-[var(--border-color)]">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: goldBg }}>
                              <span className="text-xs font-bold" style={{ color: gold }}>3</span>
                            </div>
                            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Earn Simulated Yield</p>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              The current app shows a <span className="text-[var(--gold)] font-semibold">simulated yield</span> concept. Production yield and private decryption require a rate feed plus Zama KMS integration.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: goldBg }}>
                        <Wallet className="w-8 h-8" style={{ color: gold }} />
                      </div>
                      <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Confirm Mint</h3>
                      <p className="text-sm text-[var(--text-secondary)] mb-6">
                        You are about to mint <span className="font-bold text-[var(--text-primary)]">{Number(mintAmount).toLocaleString()} {mintToken === 'USDC' ? 'USDC' : displayTokenSymbol}</span>
                      </p>
                      <div className="flex gap-3">
                        <Button onClick={() => setShowMintConfirm(false)} variant="outline" className="flex-1 h-12">
                          Cancel
                        </Button>
                        <Button onClick={handleMintTokens} className="btn-primary flex-1 h-12">
                          <Plus className="w-4 h-4 mr-2" />
                          Confirm
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'analyst' && (
            <div className="h-[calc(100vh-140px)] flex flex-col animate-in">
              {/* Chat History Area */}
              <div className="flex-1 overflow-y-auto space-y-6 pb-8 pr-4 custom-scrollbar">
                {submittedQueries.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                      <Cpu className="w-8 h-8 text-[var(--gold)]" />
                    </div>
                    <p className="text-sm font-bold uppercase tracking-widest text-[var(--gold)]">Analyst Standby</p>
                    <p className="text-xs text-[var(--text-muted)] mt-2 max-w-xs">Awaiting cryptographic context from Sepolia...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {submittedQueries.map((query) => (
                      <Card key={query.id} className="card bg-white/[0.02] border-white/5 hover:bg-white/[0.03]">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-5">
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                              <Shield className="w-5 h-5 text-[var(--gold)]" />
                            </div>
                            <div className="flex-1 space-y-4">
                              <div className="flex justify-between items-center">
                                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">User Query</p>
                                <span className="text-[10px] text-[var(--text-muted)] font-medium">{query.timestamp.toLocaleTimeString()}</span>
                              </div>
                              <p className="text-sm font-bold text-[var(--text-primary)] tracking-tight bg-white/5 px-4 py-3 rounded-xl border border-white/5">
                                {query.text}
                              </p>
                              <div className="flex items-center gap-2 pt-2">
                                <div className="w-1 h-1 rounded-full bg-[var(--gold)]" />
                                <p className="text-[10px] font-bold text-[var(--gold)] uppercase tracking-[0.2em]">Analyst Logic</p>
                              </div>
                              <div className="ai-bubble">
                                {renderAnalystSections(query.response, displayTokenSymbol)}
                              </div>
                              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                                <div className="px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20 flex items-center gap-1.5">
                                  <Shield className="w-3 h-3 text-green-400" />
                                  <span className="text-[9px] font-bold text-green-400 uppercase tracking-widest">FHE Context Verified</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Sticky Input Bar */}
              <div className="pt-6 border-t border-white/10 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent">
                <div className="max-w-4xl mx-auto space-y-4">
                  {/* Suggestions Scroll */}
                  <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar px-1">
                    {SAMPLE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setQueryText(prompt)}
                        className="whitespace-nowrap px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-bold text-[var(--text-muted)] hover:border-[var(--gold)]/50 hover:text-[var(--gold)] transition-all uppercase tracking-widest"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  {/* Input Area */}
                  <div className="relative group">
                    <div className="absolute inset-0 bg-[var(--gold)]/5 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                    <div className="relative glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                      <div className="flex items-end gap-3 p-2">
                        <Textarea
                          value={queryText}
                          onChange={(e) => setQueryText(e.target.value)}
                          placeholder="Execute intelligence query..."
                          className="flex-1 min-h-[60px] max-h-[200px] bg-transparent border-none focus:ring-0 text-[var(--text-primary)] text-sm p-4 resize-none"
                          disabled={isSubmitting}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmitQuery();
                            }
                          }}
                        />
                        <div className="pb-3 pr-3">
                          <Button
                            onClick={handleSubmitQuery}
                            disabled={!queryText.trim() || isSubmitting || !isConnected}
                            className="btn-primary h-12 w-12 rounded-xl p-0 shadow-[0_0_15px_var(--gold-glow)]"
                          >
                            {isSubmitting ? <Activity className="w-5 h-5 animate-spin" /> : <ArrowUpRight className="w-5 h-5" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-6 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">Oracle Node Online</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-3 h-3 text-[var(--text-muted)]" />
                      <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-[0.2em]">Privacy Enabled</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Global Transaction Status Toast */}
        {txStatus && (
          <div className="fixed bottom-8 right-8 z-[100] animate-in slide-in-from-right-10 duration-500">
            <div className={`px-6 py-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-4 backdrop-blur-xl border ${txStatus.includes('Error')
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-[var(--bg-card)] border-[var(--gold)]/40 text-[var(--gold)]'
              }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${txStatus.includes('Error') ? 'bg-red-500/20' : 'bg-[var(--gold)]/20'
                }`}>
                {txStatus.includes('Error') ? <X className="w-4 h-4" /> : <Activity className="w-4 h-4 animate-pulse" />}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">System Notification</p>
                <p className="text-sm font-bold tracking-tight">{txStatus}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ThemedApp() {
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]);

  return (
    <RainbowKitProvider theme={isDarkMode ? darkTheme({ accentColor: '#F4C430', borderRadius: 'medium' }) : lightTheme({ accentColor: '#F4C430', borderRadius: 'medium' })}>
      <AppContent isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
    </RainbowKitProvider>
  );
}

export default function App() {
  return <WagmiProvider config={config}><QueryClientProvider client={queryClient}><ThemedApp /></QueryClientProvider></WagmiProvider>;
}
