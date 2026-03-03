// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ConfidentialPaymentsToken} from "../src/ConfidentialERC20.sol";
import {IncoTest} from "@inco/lightning/src/test/IncoTest.sol";
import {euint256, e} from "@inco/lightning/src/Lib.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract TestConfidentialPaymentsToken is IncoTest {
    MockUSDC usdc;
    ConfidentialPaymentsToken token;

    function setUp() public override {
        super.setUp();
        usdc = new MockUSDC();
        token = new ConfidentialPaymentsToken(address(usdc));
    }

    function testWrapUSDC() public {
        uint256 amount = 500_000_000; // 500 USDC (6 decimals)
        usdc.mint(alice, amount);

        vm.startPrank(alice);
        usdc.approve(address(token), amount);
        token.wrapUSDC(amount);
        vm.stopPrank();

        processAllOperations();

        uint256 decryptedBalance = getUint256Value(token.balanceOf(alice));
        assertEq(decryptedBalance, amount, "wrapped balance mismatch");
    }

    function testConfidentialTransferViaContractHandle() public {
        uint256 amount = 100_000_000;
        usdc.mint(address(this), amount);
        usdc.approve(address(token), amount);
        token.wrapUSDC(amount);
        processAllOperations();

        uint256 transferAmount = 25_000_000;
        euint256 encTransferAmount = e.asEuint256(transferAmount);
        e.allow(encTransferAmount, address(this));
        e.allow(encTransferAmount, address(token));

        token.transfer(alice, encTransferAmount);
        processAllOperations();

        uint256 ownerBalance = getUint256Value(token.balanceOf(address(this)));
        uint256 aliceBalance = getUint256Value(token.balanceOf(alice));
        assertEq(ownerBalance, amount - transferAmount, "sender balance mismatch");
        assertEq(aliceBalance, transferAmount, "recipient balance mismatch");
    }

}
