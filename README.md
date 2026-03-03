# Confidential Payments on Inco

Private USD stable wallet on Base Sepolia where users can spend in local fiat (NGN/GHS/KES) without doing conversion math. Balances remain encrypted with Inco Lightning.

## Stack
- Contracts: Foundry + Solidity + Inco Lightning
- Frontend: Next.js + Wagmi + Inco JS + Off-ramp API routes
- Chain: Base Sepolia (`84532`)

## Contracts
- `ConfidentialPaymentsToken` (`contracts/src/ConfidentialERC20.sol`)
  - Wraps Base Sepolia USDC into encrypted balances
  - Supports encrypted transfers

## Local Fiat Spend Flow
1. User enters local amount, e.g. `5000 NGN`
2. App fetches live FX quote (`/api/offramp/quote`)
3. App shows `5000 NGN ≈ X.XXXX USDC`
4. App initiates payout (`/api/offramp/payout`)
5. App settles equivalent USDC from encrypted wallet to settlement address

Card webhook scaffold:
- `POST /api/webhooks/card`

## Key Addresses
- USDC Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- RPC: `https://sepolia.base.org`

## Setup
```bash
npm install
```

Create env files:
- `contracts/.env`
- `frontend/.env.local`

Then run:
```bash
# frontend
cd frontend
npm run dev

# contracts tests (requires Foundry)
cd ../contracts
forge test -vvv
```

## Deploy
```bash
cd contracts
forge script script/DeployConfLottery.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
```

Update `frontend/.env.local` with:
- `NEXT_PUBLIC_CONFPAYMENTS_ADDRESS`
- `NEXT_PUBLIC_OFFRAMP_SETTLEMENT_ADDRESS`
- `NEXT_PUBLIC_PRIVY_APP_ID`
