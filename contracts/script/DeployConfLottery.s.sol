// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ConfidentialPaymentsToken} from "../src/ConfidentialERC20.sol";

contract DeployConfLottery is Script {
    address internal constant USDC_BASE_SEPOLIA = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        vm.startBroadcast();

        ConfidentialPaymentsToken token = new ConfidentialPaymentsToken(USDC_BASE_SEPOLIA);
        console.log("ConfidentialPaymentsToken deployed at:", address(token));

        vm.stopBroadcast();
    }
}
