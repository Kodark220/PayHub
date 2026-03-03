"use client";

import {useCallback, useMemo} from "react";
import {Lightning} from "@inco/js/lite";
import {handleTypes} from "@inco/js";
import {formatUnits, pad, parseEther, parseUnits, toHex, type Address} from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWalletClient,
  useWriteContract
} from "wagmi";
import confPaymentsAbi from "@/abi/confToken.json";

const PAYMENT_TOKEN_ADDRESS =
  (process.env.NEXT_PUBLIC_CONFPAYMENTS_ADDRESS ||
    process.env.NEXT_PUBLIC_CONFLOTTERY_ADDRESS) as Address | undefined;
const OFFRAMP_SETTLEMENT_ADDRESS = process.env.NEXT_PUBLIC_OFFRAMP_SETTLEMENT_ADDRESS as Address | undefined;
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const FIAT_MODE = (process.env.NEXT_PUBLIC_FIAT_MODE || "beta").toLowerCase();
const CARD_MODE = (process.env.NEXT_PUBLIC_CARD_MODE || "beta").toLowerCase();

const getFeeAbi = [
  {
    type: "function" as const,
    inputs: [],
    name: "getFee",
    outputs: [{name: "", internalType: "uint256", type: "uint256"}],
    stateMutability: "pure" as const
  }
];

let lightningInstance: Lightning | null = null;

async function getLightning() {
  if (!lightningInstance) {
    lightningInstance = await Lightning.latest("testnet", 84532);
  }
  return lightningInstance;
}

export function useConfPayments() {
  const {address} = useAccount();
  const publicClient = usePublicClient();
  const {data: walletClient} = useWalletClient();
  const {writeContractAsync} = useWriteContract();

  const {data: balanceHandle, refetch: refetchBalance} = useReadContract({
    abi: confPaymentsAbi,
    address: PAYMENT_TOKEN_ADDRESS,
    functionName: "balanceOf",
    args: address && PAYMENT_TOKEN_ADDRESS ? [address] : undefined,
    query: {enabled: Boolean(address && PAYMENT_TOKEN_ADDRESS)}
  });

  const ready = Boolean(address && PAYMENT_TOKEN_ADDRESS && publicClient);

  const getIncoFee = useCallback(async () => {
    if (!publicClient) throw new Error("No public client");
    const lightning = await getLightning();
    const fee = (await publicClient.readContract({
      address: lightning.executorAddress as Address,
      abi: getFeeAbi,
      functionName: "getFee"
    })) as bigint;
    return fee;
  }, [publicClient]);

  const decryptHandle = useCallback(
    async (handle: bigint) => {
      if (!walletClient) return null;
      try {
        const lightning = await getLightning();
        const formattedHandle = pad(toHex(handle), {size: 32});
        const [result] = await lightning.attestedDecrypt(walletClient, [formattedHandle]);
        return formatUnits(BigInt(result.plaintext.value as bigint | number), 6);
      } catch {
        // Decryption may fail transiently if attestation/session is not ready yet.
        return null;
      }
    },
    [walletClient]
  );

  const encryptAmount = useCallback(
    async (amount: string, dappAddress: Address) => {
      if (!address) throw new Error("Connect wallet first.");
      const lightning = await getLightning();
      const normalized = parseUnits(amount || "0", 6);
      return lightning.encrypt(normalized, {
        accountAddress: address,
        dappAddress,
        handleType: handleTypes.euint256
      });
    },
    [address]
  );

  const wrapUsdc = useCallback(
    async (amount: string) => {
      if (!ready || !PAYMENT_TOKEN_ADDRESS) throw new Error("Missing app config");
      const value = parseUnits(amount || "0", 6);
      const hash = await writeContractAsync({
        abi: [
          {
            type: "function",
            name: "approve",
            inputs: [
              {name: "spender", type: "address"},
              {name: "value", type: "uint256"}
            ],
            outputs: [{name: "", type: "bool"}],
            stateMutability: "nonpayable"
          }
        ],
        address: USDC_ADDRESS,
        functionName: "approve",
        args: [PAYMENT_TOKEN_ADDRESS, value]
      });
      await publicClient?.waitForTransactionReceipt({hash});

      const wrapHash = await writeContractAsync({
        abi: confPaymentsAbi,
        address: PAYMENT_TOKEN_ADDRESS,
        functionName: "wrapUSDC",
        args: [value]
      });
      await publicClient?.waitForTransactionReceipt({hash: wrapHash});
      await refetchBalance();
      return wrapHash;
    },
    [publicClient, ready, refetchBalance, writeContractAsync]
  );

  const getWalletUsdcBalance = useCallback(async () => {
    if (!publicClient || !address) return BigInt(0);
    const balance = (await publicClient.readContract({
      abi: [
        {
          type: "function",
          name: "balanceOf",
          inputs: [{name: "owner", type: "address"}],
          outputs: [{name: "", type: "uint256"}],
          stateMutability: "view"
        }
      ],
      address: USDC_ADDRESS,
      functionName: "balanceOf",
      args: [address]
    })) as bigint;
    return balance;
  }, [address, publicClient]);

  const getWalletEthBalance = useCallback(async () => {
    if (!publicClient || !address) return BigInt(0);
    return publicClient.getBalance({address});
  }, [address, publicClient]);

  const sendPrivate = useCallback(
    async (recipient: Address, amount: string) => {
      if (!ready || !PAYMENT_TOKEN_ADDRESS) throw new Error("Missing app config");
      const encrypted = await encryptAmount(amount, PAYMENT_TOKEN_ADDRESS);
      const fee = await getIncoFee();
      const hash = await writeContractAsync({
        abi: confPaymentsAbi,
        address: PAYMENT_TOKEN_ADDRESS,
        functionName: "transfer",
        args: [recipient, encrypted],
        value: fee
      });
      await publicClient?.waitForTransactionReceipt({hash});
      await refetchBalance();
      return hash;
    },
    [encryptAmount, getIncoFee, publicClient, ready, refetchBalance, writeContractAsync]
  );

  const sendEth = useCallback(
    async (recipient: Address, amountEth: string) => {
      if (!walletClient || !publicClient || !address) {
        throw new Error("Connect wallet first.");
      }
      const value = parseEther(amountEth || "0");
      const hash = await walletClient.sendTransaction({
        account: address,
        to: recipient,
        value,
        chain: walletClient.chain
      });
      await publicClient.waitForTransactionReceipt({hash});
      return hash;
    },
    [address, publicClient, walletClient]
  );

  const getOfframpQuote = useCallback(async (amountLocal: string, currency: string) => {
    const response = await fetch("/api/offramp/quote", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({amountLocal, currency})
    });
    if (!response.ok) {
      throw new Error("Unable to fetch quote");
    }
    return response.json();
  }, []);

  const initiateOfframpPayout = useCallback(
    async (payload: {
      amountLocal: string;
      currency: string;
      usdcAmount: string;
      bankName: string;
      accountNumber: string;
      accountName: string;
      wallet?: string;
    }) => {
      const response = await fetch("/api/offramp/payout", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error("Unable to initiate payout");
      }
      return response.json();
    },
    []
  );

  const settleOfframpFromPrivateBalance = useCallback(
    async (usdcAmount: string) => {
      if (!OFFRAMP_SETTLEMENT_ADDRESS) {
        throw new Error("Missing NEXT_PUBLIC_OFFRAMP_SETTLEMENT_ADDRESS");
      }
      return sendPrivate(OFFRAMP_SETTLEMENT_ADDRESS, usdcAmount);
    },
    [sendPrivate]
  );

  return useMemo(
    () => ({
      address,
      ready,
      fiatMode: FIAT_MODE,
      cardMode: CARD_MODE,
      paymentTokenAddress: PAYMENT_TOKEN_ADDRESS,
      offrampSettlementAddress: OFFRAMP_SETTLEMENT_ADDRESS,
      balanceHandle: balanceHandle as bigint | undefined,
      decryptHandle,
      getWalletUsdcBalance,
      getWalletEthBalance,
      wrapUsdc,
      sendPrivate,
      sendEth,
      getOfframpQuote,
      initiateOfframpPayout,
      settleOfframpFromPrivateBalance
    }),
    [
      address,
      balanceHandle,
      CARD_MODE,
      decryptHandle,
      getWalletEthBalance,
      FIAT_MODE,
      getWalletUsdcBalance,
      getOfframpQuote,
      initiateOfframpPayout,
      ready,
      settleOfframpFromPrivateBalance,
      sendEth,
      sendPrivate,
      wrapUsdc
    ]
  );
}
