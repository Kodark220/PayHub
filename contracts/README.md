# Confidential Payments Contracts

Foundry contracts for private payments on Base Sepolia with Inco Lightning.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- [Docker](https://docs.docker.com/get-docker/) installed (for local node)
- [Node.js](https://nodejs.org/) >= 18

## Setup Instructions

### 1. Install Dependencies
```sh
npm install
```

### 2. Run a Local Node

Start the local Inco node and covalidator:
```sh
docker compose up
```

### 3. Compile Smart Contracts
```sh
forge build
```

### 4. Run Tests
```sh
forge test -vvv
```

### 5. Deploy (Base Sepolia)
```sh
forge script script/DeployConfLottery.s.sol --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast --private-key $PRIVATE_KEY_BASE_SEPOLIA
```

## Project Structure

```
contracts/
├── src/                    # Solidity source files
│   └── ConfidentialERC20.sol   # ConfidentialPaymentsToken
├── test/                   # Foundry tests
│   └── ConfidentialERC20.t.sol
├── script/                 # Deployment scripts
│   ├── Deploy.s.sol
│   └── DeployConfLottery.s.sol
├── foundry.toml            # Foundry configuration
├── remappings.txt          # Import remappings
└── docker-compose.yaml     # Local node setup
```

## Features

- Confidential USDC wrapping into encrypted balances
- Encrypted transfers
