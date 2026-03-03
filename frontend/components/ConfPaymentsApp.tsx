"use client";

import {useEffect, useMemo, useState} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  Clock3,
  Copy,
  CreditCard,
  Eye,
  Home,
  Lock,
  Search,
  Settings,
  Shield,
  UserCircle2
} from "lucide-react";
import {toast} from "sonner";
import {formatEther, formatUnits, parseAbiItem, type Address} from "viem";
import {getEmbeddedConnectedWallet, usePrivy, useWallets} from "@privy-io/react-auth";
import {useAccount, useDisconnect, usePublicClient} from "wagmi";
import {useConfPayments} from "@/hooks/useConfPayments";
import {useSetActiveWallet} from "@privy-io/wagmi";

type View =
  | "landing"
  | "welcome"
  | "signup"
  | "verify"
  | "profileSetup"
  | "fund"
  | "home"
  | "send"
  | "receive"
  | "bank"
  | "card"
  | "history"
  | "notifications"
  | "profile";
type Tab = "home" | "card" | "history" | "profile";
type Tx = {id: string; kind: "send" | "receive" | "card" | "bank"; title: string; time: string; local: string; usdc: string; revealed?: boolean};
type Quote = {currency: string; amountLocal: string; usdcAmount: string; feeLocal: number};

const keypad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];
const PRIVATE_BALANCE_CACHE_PREFIX = "conf_payments_private_balance";
const PRIVATE_BALANCE_LAST_KEY = "conf_payments_private_balance_last";
const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, bytes32 amount)");
const WRAPPED_EVENT = parseAbiItem("event WrappedUSDC(address indexed user, uint256 amount)");
function resolveTokenDeployBlock() {
  const raw = process.env.NEXT_PUBLIC_PAYMENT_TOKEN_DEPLOY_BLOCK;
  if (!raw) return BigInt(38317018);
  try {
    return BigInt(raw.trim());
  } catch {
    return BigInt(38317018);
  }
}
const TOKEN_DEPLOY_BLOCK = resolveTokenDeployBlock();

function mergeTxRows(current: Tx[], incoming: Tx[]) {
  const byId = new Map<string, Tx>();
  for (const tx of [...incoming, ...current]) {
    byId.set(tx.id, tx);
  }
  return Array.from(byId.values());
}

export function ConfPaymentsApp() {
  const {address} = useAccount();
  const {disconnect} = useDisconnect();
  const {ready, authenticated, login, logout} = usePrivy();
  const {wallets, ready: walletsReady} = useWallets();
  const {setActiveWallet} = useSetActiveWallet();
  const publicClient = usePublicClient();
  const {fiatMode, cardMode, paymentTokenAddress, balanceHandle, decryptHandle, sendPrivate, sendEth, wrapUsdc, getWalletUsdcBalance, getWalletEthBalance, getOfframpQuote, initiateOfframpPayout, settleOfframpFromPrivateBalance} = useConfPayments();
  const requiredInviteCode = (process.env.NEXT_PUBLIC_BETA_INVITE_CODE || "").trim();
  const allowedInviteCodes = requiredInviteCode
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

  const [view, setView] = useState<View>("landing");
  const [tab, setTab] = useState<Tab>("home");
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [balance, setBalance] = useState<string | null>(() => {
    try {
      if (typeof window === "undefined") return null;
      return localStorage.getItem(PRIVATE_BALANCE_LAST_KEY);
    } catch {
      return null;
    }
  });
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [signupEmail, setSignupEmail] = useState("");
  const [emailForOtp, setEmailForOtp] = useState("");
  const [emailAuthBusy, setEmailAuthBusy] = useState(false);
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [country, setCountry] = useState("Nigeria");
  const [freeze, setFreeze] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [wrapAmount, setWrapAmount] = useState("5");
  const [wrapBusy, setWrapBusy] = useState(false);
  const [syncingPrivateBalance, setSyncingPrivateBalance] = useState(false);
  const [autoWrapBusy, setAutoWrapBusy] = useState(false);
  const [walletUsdcBalance, setWalletUsdcBalance] = useState("0.000000");
  const [walletEthBalance, setWalletEthBalance] = useState("0.000000");
  const [lastAutoWrapAmount, setLastAutoWrapAmount] = useState("0");
  const [ngnPerUsdc, setNgnPerUsdc] = useState(1353.36);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "send" | "receive" | "card">("all");

  const [sendCurrency, setSendCurrency] = useState<"NGN" | "USDC" | "ETH">("NGN");
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendBank, setSendBank] = useState("");
  const [sendAcct, setSendAcct] = useState("");
  const [sendAcctName, setSendAcctName] = useState("");
  const [sendNote, setSendNote] = useState("");

  const [bankAmount, setBankAmount] = useState("");
  const [bankCurrency, setBankCurrency] = useState("NGN");
  const [bankName, setBankName] = useState("");
  const [bankAcct, setBankAcct] = useState("");
  const [bankAcctName, setBankAcctName] = useState("");
  const [bankQuote, setBankQuote] = useState<Quote | null>(null);
  const [busyBank, setBusyBank] = useState(false);

  const [txs, setTxs] = useState<Tx[]>([
    {id: "1", kind: "receive", title: "Adebayo K.", time: "Today 10:12", local: "₦5,000", usdc: "3.22 USDC"},
    {id: "2", kind: "card", title: "Bukka Spot", time: "Yesterday 19:11", local: "₦12,450", usdc: "8.04 USDC"}
  ]);

  const sendUsdcEq = useMemo(() => {
    if (sendCurrency === "USDC") return Number(sendAmount || 0).toFixed(2);
    if (sendCurrency === "NGN") return (Number(sendAmount || 0) / 1550).toFixed(2);
    return Number(sendAmount || 0).toFixed(6);
  }, [sendAmount, sendCurrency]);
  const history = useMemo(
    () => txs.filter((t) => (filter === "all" ? true : filter === "card" ? t.kind === "card" : t.kind === filter || (filter === "send" && t.kind === "bank"))).filter((t) => `${t.title} ${t.local}`.toLowerCase().includes(search.toLowerCase())),
    [txs, filter, search]
  );

  useEffect(() => {
    let dead = false;
    async function q() {
      if (!bankAmount || Number(bankAmount) <= 0) return setBankQuote(null);
      try {
        const v = (await getOfframpQuote(bankAmount, bankCurrency)) as Quote;
        if (!dead) setBankQuote(v);
      } catch {
        if (!dead) setBankQuote(null);
      }
    }
    const t = setTimeout(q, 300);
    return () => {
      dead = true;
      clearTimeout(t);
    };
  }, [bankAmount, bankCurrency, getOfframpQuote]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) return;
    if (["welcome", "signup", "verify"].includes(view)) {
      setView("profileSetup");
    }
  }, [authenticated, ready, view]);

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady || address) return;
    const embedded = getEmbeddedConnectedWallet(wallets);
    if (!embedded) return;
    setActiveWallet(embedded).catch(() => {
      // Non-blocking fallback: wallet can still be selected by Privy defaults.
    });
  }, [address, authenticated, ready, setActiveWallet, wallets, walletsReady]);

  useEffect(() => {
    async function loadHistory() {
      if (!address) return;
      try {
        const response = await fetch(`/api/history?wallet=${address}`);
        if (!response.ok) return;
        const payload = await response.json();
        const mapped = (payload?.transactions || []).map((row: any) => ({
          id: String(row.id),
          kind: row.type === "card" ? "card" : row.type === "bank" ? "bank" : row.type === "receive" ? "receive" : "send",
          title: row.title || "Transfer",
          time: row.created_at ? new Date(row.created_at).toLocaleString() : "Now",
          local:
            Number(row.local_amount || 0) > 0
              ? `${Number(row.local_amount || 0).toLocaleString()} ${String(row.local_currency || "NGN")}`
              : `₦${(Number(row.usdc_amount || 0) * ngnPerUsdc).toLocaleString(undefined, {maximumFractionDigits: 2})}`,
          usdc: `${Number(row.usdc_amount || 0).toFixed(4)} USDC`
        }));
        if (mapped.length > 0) setTxs((prev) => mergeTxRows(prev, mapped));
      } catch {
        // keep local fallback tx list
      }
    }
    loadHistory();
  }, [address, ngnPerUsdc]);

  useEffect(() => {
    if (!address || !publicClient || !paymentTokenAddress) return;
    const client = publicClient;
    let cancelled = false;

    async function loadOnchainHistory() {
      try {
        if (!address) return;
        const latest = await client.getBlockNumber();
        const fromBlock = TOKEN_DEPLOY_BLOCK > latest ? BigInt(0) : TOKEN_DEPLOY_BLOCK;
        const me = address.toLowerCase();

        const [allTransferLogs, wrappedLogs] = await Promise.all([
          client.getLogs({
            address: paymentTokenAddress,
            event: TRANSFER_EVENT,
            fromBlock,
            toBlock: latest
          }),
          client.getLogs({
            address: paymentTokenAddress,
            event: WRAPPED_EVENT,
            fromBlock,
            toBlock: latest
          })
        ]);

        const receivedLogs = allTransferLogs.filter((log) => String(log.args.to || "").toLowerCase() === me).reverse();
        const sentLogs = allTransferLogs.filter((log) => String(log.args.from || "").toLowerCase() === me).reverse();
        const myWrappedLogs = wrappedLogs.filter((log) => String(log.args.user || "").toLowerCase() === me).reverse();

        const onchainTxs: Tx[] = [
          ...receivedLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}-recv`,
            kind: "receive" as const,
            title: `From ${(log.args.from as Address)?.slice(0, 6)}...${(log.args.from as Address)?.slice(-4)}`,
            time: `Block ${log.blockNumber?.toString() || "-"}`,
            local: "Private transfer",
            usdc: "Encrypted amount"
          })),
          ...sentLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}-sent`,
            kind: "send" as const,
            title: `To ${(log.args.to as Address)?.slice(0, 6)}...${(log.args.to as Address)?.slice(-4)}`,
            time: `Block ${log.blockNumber?.toString() || "-"}`,
            local: "Private transfer",
            usdc: "Encrypted amount"
          })),
          ...myWrappedLogs.map((log) => ({
            id: `${log.transactionHash}-${log.logIndex}-wrap`,
            kind: "receive" as const,
            title: "Wrapped USDC",
            time: `Block ${log.blockNumber?.toString() || "-"}`,
            local: `₦${(Number(formatUnits((log.args.amount as bigint) || BigInt(0), 6)) * ngnPerUsdc).toLocaleString(undefined, {maximumFractionDigits: 2})}`,
            usdc: `${Number(formatUnits((log.args.amount as bigint) || BigInt(0), 6)).toFixed(4)} USDC`
          }))
        ];

        if (!cancelled && onchainTxs.length > 0) {
          setTxs((prev) => mergeTxRows(prev, onchainTxs));
        }
      } catch {
        // keep existing history if log read fails
      }
    }

    loadOnchainHistory();
    const intervalId = setInterval(loadOnchainHistory, 15_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [address, ngnPerUsdc, paymentTokenAddress, publicClient]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    async function refreshWalletBalances() {
      try {
        const [usdcRaw, ethRaw] = await Promise.all([getWalletUsdcBalance(), getWalletEthBalance()]);
        if (cancelled) return;
        setWalletUsdcBalance(formatUnits(usdcRaw, 6));
        setWalletEthBalance(formatEther(ethRaw));
      } catch {
        // best-effort refresh
      }
    }
    refreshWalletBalances();
    const intervalId = setInterval(refreshWalletBalances, 10_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [address, getWalletEthBalance, getWalletUsdcBalance]);

  useEffect(() => {
    let cancelled = false;
    async function refreshNgnRate() {
      try {
        const response = await fetch("/api/offramp/quote", {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({amountLocal: "1", currency: "NGN"})
        });
        if (!response.ok) return;
        const payload = await response.json();
        const rate = Number(payload?.rate);
        if (!cancelled && rate > 0) setNgnPerUsdc(rate);
      } catch {
        // keep last known rate
      }
    }
    refreshNgnRate();
    const intervalId = setInterval(refreshNgnRate, 10_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  function persistPrivateBalance(nextBalance: string) {
    setBalance(nextBalance);
    try {
      localStorage.setItem(PRIVATE_BALANCE_LAST_KEY, nextBalance);
      if (address) {
        localStorage.setItem(`${PRIVATE_BALANCE_CACHE_PREFIX}:${address.toLowerCase()}`, nextBalance);
      }
    } catch {
      // ignore storage failures
    }
  }

  async function syncPrivateBalance() {
    if (!balanceHandle) {
      toast.error("No private balance handle yet");
      return;
    }
    try {
      setSyncingPrivateBalance(true);
      const decrypted = await decryptHandle(BigInt(balanceHandle));
      if (decrypted !== null) {
        persistPrivateBalance(decrypted);
        toast.success("Private balance synced");
      } else {
        toast.error("Unable to sync private balance");
      }
    } finally {
      setSyncingPrivateBalance(false);
    }
  }

  useEffect(() => {
    if (!address) return;
    try {
      const cached = localStorage.getItem(`${PRIVATE_BALANCE_CACHE_PREFIX}:${address.toLowerCase()}`);
      if (cached) setBalance(cached);
    } catch {
      // ignore storage failures
    }
  }, [address]);

  function key(k: string) {
    if (k === "back") return setSendAmount((v) => v.slice(0, -1));
    if (k === "." && sendAmount.includes(".")) return;
    setSendAmount((v) => (v.length < 12 ? `${v}${k}` : v));
  }
  async function doSend() {
    try {
      if (sendCurrency === "USDC") await sendPrivate(sendRecipient as Address, sendAmount);
      else if (sendCurrency === "ETH") await sendEth(sendRecipient as Address, sendAmount);
      else await settleOfframpFromPrivateBalance(sendUsdcEq);
      if (balance !== null) {
        const deduction = Number(sendCurrency === "USDC" ? sendAmount || 0 : sendCurrency === "NGN" ? sendUsdcEq || 0 : 0);
        const next = Math.max(0, Number(balance) - deduction).toFixed(6);
        persistPrivateBalance(next);
      }
      const localValue =
        sendCurrency === "NGN"
          ? `₦${Number(sendAmount || 0).toLocaleString()}`
          : sendCurrency === "USDC"
            ? `₦${(Number(sendAmount || 0) * ngnPerUsdc).toLocaleString(undefined, {maximumFractionDigits: 2})}`
            : "Wallet transfer";
      const cryptoValue = sendCurrency === "ETH" ? `${sendUsdcEq} ETH` : `${sendUsdcEq} USDC`;
      setTxs((p) => [{id: `${Date.now()}`, kind: sendCurrency === "NGN" ? "bank" : "send", title: sendAcctName || sendRecipient || "Transfer", time: "Now", local: localValue, usdc: cryptoValue}, ...p]);
      setShowConfirm(false);
      setView("home");
      setTab("home");
      setSendAmount("");
      toast.success("Transaction submitted");
    } catch {
      toast.error("Send failed");
    }
  }
  async function doBank() {
    if (!bankQuote) return;
    try {
      setBusyBank(true);
      await initiateOfframpPayout({amountLocal: bankQuote.amountLocal, currency: bankQuote.currency, usdcAmount: bankQuote.usdcAmount, bankName, accountNumber: bankAcct, accountName: bankAcctName, wallet: address});
      await settleOfframpFromPrivateBalance(bankQuote.usdcAmount);
      if (balance !== null) {
        const next = Math.max(0, Number(balance) - Number(bankQuote.usdcAmount || 0)).toFixed(6);
        persistPrivateBalance(next);
      }
      setTxs((p) => [{id: `${Date.now()}`, kind: "bank", title: `${bankName} • ${bankAcct.slice(-4)}`, time: "Now", local: `${Number(bankQuote.amountLocal).toLocaleString()} ${bankQuote.currency}`, usdc: `${bankQuote.usdcAmount} USDC`}, ...p]);
      setBusyBank(false);
      setView("home");
      setTab("home");
      toast.success("Bank transfer initiated");
    } catch {
      setBusyBank(false);
      toast.error("Bank transfer failed");
    }
  }

  async function doWrap() {
    return doWrapAmount(wrapAmount, {closeModal: true});
  }

  async function doWrapAmount(amount: string, options?: {closeModal?: boolean}) {
    if (!amount || Number(amount) <= 0) {
      toast.error("Enter a valid USDC amount");
      return;
    }
    try {
      setWrapBusy(true);
      await wrapUsdc(amount);
      if (balance !== null) {
        const next = (Number(balance) + Number(amount || 0)).toFixed(6);
        persistPrivateBalance(next);
      } else if (Number(amount || 0) > 0) {
        persistPrivateBalance(Number(amount).toFixed(6));
      }
      toast.success(`Wrapped ${amount} USDC`);
      if (options?.closeModal) setShowAddMoney(false);
    } catch (e: any) {
      toast.error(e?.message || "Wrap failed");
    } finally {
      setWrapBusy(false);
    }
  }

  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    async function checkAndAutoWrap() {
      try {
        const rawBalance = await getWalletUsdcBalance();
        if (cancelled) return;
        const usdc = formatUnits(rawBalance, 6);
        setWalletUsdcBalance(usdc);
        if (Number(usdc) > 0) {
          setWrapAmount(usdc);
        }
        if (autoWrapBusy || Number(usdc) <= 0) return;
        if (usdc === lastAutoWrapAmount) return;

        setAutoWrapBusy(true);
        setLastAutoWrapAmount(usdc);
        await doWrapAmount(usdc, {closeModal: false});
      } catch {
        // best-effort balance polling
      } finally {
        if (!cancelled) setAutoWrapBusy(false);
      }
    }

    checkAndAutoWrap();
    const intervalId = setInterval(checkAndAutoWrap, 10_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [address, autoWrapBusy, getWalletUsdcBalance, lastAutoWrapAmount]);

  function handleStartOnboarding() {
    if (allowedInviteCodes.length === 0) {
      setView("welcome");
      return;
    }
    if (!allowedInviteCodes.includes(inviteCode.trim())) {
      toast.error("Invalid invite code");
      return;
    }
    setView("welcome");
  }

  if (view === "landing") return <Landing onStart={handleStartOnboarding} inviteCode={inviteCode} setInviteCode={setInviteCode} requireInvite={Boolean(requiredInviteCode)} />;

  if (["welcome", "signup", "verify", "profileSetup", "fund"].includes(view)) {
    return (
      <Onboard
        step={view}
        name={name}
        setName={setName}
        address={address}
        country={country}
        setCountry={setCountry}
        onEmail={() => login({loginMethods: ["email"] as any})}
        onGoogle={() => login({loginMethods: ["google"] as any})}
        onExisting={() => login()}
        next={(v: View) => setView(v)}
      />
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[390px] bg-[#0A0A0A] px-4 pb-28 pt-6 text-white">
      {(fiatMode !== "live" || cardMode !== "live") && (
        <div className="mb-3 rounded-xl border border-[#FF6B00]/40 bg-[#111111] px-3 py-2 text-[11px] text-[#FF8C3A]">
          Beta mode: local bank payouts and card events are simulated only.
        </div>
      )}
      {view === "home" && (
        <section className="space-y-4">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-2"><UserCircle2 className="text-[#FF6B00]" /><div><p className="text-xs text-[#A0A0A0]">Good morning, {name || "Friend"}</p><p className="text-xs text-[#A0A0A0]">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}</p></div></div>
            <div className="flex items-center gap-2 text-[#A0A0A0]"><button onClick={() => setView("notifications")}><Bell size={18} /></button><button onClick={() => setView("profile")}><Settings size={18} /></button><button className="rounded-md border border-[#1F1F1F] px-2 py-1 text-[11px] text-[#FF8C3A]" onClick={() => { disconnect(); logout(); setView("landing"); }}>Sign out</button></div>
          </header>
          <motion.div className="rounded-2xl border border-[#1F1F1F] bg-[#111111] p-4" animate={balanceVisible ? {boxShadow: "0 0 26px rgba(255,107,0,.22)"} : {boxShadow: "0 0 0 rgba(0,0,0,0)"}}>
            <p className="text-xs text-[#A0A0A0]">Private Balance (Encrypted)</p><div className="mt-1 flex items-center justify-between"><p className="text-3xl font-semibold text-white">{balanceVisible ? (balance ?? "0.000000") : "••••••"} {balanceVisible ? "USDC" : ""}</p><button className="text-[#FF6B00]" onClick={() => setBalanceVisible((v) => !v)}><Eye size={18} /></button></div><p className="mt-1 text-xs text-[#A0A0A0]">≈ ₦{balanceVisible && balance !== null ? (Number(balance) * ngnPerUsdc).toLocaleString(undefined, {maximumFractionDigits: 2}) : "..."}</p>
            <button className="mt-2 rounded-md border border-[#FF6B00] px-2 py-1 text-[11px] text-[#FF8C3A] disabled:opacity-50" onClick={syncPrivateBalance} disabled={syncingPrivateBalance}>{syncingPrivateBalance ? "Syncing..." : "Sync Private Balance"}</button>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-2">
                <p className="text-[#A0A0A0]">Public Wallet USDC</p>
                <p className="text-white">{Number(walletUsdcBalance).toFixed(4)} USDC</p>
              </div>
              <div className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-2">
                <p className="text-[#A0A0A0]">Wallet ETH</p>
                <p className="text-white">{Number(walletEthBalance).toFixed(6)} ETH</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2"><button className="flex-1 rounded-xl border border-white/30 py-2 text-xs" onClick={() => setShowAddMoney(true)}>Add USDC</button><button className="flex-1 rounded-xl border border-white/30 py-2 text-xs" onClick={() => { setSendCurrency("USDC"); setView("send"); }}>Send to Wallet</button></div>
          </motion.div>
          <div className="grid grid-cols-4 gap-2">{[{k: "Send", i: ArrowUpRight, v: "send"}, {k: "Receive", i: ArrowDownLeft, v: "receive"}, {k: "Card", i: CreditCard, v: "card"}, {k: "History", i: Clock3, v: "history"}].map((a) => { const I = a.i; return <button key={a.k} className="rounded-xl border border-[#1F1F1F] bg-[#111111] py-3" onClick={() => { setView(a.v as View); if (["card", "history"].includes(a.v)) setTab(a.v as Tab); }}><I className="mx-auto mb-1 text-[#FF6B00]" size={16} /><p className="text-xs">{a.k}</p></button>; })}</div>
          <div><div className="mb-2 flex items-center justify-between"><p className="text-sm">Recent</p><button className="text-xs text-[#FF6B00]" onClick={() => { setView("history"); setTab("history"); }}>See all</button></div><div className="space-y-2">{txs.slice(0, 3).map((t) => <TxCard key={t.id} t={t} />)}</div></div>
        </section>
      )}

      {view === "send" && <SendScreen back={() => setView("home")} sendCurrency={sendCurrency} setSendCurrency={setSendCurrency} sendRecipient={sendRecipient} setSendRecipient={setSendRecipient} sendAmount={sendAmount} sendBank={sendBank} setSendBank={setSendBank} sendAcct={sendAcct} setSendAcct={setSendAcct} sendAcctName={sendAcctName} setSendAcctName={setSendAcctName} sendNote={sendNote} setSendNote={setSendNote} keypad={keypad} onKey={key} sendUsdcEq={sendUsdcEq} onOpenConfirm={() => setShowConfirm(true)} />}
      {view === "receive" && <ReceiveNairaScreen back={() => setView("home")} />}
      {view === "bank" && <BankScreen back={() => setView("home")} bankAmount={bankAmount} setBankAmount={setBankAmount} bankCurrency={bankCurrency} setBankCurrency={setBankCurrency} bankName={bankName} setBankName={setBankName} bankAcct={bankAcct} setBankAcct={setBankAcct} bankAcctName={bankAcctName} setBankAcctName={setBankAcctName} bankQuote={bankQuote} busyBank={busyBank} submit={doBank} fiatMode={fiatMode} />}
      {view === "card" && <CardScreen freeze={freeze} setFreeze={setFreeze} showCard={showCard} setShowCard={setShowCard} />}
      {view === "history" && <HistoryScreen filter={filter} setFilter={setFilter} search={search} setSearch={setSearch} history={history} walletUsdcBalance={walletUsdcBalance} walletEthBalance={walletEthBalance} />}
      {view === "notifications" && <NotificationsScreen back={() => setView("home")} />}
      {view === "profile" && <ProfileScreen name={name} address={address} fiatMode={fiatMode} cardMode={cardMode} onDisconnect={() => { disconnect(); logout(); }} />}

      {["home", "card", "history", "profile"].includes(view) && (
        <nav className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-[390px] border-t border-[#1F1F1F] bg-[#111111] px-2 py-2">
          <div className="grid grid-cols-4 gap-1">{[{k: "home", i: Home}, {k: "card", i: CreditCard}, {k: "history", i: Clock3}, {k: "profile", i: UserCircle2}].map((n) => { const I = n.i; const active = tab === n.k; return <button key={n.k} className="relative py-2 text-xs" onClick={() => { setTab(n.k as Tab); setView(n.k as View); }}><I className={`mx-auto ${active ? "text-[#FF6B00]" : "text-[#A0A0A0]"}`} size={16} /><p className={active ? "text-[#FF6B00]" : "text-[#A0A0A0]"}>{n.k[0].toUpperCase() + n.k.slice(1)}</p>{active && <span className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#FF6B00]" />}</button>; })}</div>
        </nav>
      )}

      <AnimatePresence>
        {showConfirm && <ConfirmSheet sendCurrency={sendCurrency} sendAmount={sendAmount} sendRecipient={sendRecipient} sendUsdcEq={sendUsdcEq} onClose={() => setShowConfirm(false)} onConfirm={doSend} />}
      </AnimatePresence>
      <AnimatePresence>
        {showAddMoney && (
          <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 bg-black/60 p-4">
            <motion.div initial={{y: 60}} animate={{y: 0}} exit={{y: 60}} className="mx-auto mt-20 w-full max-w-[390px] rounded-2xl border border-[#1F1F1F] bg-[#111111] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Add USDC</p>
                <button className="text-xs text-[#A0A0A0]" onClick={() => setShowAddMoney(false)}>Close</button>
              </div>

              <p className="text-xs text-[#A0A0A0]">Deposit address</p>
              <div className="mt-1 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-3 text-xs">
                {address || "Connect wallet to view address"}
                {address && (
                  <button
                    className="ml-2 text-[#FF6B00]"
                    onClick={async () => {
                      await navigator.clipboard.writeText(address);
                      toast.success("Address copied");
                    }}
                  >
                    <Copy size={12} className="inline" />
                  </button>
                )}
              </div>

              {address && (
                <div className="mt-3 flex justify-center rounded-xl border border-[#1F1F1F] bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt="Deposit QR"
                    className="h-32 w-32 rounded-md"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(address)}`}
                  />
                </div>
              )}

              <p className="mt-3 text-xs text-[#A0A0A0]">USDC amount to wrap privately</p>
              <input
                className="mt-1 w-full rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 text-sm outline-none"
                value={wrapAmount}
                onChange={(e) => setWrapAmount(e.target.value)}
                placeholder="e.g. 25"
              />
              <div className="mt-2 flex items-center justify-between text-xs">
                <p className="text-[#A0A0A0]">Wallet USDC: {Number(walletUsdcBalance).toFixed(6)}</p>
                <p className="text-[#FF8C3A]">Auto-wrap active</p>
              </div>
              <p className="mt-1 text-[11px] text-[#FF8C3A]">
                Incoming USDC is checked every 10s and wrapped automatically.
              </p>
              <p className="mt-2 text-xs text-[#A0A0A0]">Send USDC on Base Sepolia to your wallet, then wrap here.</p>

              <button className="mt-4 w-full rounded-xl bg-[#FF6B00] py-3 text-sm font-semibold disabled:opacity-50" onClick={doWrap} disabled={!address || wrapBusy || autoWrapBusy}>
                {wrapBusy || autoWrapBusy ? "Wrapping..." : `Wrap ${wrapAmount || 0} USDC`}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function Landing({
  onStart,
  inviteCode,
  setInviteCode,
  requireInvite
}: {
  onStart: () => void;
  inviteCode: string;
  setInviteCode: (value: string) => void;
  requireInvite: boolean;
}) {
  const [ngnRate, setNgnRate] = useState<number>(1353.36);
  const [kesRate, setKesRate] = useState<number>(128.98);

  useEffect(() => {
    let mounted = true;

    async function refreshRates() {
      try {
        const [ngnRes, kesRes] = await Promise.all([
          fetch("/api/offramp/quote", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({amountLocal: "1", currency: "NGN"})
          }),
          fetch("/api/offramp/quote", {
            method: "POST",
            headers: {"content-type": "application/json"},
            body: JSON.stringify({amountLocal: "1", currency: "KES"})
          })
        ]);

        if (!ngnRes.ok || !kesRes.ok) return;
        const ngnJson = await ngnRes.json();
        const kesJson = await kesRes.json();

        const nextNgn = Number(ngnJson?.rate);
        const nextKes = Number(kesJson?.rate);
        if (!mounted) return;
        if (nextNgn > 0) setNgnRate(nextNgn);
        if (nextKes > 0) setKesRate(nextKes);
      } catch {
        // keep last known value
      }
    }

    refreshRates();
    const intervalId = setInterval(refreshRates, 10_000);
    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-white">
      <section className="relative overflow-hidden px-5 pb-12 pt-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_15%,rgba(255,107,0,0.28),transparent_45%)]" />
        <div className="absolute -right-16 top-8 h-44 w-44 rounded-full bg-[#FF6B00]/10 blur-3xl" />
        <div className="relative mx-auto w-full max-w-[390px]">
          <p className="mb-5 inline-flex rounded-full border border-[#FF6B00]/30 bg-[#111111] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[#FF8C3A]">
            Confidential Payments
          </p>

          <h1 className="font-[var(--font-display)] text-[42px] font-semibold leading-[1.03] tracking-[-0.03em]">
            Your dollars.
            <br />
            <span className="bg-gradient-to-r from-white to-[#FF8C3A] bg-clip-text text-transparent">Your privacy.</span>
            <br />
            Spend anywhere.
          </h1>

          <p className="mt-5 max-w-[34ch] text-sm leading-relaxed text-[#B5B5B5]">
            Hold USDC privately, spend in local currency instantly. No conversion stress. No balance exposure.
          </p>

          <div className="mt-7 flex gap-3">
            <button className="flex-1 rounded-xl bg-[#FF6B00] px-4 py-3 text-sm font-semibold shadow-[0_8px_30px_rgba(255,107,0,0.35)]" onClick={onStart}>
              Get Started
            </button>
            <button className="flex-1 rounded-xl border border-white/25 bg-white/[0.02] px-4 py-3 text-sm text-white">
              Learn More
            </button>
          </div>
          {requireInvite && (
            <div className="mt-3 rounded-2xl border border-[#1F1F1F] bg-[#111111]/80 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#8D8D8D]">Private Beta Invite</p>
              <input
                className="mt-2 w-full rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 text-sm text-white outline-none focus:border-[#FF6B00]"
                placeholder="Enter invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>
          )}

          <div className="mt-7 rounded-2xl border border-[#1F1F1F] bg-[#111111]/70 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-[#8D8D8D]">Live examples</p>
            <div className="space-y-1 text-xs text-[#A0A0A0]">
              <motion.p animate={{opacity: [0.25, 1, 0.25]}} transition={{repeat: Infinity, duration: 4}}>
                {ngnRate.toLocaleString(undefined, {maximumFractionDigits: 2})} NGN = 1 USDC
              </motion.p>
              <motion.p animate={{opacity: [1, 0.25, 1]}} transition={{repeat: Infinity, duration: 5}}>
                {kesRate.toLocaleString(undefined, {maximumFractionDigits: 2})} KES = 1 USDC
              </motion.p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[390px] gap-3 px-5 pb-10">
        {[
          {i: Lock, t: "Hold USDC privately", b: "Your balance is encrypted. Nobody sees what you hold."},
          {i: Shield, t: "Spend in local currency", b: "Type ₦5,000 or KES 2,000. We handle the rest."},
          {i: CreditCard, t: "Instant settlement", b: "Bank transfer or card spend. No manual conversion ever."}
        ].map((x) => {
          const I = x.i;
          return (
            <div key={x.t} className="rounded-2xl border border-[#1F1F1F] bg-[#111111] p-4">
              <I className="mb-2 text-[#FF6B00]" size={18} />
              <p className="text-sm font-medium">{x.t}</p>
              <p className="mt-1 text-xs text-[#A0A0A0]">{x.b}</p>
            </div>
          );
        })}
      </section>
    </main>
  );
}

function Onboard({
  step,
  name,
  setName,
  address,
  country,
  setCountry,
  next,
  onEmail,
  onGoogle,
  onExisting
}: any) {
  return <main className="mx-auto min-h-screen w-full max-w-[390px] bg-[#0A0A0A] px-5 pb-10 pt-8 text-white">{step !== "welcome" && <button className="mb-5 text-[#A0A0A0]" onClick={() => next("welcome")}><ArrowLeft size={18} /></button>}{step === "welcome" && <div className="pt-16 text-center"><div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-[#FF6B00]"><Lock className="text-white" /></div><p className="text-xl font-semibold">Private money for the real world</p><button className="mt-10 w-full rounded-xl bg-[#FF6B00] py-3 font-semibold" onClick={() => next("signup")}>Get Started</button><button className="mt-3 text-sm text-[#A0A0A0]" onClick={onExisting}>I already have an account</button></div>}{step === "signup" && <div><p className="text-2xl font-semibold">Create your account</p><div className="mt-6 space-y-3"><button className="w-full rounded-xl bg-[#FF6B00] py-3 text-sm font-semibold" onClick={onEmail}>Continue with Email</button><button className="w-full rounded-xl border border-[#FF6B00] py-3 text-sm text-[#FF6B00]" onClick={onGoogle}>Continue with Google</button></div><p className="mt-4 text-xs text-[#A0A0A0]">Privy handles email verification and embedded wallet creation.</p></div>}{step === "profileSetup" && <div><p className="text-2xl font-semibold">Set up profile</p><input className="mt-4 w-full rounded-xl border border-[#1F1F1F] bg-[#111111] px-3 py-3 text-sm outline-none" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} /><select className="mt-3 w-full rounded-xl border border-[#1F1F1F] bg-[#111111] px-3 py-3 text-sm outline-none" value={country} onChange={(e) => setCountry(e.target.value)}><option>Nigeria</option><option>Ghana</option><option>Kenya</option></select><button className="mt-8 w-full rounded-xl bg-[#FF6B00] py-3 font-semibold" onClick={() => next("fund")}>Continue</button></div>}{step === "fund" && <div><p className="text-2xl font-semibold">Add USDC to get started</p><div className="mt-5 rounded-xl border border-[#1F1F1F] bg-[#111111] p-3 text-xs">{address ? <>{address} <button className="ml-1 text-[#FF6B00]" onClick={async () => { await navigator.clipboard.writeText(address); toast.success("Address copied"); }}><Copy className="inline text-[#FF6B00]" size={12} /></button></> : "Connect wallet to view address"}</div><p className="mt-3 text-sm text-[#A0A0A0]">Send USDC on Base network to this address</p><button className="mt-3 text-sm text-[#A0A0A0]" onClick={() => next("home")}>I&apos;ll do this later</button><button className="mt-8 w-full rounded-xl bg-[#FF6B00] py-3 font-semibold" onClick={() => next("home")}>Done</button></div>}</main>;
}

function SendScreen(props: any) {
  return <section className="space-y-4"><header className="flex items-center justify-between"><button className="text-[#A0A0A0]" onClick={props.back}><ArrowLeft /></button><p className="text-sm">Send Money</p><button className="rounded-lg border border-[#FF6B00] px-2 py-1 text-xs text-[#FF6B00]" onClick={() => props.setSendCurrency((c: any) => (c === "NGN" ? "USDC" : c === "USDC" ? "ETH" : "NGN"))}>{props.sendCurrency}</button></header><input className="w-full rounded-xl border border-[#1F1F1F] bg-[#111111] px-3 py-3 text-sm outline-none" placeholder={props.sendCurrency === "NGN" ? "Name, account number, or address" : "Recipient wallet address (0x...)"} value={props.sendRecipient} onChange={(e) => props.setSendRecipient(e.target.value)} /><div className="rounded-2xl border border-[#1F1F1F] bg-[#111111] p-4 text-center"><p className="text-xs text-[#A0A0A0]">{props.sendCurrency === "NGN" ? "₦" : props.sendCurrency === "ETH" ? "Ξ" : "$"}</p><p className="text-4xl font-semibold">{props.sendAmount || "0"}</p><p className="text-xs text-[#A0A0A0]">{props.sendCurrency === "ETH" ? `${props.sendUsdcEq} ETH` : `≈ ${props.sendUsdcEq} USDC`}</p></div>{props.sendCurrency === "NGN" && <div className="space-y-2"><input className="w-full rounded-xl border border-[#1F1F1F] bg-[#111111] px-3 py-2 text-sm outline-none" placeholder="Bank" value={props.sendBank} onChange={(e) => props.setSendBank(e.target.value)} /><input className="w-full rounded-xl border border-[#1F1F1F] bg-[#111111] px-3 py-2 text-sm outline-none" placeholder="Account number" value={props.sendAcct} onChange={(e) => props.setSendAcct(e.target.value)} /><input className="w-full rounded-xl border border-[#1F1F1F] bg-[#111111] px-3 py-2 text-sm outline-none" placeholder="Account name" value={props.sendAcctName} onChange={(e) => props.setSendAcctName(e.target.value)} /></div>}<input className="w-full rounded-xl border border-[#1F1F1F] bg-[#111111] px-3 py-2 text-sm outline-none" placeholder="Add a note" value={props.sendNote} onChange={(e) => props.setSendNote(e.target.value)} /><div className="grid grid-cols-3 gap-2">{props.keypad.map((k: string) => <button key={k} className="rounded-xl border border-[#1F1F1F] bg-[#111111] py-3 text-lg active:bg-[#FF6B00]" onClick={() => props.onKey(k)}>{k === "back" ? "⌫" : k}</button>)}</div><button className="w-full rounded-xl bg-[#FF6B00] py-3 font-semibold" onClick={props.onOpenConfirm}>Send Privately</button></section>;
}

function ReceiveNairaScreen({back}: {back: () => void}) {
  const bankName = "Providus Bank";
  const accountNumber = "9130027816";
  const accountName = "Payra User Settlement";
  const reference = "PAYRA-NGN-VA";

  async function copyText(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <button className="text-[#A0A0A0]" onClick={back}><ArrowLeft /></button>
        <p className="text-sm">Receive Naira</p>
        <div className="w-6" />
      </header>
      <div className="rounded-2xl border border-[#1F1F1F] bg-[#111111] p-4">
        <p className="text-xs text-[#A0A0A0]">Transfer Naira to this account</p>
        <div className="mt-3 space-y-2 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-3 text-sm">
          <div className="flex items-center justify-between">
            <p className="text-[#A0A0A0]">Bank</p>
            <button className="text-[#FF6B00] text-xs" onClick={() => copyText("Bank", bankName)}>Copy</button>
          </div>
          <p>{bankName}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[#A0A0A0]">Account number</p>
            <button className="text-[#FF6B00] text-xs" onClick={() => copyText("Account number", accountNumber)}>Copy</button>
          </div>
          <p className="text-base font-semibold">{accountNumber}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[#A0A0A0]">Account name</p>
            <button className="text-[#FF6B00] text-xs" onClick={() => copyText("Account name", accountName)}>Copy</button>
          </div>
          <p>{accountName}</p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[#A0A0A0]">Reference</p>
            <button className="text-[#FF6B00] text-xs" onClick={() => copyText("Reference", reference)}>Copy</button>
          </div>
          <p>{reference}</p>
        </div>
        <p className="mt-3 text-xs text-[#A0A0A0]">
          Incoming NGN transfers are credited and converted to USDC once settlement is confirmed.
        </p>
      </div>
      <button
        className="w-full rounded-xl border border-[#FF6B00] py-3 text-sm text-[#FF6B00]"
        onClick={() => copyText("All receive details", `Bank: ${bankName}\nAccount Number: ${accountNumber}\nAccount Name: ${accountName}\nReference: ${reference}`)}
      >
        Copy all details
      </button>
    </section>
  );
}

function BankScreen(props: any) {
  return <section className="space-y-3"><header className="flex items-center justify-between"><button className="text-[#A0A0A0]" onClick={props.back}><ArrowLeft /></button><p className="text-sm">Bank Transfer</p><div className="w-6" /></header><div className="rounded-2xl border border-[#1F1F1F] bg-[#111111] p-4"><div className="grid grid-cols-[1fr,110px] gap-2"><input className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 text-sm outline-none" placeholder="Amount" value={props.bankAmount} onChange={(e) => props.setBankAmount(e.target.value)} /><select className="rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 text-sm outline-none" value={props.bankCurrency} onChange={(e) => props.setBankCurrency(e.target.value)}><option>NGN</option><option>GHS</option><option>KES</option></select></div><input className="mt-2 w-full rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 text-sm outline-none" placeholder="Bank name" value={props.bankName} onChange={(e) => props.setBankName(e.target.value)} /><input className="mt-2 w-full rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 text-sm outline-none" placeholder="Account number" value={props.bankAcct} onChange={(e) => props.setBankAcct(e.target.value)} /><input className="mt-2 w-full rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] px-3 py-2 text-sm outline-none" placeholder="Account name" value={props.bankAcctName} onChange={(e) => props.setBankAcctName(e.target.value)} /><div className="mt-3 rounded-xl border border-[#1F1F1F] bg-[#0A0A0A] p-3">{props.bankQuote ? <><p className="text-sm">Send {Number(props.bankQuote.amountLocal).toLocaleString()} {props.bankQuote.currency}</p><p className="text-xs text-[#A0A0A0]">≈ {Number(props.bankQuote.usdcAmount).toFixed(4)} USDC • Fee {props.bankQuote.feeLocal.toLocaleString()} {props.bankQuote.currency}</p></> : <p className="text-xs text-[#A0A0A0]">Enter amount to get quote</p>}</div>{props.fiatMode !== "live" && <p className="mt-2 text-xs text-[#FF8C3A]">Beta: payout is simulated and no real bank settlement is executed.</p>}<button className="mt-3 w-full rounded-xl bg-[#FF6B00] py-3 font-semibold disabled:opacity-50" onClick={props.submit} disabled={!props.bankQuote || props.busyBank}>{props.busyBank ? "Processing..." : `Send ${props.bankAmount || 0} ${props.bankCurrency}`}</button></div></section>;
}

function CardScreen({freeze, setFreeze, showCard, setShowCard}: any) {
  return <section className="space-y-3"><div className="rounded-2xl border border-[#1F1F1F] bg-gradient-to-br from-black to-[#171717] p-5"><p className="text-xs text-[#A0A0A0]">Virtual Card</p><p className="mt-4 font-mono text-xl">{showCard ? "4242 4242 4242 4821" : "**** **** **** 4821"}</p><p className="mt-2 text-sm">Oluwatoyosi A.</p><p className="text-xs text-[#A0A0A0]">12/29</p><p className="mt-4 text-right text-xs">VISA</p></div><button className="w-full rounded-xl border border-[#FF6B00] py-3 text-sm text-[#FF6B00]" onClick={() => setShowCard((v: boolean) => !v)}>Reveal Details</button><button className="w-full rounded-xl border border-white/30 py-3 text-sm" onClick={() => setFreeze((v: boolean) => !v)}>{freeze ? "Unfreeze Card" : "Freeze Card"}</button><div className="rounded-xl border border-[#1F1F1F] bg-[#111111] p-4"><p className="text-sm">This month</p><p className="text-xl">₦158,230</p><div className="mt-2 h-2 rounded-full bg-[#1F1F1F]"><div className="h-2 w-2/3 rounded-full bg-[#FF6B00]" /></div></div></section>;
}

function HistoryScreen({filter, setFilter, search, setSearch, history, walletUsdcBalance, walletEthBalance}: any) {
  return <section className="space-y-3"><p className="text-xl font-semibold">History</p><div className="grid grid-cols-2 gap-2 rounded-xl border border-[#1F1F1F] bg-[#111111] p-2 text-xs"><div className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-2"><p className="text-[#A0A0A0]">Wallet USDC</p><p>{Number(walletUsdcBalance || 0).toFixed(4)} USDC</p></div><div className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-2"><p className="text-[#A0A0A0]">Wallet ETH</p><p>{Number(walletEthBalance || 0).toFixed(6)} ETH</p></div></div><div className="flex gap-3 text-sm">{[["all", "All"], ["send", "Send"], ["receive", "Receive"], ["card", "Card"]].map(([k, l]) => <button key={k} className={`border-b-2 pb-1 ${filter === k ? "border-[#FF6B00] text-[#FF6B00]" : "border-transparent text-[#A0A0A0]"}`} onClick={() => setFilter(k)}>{l}</button>)}</div><div className="flex items-center gap-2 rounded-xl border border-[#1F1F1F] bg-[#111111] px-3 py-2"><Search size={16} className="text-[#A0A0A0]" /><input className="w-full bg-transparent text-sm outline-none" placeholder="Search transactions" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="space-y-2">{history.map((t: Tx) => <div key={t.id} className="flex w-full items-center justify-between rounded-xl border border-[#1F1F1F] bg-[#111111] p-3 text-left"><div className="flex items-center gap-2">{t.kind === "send" || t.kind === "bank" ? <ArrowUpRight className="text-[#FF6B00]" size={16} /> : t.kind === "receive" ? <ArrowDownLeft className="text-white" size={16} /> : <CreditCard className="text-[#FF6B00]" size={16} />}<div><p className="text-sm">{t.title}</p><p className="text-xs text-[#A0A0A0]">{t.time}</p></div></div><div className="text-right"><p className="text-sm">{t.local}</p><p className="text-xs text-[#A0A0A0]">{t.usdc}</p></div></div>)}</div></section>;
}

function NotificationsScreen({back}: {back: () => void}) {
  return <section className="space-y-3"><header className="flex items-center justify-between"><button className="text-[#A0A0A0]" onClick={back}><ArrowLeft /></button><p>Notifications</p><button className="text-xs text-[#FF6B00]">Mark all read</button></header>{[["payment received", true], ["card spend", false], ["security alert", false]].map(([t, u], i) => <div key={i} className={`rounded-xl border bg-[#111111] p-3 ${u ? "border-l-2 border-l-[#FF6B00] border-[#1F1F1F]" : "border-[#1F1F1F]"}`}><p className="text-sm capitalize">{t as string}</p><p className="text-xs text-[#A0A0A0]">2h ago</p></div>)}</section>;
}

function ProfileScreen({name, address, fiatMode, cardMode, onDisconnect}: any) {
  return <section className="space-y-3"><div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full border-2 border-[#FF6B00] bg-[#111111]"><UserCircle2 /></div><p className="mt-2">{name || "Set your name"}</p><p className="text-xs text-[#A0A0A0]">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "wallet not connected"}</p></div><div className="rounded-xl border border-[#1F1F1F] bg-[#111111] p-3"><p className="mb-2 text-sm font-medium">Environment Mode</p><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-2"><p className="text-[#A0A0A0]">Fiat payouts</p><p className={fiatMode === "live" ? "text-white" : "text-[#FF8C3A]"}>{String(fiatMode || "beta").toUpperCase()}</p></div><div className="rounded-lg border border-[#1F1F1F] bg-[#0A0A0A] p-2"><p className="text-[#A0A0A0]">Card webhooks</p><p className={cardMode === "live" ? "text-white" : "text-[#FF8C3A]"}>{String(cardMode || "beta").toUpperCase()}</p></div></div>{(fiatMode !== "live" || cardMode !== "live") && <p className="mt-2 text-xs text-[#FF8C3A]">Beta mode enabled: payouts and card events are simulated.</p>}</div>{[["Account", ["Edit Profile", "Change Currency", "Linked Bank Accounts", "KYC Status: Verified"]], ["Card", ["Virtual Card Details", "Order Physical Card", "Card Limits", "Freeze / Unfreeze"]], ["Security", ["Change PIN", "Biometric Login", "Connected Wallets", "Active Sessions"]], ["Privacy", ["Balance Visibility", "Transaction Visibility", "Your balances are always encrypted onchain"]], ["Support", ["Help Center", "Contact Support", "Join Discord"]]].map(([title, items]) => <div key={title as string} className="rounded-xl border border-[#1F1F1F] bg-[#111111] p-3"><p className="mb-2 text-sm font-medium">{title as string}</p>{(items as string[]).map((item) => <p key={item} className={`py-1 text-sm ${item.includes("encrypted") ? "text-[#FF8C3A]" : "text-[#A0A0A0]"}`}>{item}</p>)}</div>)}<button className="w-full rounded-xl border border-[#FF6B00] py-3 text-[#FF6B00]" onClick={onDisconnect}>Disconnect Wallet</button></section>;
}

function TxCard({t}: {t: Tx}) {
  return <div className="flex items-center justify-between rounded-xl border border-[#1F1F1F] bg-[#111111] p-3"><div className="flex items-center gap-2">{t.kind === "send" || t.kind === "bank" ? <ArrowUpRight className="text-[#FF6B00]" size={15} /> : <ArrowDownLeft className="text-white" size={15} />}<div><p className="text-sm">{t.title}</p><p className="text-xs text-[#A0A0A0]">{t.time}</p></div></div><div className="text-right"><p className="text-sm">{t.local}</p><p className="text-xs text-[#A0A0A0]">{t.usdc}</p></div></div>;
}

function ConfirmSheet({sendCurrency, sendAmount, sendRecipient, sendUsdcEq, onClose, onConfirm}: any) {
  return <motion.div initial={{opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} className="fixed inset-0 z-50 bg-black/60 p-4"><motion.div initial={{y: 50}} animate={{y: 0}} exit={{y: 50}} className="mx-auto mt-24 w-full max-w-[390px] rounded-2xl border border-[#1F1F1F] bg-[#111111] p-4"><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[#FF6B00]"><Check className="text-white" size={16} /></div><p className="text-center text-sm font-medium">Confirm transfer</p><div className="mt-3 space-y-1 text-xs text-[#A0A0A0]"><p>Recipient: {sendRecipient || "N/A"}</p><p>Amount: {sendCurrency === "NGN" ? `₦${Number(sendAmount || 0).toLocaleString()}` : sendCurrency === "ETH" ? `${sendAmount} ETH` : `${sendAmount} USDC`}</p><p>Equivalent: {sendCurrency === "ETH" ? `${sendUsdcEq} ETH` : `${sendUsdcEq} USDC`}</p><p>Arrival: instant - 5 mins</p></div><p className="mt-3 text-xs text-[#FF8C3A]">Amount encrypted. Only you and the recipient can see this.</p><div className="mt-4 flex gap-2"><button className="flex-1 rounded-xl border border-white/30 py-2 text-sm" onClick={onClose}>Cancel</button><button className="flex-1 rounded-xl bg-[#FF6B00] py-2 text-sm font-semibold" onClick={onConfirm}>Confirm</button></div></motion.div></motion.div>;
}
