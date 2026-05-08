import { ConnectButton, darkTheme, lightTheme, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sepolia } from 'wagmi/chains';
import { http, createConfig, useAccount, useDisconnect, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { useState, useEffect } from 'react';
import {
  Vault, PieChart, Cpu, Lock, Unlock, TrendingUp, Plus, Minus,
  Wallet, ArrowUpRight, Sun, Moon, LogOut, Copy, Check, Menu, X, Key, Shield, Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

const BLIND_ORACLE_VAULT = '0xEBe26e87b898152e387C4f18F4C8DA932cbDC29f';
const BLIND_ORACLE_ANALYST = '0xC2b2677E092191f96373CA54920fAc16863F92Ed';
const MOCK_TOKEN = '0x0a9A09B392f95D8999a1a5a14E09cd378Fc23F78';

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
}];

const config = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http() },
  ssr: false,
});

const queryClient = new QueryClient();

const SAMPLE_PROMPTS = ["Analyze my RWA portfolio", "What's my asset allocation?", "Calculate my yield", "Risk assessment"];
const ANALYST_API_URL = import.meta.env.VITE_ANALYST_API_URL || 'http://localhost:8787';

async function getAIResponse(queryText, userAddress) {
  const response = await fetch(`${ANALYST_API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: queryText, userAddress }),
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

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash }
  });

  const { data: hasVault, refetch: refetchHasVault } = useReadContract({ address: BLIND_ORACLE_VAULT, abi: VAULT_ABI, functionName: 'hasVault', args: [address], query: { enabled: !!address } });
  const { data: balance, refetch: refetchBalance } = useReadContract({ address: BLIND_ORACLE_VAULT, abi: VAULT_ABI, functionName: 'getBalance', account: address, query: { enabled: !!hasVault && !!address } });
  const { data: depositCount, refetch: refetchDepositCount } = useReadContract({ address: BLIND_ORACLE_VAULT, abi: VAULT_ABI, functionName: 'getDepositCount', args: [address], query: { enabled: !!hasVault } });
  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({ address: MOCK_TOKEN, abi: TOKEN_ABI, functionName: 'balanceOf', args: [address], query: { enabled: !!address } });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [mintAmount, setMintAmount] = useState('10000');
  const [showMintConfirm, setShowMintConfirm] = useState(false);
  const [queryText, setQueryText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedQueries, setSubmittedQueries] = useState([]);
  const [copied, setCopied] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [txStatus, setTxStatus] = useState('');

  const handleCreateVault = () => {
    setTxStatus('Creating vault...');
    writeContract({
      address: BLIND_ORACLE_VAULT,
      abi: VAULT_ABI,
      functionName: 'createVault',
      args: [0]
    });
  };

  const handleDeposit = async () => {
    if (!depositAmount) return;
    const amount = parseInt(depositAmount, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      setTxStatus('Error: Enter a whole number greater than 0');
      return;
    }

    try {
      const tokenAmount = BigInt(amount) * 10n ** 18n;
      setTxStatus('Approving vault to spend tokens...');
      const approvalHash = await writeContractAsync({
        address: MOCK_TOKEN,
        abi: TOKEN_ABI,
        functionName: 'approve',
        args: [BLIND_ORACLE_VAULT, tokenAmount]
      });
      await waitForTransactionReceipt(config, { hash: approvalHash });

      setTxStatus('Depositing tokens into vault...');
      const depositHash = await writeContractAsync({
        address: BLIND_ORACLE_VAULT,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [amount]
      });
      await waitForTransactionReceipt(config, { hash: depositHash });

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
    const amount = parseInt(withdrawAmount, 10);
    if (!Number.isInteger(amount) || amount <= 0) {
      setTxStatus('Error: Enter a whole number greater than 0');
      return;
    }

    try {
      setTxStatus('Withdrawing tokens from vault...');
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

  const handleMintTokens = () => {
    setTxStatus('Minting tokens...');
    writeContract({
      address: MOCK_TOKEN,
      abi: TOKEN_ABI,
      functionName: 'mintToSelf',
      args: [BigInt(mintAmount + '000000000000000000')]
    });
    setShowMintConfirm(false);
  };

  // Refetch data when transaction confirms
  useEffect(() => {
    if (isConfirmed) {
      setTxStatus('Transaction confirmed!');
      refetchBalance();
      refetchDepositCount();
      refetchTokenBalance();
      refetchHasVault();
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

  const handleSubmitQuery = async () => {
    if (!queryText.trim() || !isConnected) return;
    setIsSubmitting(true);
    try {
      const result = await getAIResponse(queryText, address);
      setSubmittedQueries(prev => [{
        id: Date.now(),
        text: queryText,
        response: result.analysis,
        model: result.model,
        blockNumber: result.snapshot?.blockNumber,
        timestamp: new Date()
      }, ...prev]);
      setQueryText('');
    } catch (err) {
      setSubmittedQueries(prev => [{
        id: Date.now(),
        text: queryText,
        response: `Live analyst unavailable: ${err.message}. Make sure the oracle backend is running on ${ANALYST_API_URL}.`,
        timestamp: new Date()
      }, ...prev]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyAddress = () => { navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 2000); setShowWalletMenu(false); };
  const handleDisconnect = () => { disconnect(); setShowWalletMenu(false); };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Vault },
    { id: 'portfolio', label: 'Portfolio', icon: PieChart },
    { id: 'analyst', label: 'AI Analyst', icon: Cpu },
    { id: 'mint', label: 'Get Tokens', icon: Wallet },
  ];

  const portfolioAssets = [
    { name: 'T-Bills', value: 5200, allocation: 42 },
    { name: 'Private Credit', value: 4100, allocation: 33 },
    { name: 'Real Estate', value: 2150, allocation: 17 },
    { name: 'Cash', value: 1000, allocation: 8 },
  ];

  // Theme colors - using CSS variables
  const gold = '#F4C430';
  const goldBg = 'rgba(212, 175, 55, 0.15)';
  const goldBorder = 'rgba(212, 175, 55, 0.3)';

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-[var(--bg-muted)] rounded-lg">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Lock className="w-5 h-5" style={{ color: gold }} />
            <span className="font-semibold text-[var(--text-primary)]">BlindOracle</span>
          </div>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-[var(--bg-muted)] rounded-lg">
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 border-r border-[var(--border-color)] bg-[var(--bg-secondary)] z-40 transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center border" style={{ backgroundColor: goldBg, borderColor: goldBorder }}>
              <Lock className="w-5 h-5" style={{ color: gold }} />
            </div>
            <div>
              <h1 className="font-semibold text-sm text-[var(--text-primary)]">BlindOracle</h1>
              <p className="text-xs text-[var(--text-secondary)]">Confidential RWA</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`sidebar-item w-full ${activeTab === item.id ? 'active' : ''}`}
              >
                <item.icon className="w-4 h-4" style={activeTab === item.id ? { color: gold } : { color: 'var(--text-secondary)' }} />
                <span className="text-sm font-medium" style={{ color: activeTab === item.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Wallet */}
        <div className="absolute bottom-0 left-0 right-0 p-5 border-t border-[var(--border-color)]">
          {isConnected ? (
            <div className="relative">
              <button onClick={() => setShowWalletMenu(!showWalletMenu)} className="w-full py-2.5 px-3 rounded-lg text-white text-sm font-medium flex items-center justify-between" style={{ backgroundColor: gold }}>
                <span className="font-mono">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              </button>
              {showWalletMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-lg overflow-hidden">
                  <div className="p-3 border-b border-[var(--border-color)]">
                    <p className="text-xs text-[var(--text-secondary)]">Connected</p>
                    <p className="text-xs font-mono truncate mt-0.5 text-[var(--text-primary)]">{address}</p>
                  </div>
                  <button onClick={handleCopyAddress} className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-[var(--bg-muted)]">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={handleDisconnect} className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 border-t border-[var(--border-color)] text-red-500 hover:bg-red-500/10">
                    <LogOut className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button onClick={openConnectModal} className="w-full py-2.5 px-3 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: gold }}>
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="lg:ml-64 min-h-screen pt-14 lg:pt-0">
        {/* Top Bar */}
        <div className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {activeTab === 'dashboard' && 'Vault Dashboard'}
                {activeTab === 'portfolio' && 'Portfolio Allocation'}
                {activeTab === 'analyst' && 'AI Analyst'}
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {activeTab === 'dashboard' && 'Manage your encrypted vault'}
                {activeTab === 'portfolio' && 'View asset allocation'}
                {activeTab === 'analyst' && 'Query encrypted data'}
              </p>
            </div>
            <div className="badge badge-primary">
              <Lock className="w-3 h-3" />
              Live On-chain
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Debug Info */}
            {isConnected && (
              <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-muted)] px-3 py-1.5 rounded-lg border border-[var(--border-color)]">
                <span className="font-mono">{address?.slice(0, 10)}...{address?.slice(-8)}</span>
                {hasVault ? (
                  <span className="ml-2 text-green-400">✓ Vault</span>
                ) : (
                  <span className="ml-2 text-orange-400">✗ No Vault</span>
                )}
              </div>
            )}
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 hover:bg-[var(--bg-muted)] rounded-lg">
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 lg:p-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardDescription className="text-[var(--text-secondary)]">Deposited in Vault</CardDescription>
                        <CardTitle className="text-xl mt-1 font-semibold text-[var(--text-primary)]">{balance?.toString() || '0'} RWA</CardTitle>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Assets earning yield</p>
                        {depositCount !== undefined && depositCount !== null && (
                          <p className="text-xs text-orange-400 mt-1">
                            Raw: {balance?.toString()} | Deposits: {depositCount.toString()}
                          </p>
                        )}
                      </div>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: goldBg }}>
                        <Vault className="w-5 h-5" style={{ color: gold }} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: gold }}>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>{depositCount?.toString() || '0'} deposits made</span>
                      <button
                        onClick={() => { refetchBalance(); refetchDepositCount(); }}
                        className="ml-2 text-xs underline opacity-70 hover:opacity-100"
                      >
                        Refresh
                      </button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardDescription className="text-[var(--text-secondary)]">Wallet Balance</CardDescription>
                        <CardTitle className="text-xl mt-1 font-semibold text-[var(--text-primary)]">{tokenBalance ? (Number(tokenBalance) / 1e18).toFixed(2) : '0'} RWA</CardTitle>
                        <p className="text-xs text-[var(--text-muted)] mt-1">Available to deposit</p>
                      </div>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: goldBg }}>
                        <Wallet className="w-5 h-5" style={{ color: gold }} />
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardDescription className="text-[var(--text-secondary)]">Total Value</CardDescription>
                        <CardTitle className="text-xl mt-1 font-semibold text-[var(--text-primary)]">{hasVault && balance ? `$${(Number(balance) / 1000).toFixed(2)}` : '--'}</CardTitle>
                        <p className="text-xs text-[var(--text-muted)] mt-1">USD equivalent</p>
                      </div>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: goldBg }}>
                        <TrendingUp className="w-5 h-5" style={{ color: gold }} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {hasVault ? (
                      <div className="flex items-center gap-1.5 text-xs" style={{ color: gold }}>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>5.2% APY earning</span>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">Create vault to start earning</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {!hasVault ? (
                <div className="space-y-32">
                  {/* Create Vault Card */}
                  <Card>
                    <CardContent className="p-6">
                      <div className="text-center">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 border" style={{ backgroundColor: goldBg, borderColor: goldBorder }}>
                          <Lock className="w-6 h-6" style={{ color: gold }} />
                        </div>
                        <h3 className="text-lg font-semibold mb-1 text-[var(--text-primary)]">Step 1: Create Your Vault</h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-4">Initialize your encrypted vault to start earning private yield on RWA tokens.</p>
                        <Button onClick={handleCreateVault} className="btn-primary px-6 py-5">
                          <Plus className="w-4 h-4 mr-2" />
                          Create Vault (Requires 1000 RWA)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* FHE Pipeline */}
                  <div className="flex justify-center">
                    <Card className="w-fit min-w-[450px]">
                      <CardHeader className="pb-2">
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] text-center">🔐 Your Data Stays Private with FHE</h4>
                        <p className="text-xs text-[var(--text-secondary)] text-center mt-1">Fully Homomorphic Encryption keeps your portfolio confidential</p>
                      </CardHeader>
                      <CardContent className="p-6">
                        <div>
                          {[
                            { num: 1, label: 'Your Data', sub: 'Enter plaintext info', icon: Lock },
                            { num: 2, label: 'Gets Encrypted', sub: 'Locked with encryption', icon: Key },
                            { num: 3, label: 'AI Analyzes', sub: 'Computes on encrypted data', icon: Cpu },
                            { num: 4, label: 'You See Results', sub: 'Only you can decrypt', icon: Unlock },
                          ].map((step) => (
                            <div key={step.num} className="flex items-center gap-4 py-3">
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold" style={{ backgroundColor: goldBg, borderColor: goldBorder, border: '1px solid' }}>
                                <span style={{ color: gold }}>{step.num}</span>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--text-primary)]">{step.label}</span>
                                  <span className="text-xs text-[var(--text-secondary)]">→ {step.sub}</span>
                                </div>
                              </div>
                              <step.icon className="w-5 h-5" style={{ color: gold }} />
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
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
                      {txStatus && (
                        <p className={`text-xs mt-2 ${txStatus.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                          {txStatus}
                        </p>
                      )}
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
                </div>
              )}
            </div>
          )}

          {activeTab === 'portfolio' && (
            <div className="grid lg:grid-cols-2 gap-4">
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
              ) : !balance || Number(balance) === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: goldBg }}>
                      <PieChart className="w-8 h-8" style={{ color: gold }} />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">No Assets Yet</h3>
                    <p className="text-[var(--text-secondary)] mb-4">Deposit RWA tokens to see your portfolio allocation.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[var(--text-primary)]">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: goldBg }}>
                          <PieChart className="w-4 h-4" style={{ color: gold }} />
                        </div>
                        Asset Allocation
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {portfolioAssets.map((asset) => (
                        <div key={asset.name}>
                          <div className="flex justify-between mb-1.5">
                            <span className="text-sm text-[var(--text-primary)]">{asset.name}</span>
                            <span className="text-xs font-medium text-[var(--text-primary)]">{asset.allocation}% (${asset.value.toLocaleString()})</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--bg-muted)] overflow-hidden">
                            <div className="h-full rounded-full" style={{ backgroundColor: gold, width: `${asset.allocation}%` }} />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">Portfolio Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { label: 'Total Value', value: balance ? `$${(Number(balance) / 1000).toFixed(2)}` : '$0.00', icon: Wallet },
                        { label: 'Blended APY', value: '5.2%', icon: TrendingUp, highlight: true },
                        { label: 'Est. Annual Yield', value: balance ? `$${(Number(balance) * 0.052 / 1000).toFixed(2)}` : '$0.00', icon: ArrowUpRight },
                        { label: 'Risk Profile', value: 'Low-Moderate', icon: Shield, highlight: 'text-yellow-600' },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-muted)]">
                          <div className="flex items-center gap-3">
                            <item.icon className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                            <span className="text-sm text-[var(--text-primary)]">{item.label}</span>
                          </div>
                          <span className="text-sm font-semibold" style={item.highlight === true ? { color: gold } : {}}>{item.value}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </>
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
                        <p className="text-sm text-[var(--text-secondary)]">Mint RWA tokens for testing (no real value)</p>
                      </div>

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

                      <div className="flex items-center gap-3 mb-8">
                        <input
                          type="number"
                          value={mintAmount}
                          onChange={(e) => setMintAmount(e.target.value)}
                          placeholder="Custom amount"
                          className="flex-1 h-12 px-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-color)] text-base text-[var(--text-primary)] focus:outline-none focus:border-[var(--gold)]"
                        />
                        <Button onClick={() => setShowMintConfirm(true)} disabled={!mintAmount} className="btn-primary h-12 px-6">
                          Mint
                        </Button>
                      </div>

                      <div className="border-t border-[var(--border-color)] pt-6">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2 mb-4">
                          <Shield className="w-4 h-4" style={{ color: gold }} />
                          What are RWA Tokens?
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
                              Use RWA tokens to <span className="text-[var(--text-primary)] font-medium">create a vault</span>, <span className="text-[var(--text-primary)] font-medium">deposit</span>, and experience privacy-preserving DeFi with Zama FHE.
                            </p>
                          </div>

                          <div className="p-4 rounded-lg bg-[var(--bg-muted)] border border-[var(--border-color)]">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: goldBg }}>
                              <span className="text-xs font-bold" style={{ color: gold }}>3</span>
                            </div>
                            <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Earn Simulated Yield</p>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                              Deposited tokens earn <span className="text-[var(--gold)] font-semibold">5.2% APY</span> in the encrypted vault. All computations on your balance happen <span className="text-[var(--text-primary)] font-medium">without decryption</span> using FHE.
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
                        You are about to mint <span className="font-bold text-[var(--text-primary)]">{Number(mintAmount).toLocaleString()} RWA</span>
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
            <div className="space-y-4">
              {!hasVault ? (
                <Card className="col-span-full">
                  <CardContent className="p-12 text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: goldBg }}>
                      <Cpu className="w-8 h-8" style={{ color: gold }} />
                    </div>
                    <h3 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">AI Analyst Unavailable</h3>
                    <p className="text-[var(--text-secondary)] mb-4">Create a vault to query your encrypted portfolio with AI.</p>
                    <Button onClick={handleCreateVault} className="btn-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Vault
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: goldBg }}>
                          <Cpu className="w-4 h-4" style={{ color: gold }} />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-semibold text-[var(--text-primary)]">Live AI Analyst</CardTitle>
                          <CardDescription className="text-xs text-[var(--text-secondary)]">Reads fresh Sepolia contract state for every answer</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {SAMPLE_PROMPTS.map((prompt) => (
                          <button key={prompt} onClick={() => setQueryText(prompt)} className="px-3 py-1.5 rounded-lg bg-[var(--bg-muted)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] hover:border-[#F4C430] transition-colors">
                            {prompt}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <Textarea value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Ask about your portfolio..." className="min-h-[100px] input resize-none text-[var(--text-primary)]" disabled={isSubmitting} />
                        <Button onClick={handleSubmitQuery} disabled={!queryText.trim() || isSubmitting || !isConnected} className="absolute bottom-3 right-3 btn-primary h-9">
                          {isSubmitting ? <Zap className="w-4 h-4 mr-2 animate-pulse" /> : <Shield className="w-4 h-4 mr-2" />}
                          {isSubmitting ? 'Analyzing...' : 'Analyze'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {submittedQueries.length > 0 && (
                    <div className="space-y-3">
                      {submittedQueries.map((query) => (
                        <Card key={query.id}>
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: goldBg }}>
                                <Shield className="w-4 h-4" style={{ color: gold }} />
                              </div>
                              <div className="flex-1">
                                <p className="text-xs text-[var(--text-secondary)] mb-1.5">{query.text}</p>
                                <p className="text-sm text-[var(--text-primary)]">{query.response}</p>
                                <p className="text-xs text-[var(--text-secondary)] mt-2">{query.timestamp.toLocaleTimeString()}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
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
