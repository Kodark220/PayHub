// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {e, ebool, euint256, inco} from "@inco/lightning/src/Lib.sol";

contract ConfidentialPaymentsToken is Ownable2Step {
    error InsufficientFees();
    error InvalidAddress();
    error TransferFailed();

    event Transfer(address indexed from, address indexed to, euint256 amount);
    event Approval(address indexed owner, address indexed spender, euint256 amount);
    event WrappedUSDC(address indexed user, uint256 amount);

    IERC20 public immutable usdc;
    string public name = "Confidential USDC";
    string public symbol = "cUSDC";
    uint8 public constant decimals = 6;

    euint256 public totalSupply;

    mapping(address => euint256) internal balances;
    mapping(address => mapping(address => euint256)) internal allowances;

    constructor(address usdcAddress) Ownable(msg.sender) {
        if (usdcAddress == address(0)) revert InvalidAddress();
        usdc = IERC20(usdcAddress);
    }

    function wrapUSDC(uint256 amount) external {
        if (!usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        _credit(msg.sender, amount);
        emit WrappedUSDC(msg.sender, amount);
    }

    function transfer(address to, bytes calldata encryptedAmount) external payable returns (bool) {
        _requireFee(1);
        transfer(to, e.newEuint256(encryptedAmount, msg.sender));
        return true;
    }

    function transfer(address to, euint256 amount) public returns (bool) {
        e.allow(amount, address(this));
        ebool canTransfer = e.ge(balances[msg.sender], amount);
        _transfer(msg.sender, to, amount, canTransfer);
        return true;
    }

    function approve(address spender, bytes calldata encryptedAmount) external payable returns (bool) {
        _requireFee(1);
        approve(spender, e.newEuint256(encryptedAmount, msg.sender));
        return true;
    }

    function approve(address spender, euint256 amount) public returns (bool) {
        _approve(msg.sender, spender, amount);
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, bytes calldata encryptedAmount) external payable returns (bool) {
        _requireFee(1);
        transferFrom(from, to, e.newEuint256(encryptedAmount, msg.sender));
        return true;
    }

    function transferFrom(address from, address to, euint256 amount) public returns (bool) {
        e.allow(amount, address(this));
        ebool isTransferable = _updateAllowance(from, msg.sender, amount);
        _transfer(from, to, amount, isTransferable);
        return true;
    }

    function balanceOf(address wallet) external view returns (euint256) {
        return balances[wallet];
    }

    function allowance(address owner_, address spender) external view returns (euint256) {
        return allowances[owner_][spender];
    }

    function getTotalSupply() external view returns (euint256) {
        return totalSupply;
    }

    function _credit(address user, uint256 amount) internal {
        euint256 encodedAmount = e.asEuint256(amount);
        balances[user] = e.add(balances[user], encodedAmount);

        e.allow(balances[user], address(this));
        e.allow(balances[user], user);

        totalSupply = e.add(totalSupply, encodedAmount);
        e.allow(totalSupply, address(this));
    }

    function _approve(address owner_, address spender, euint256 amount) internal {
        allowances[owner_][spender] = amount;
        e.allow(amount, address(this));
        e.allow(amount, owner_);
        e.allow(amount, spender);
    }

    function _updateAllowance(address owner_, address spender, euint256 amount) internal returns (ebool) {
        euint256 currentAllowance = allowances[owner_][spender];
        ebool hasAllowance = e.ge(currentAllowance, amount);
        ebool hasBalance = e.ge(balances[owner_], amount);
        ebool isTransferable = e.select(hasBalance, hasAllowance, e.asEbool(false));

        _approve(owner_, spender, e.select(isTransferable, e.sub(currentAllowance, amount), currentAllowance));
        return isTransferable;
    }

    function _transfer(address from, address to, euint256 amount, ebool isTransferable) internal {
        euint256 transferAmount = e.select(isTransferable, amount, e.asEuint256(0));

        balances[from] = e.sub(balances[from], transferAmount);
        balances[to] = e.add(balances[to], transferAmount);

        e.allow(balances[from], address(this));
        e.allow(balances[from], from);
        e.allow(balances[to], address(this));
        e.allow(balances[to], to);

        emit Transfer(from, to, transferAmount);
    }

    function _requireFee(uint256 ciphertextCount) internal view {
        if (msg.value < (inco.getFee() * ciphertextCount)) revert InsufficientFees();
    }
}
