// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title BlindOracleVault
 * @notice Confidential vault for RWA tokens with FHE-encrypted balances
 * @dev Demo contract showing encrypted balance storage
 */
contract BlindOracleVault is ZamaEthereumConfig {
    address public owner;
    IERC20 public immutable assetToken;
    bool public complianceRequired;
    mapping(address => bool) public isAllowed;

    struct Vault {
        address user;
        euint64 balance;
        uint64 plaintextBalance; // For demo fallback
        uint256 depositCount;
        bool exists;
    }

    mapping(address => Vault) public vaults;
    mapping(uint256 => address) public vaultIndex;
    uint256 public totalVaults;

    event VaultCreated(address indexed user, uint256 timestamp);
    event Deposit(address indexed user, uint256 amount, uint256 timestamp);
    event Withdrawal(address indexed user, uint256 amount, uint256 timestamp);
    event ComplianceRequiredSet(bool required);
    event UserAllowedSet(address indexed user, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier vaultExists() {
        require(vaults[msg.sender].exists, "Vault does not exist");
        _;
    }

    modifier complianceApproved(address user) {
        require(!complianceRequired || isAllowed[user], "User not allowlisted");
        _;
    }

    constructor(address _assetToken) {
        require(_assetToken != address(0), "Invalid token");
        owner = msg.sender;
        assetToken = IERC20(_assetToken);
        isAllowed[msg.sender] = true;
    }

    /// @notice Create a new encrypted vault
    /// @param initialBalance Initial balance (plaintext for demo, encrypted in prod)
    function createVault(uint64 initialBalance) external complianceApproved(msg.sender) {
        require(!vaults[msg.sender].exists, "Vault already exists");

        Vault storage vault = vaults[msg.sender];
        vault.user = msg.sender;
        vault.plaintextBalance = 0;
        vault.exists = true;
        vault.depositCount = 0;
        vaultIndex[totalVaults] = msg.sender;
        totalVaults++;

        if (initialBalance > 0) {
            _deposit(vault, initialBalance);
        }

        // In production: store as euint64 using FHE
        // vault.balance = FHE.fromExternal(initialBalance, inputProof);

        emit VaultCreated(msg.sender, block.timestamp);
    }

    /// @notice Deposit tokens into vault
    /// @param amount Amount to deposit
    function deposit(uint64 amount) external vaultExists complianceApproved(msg.sender) {
        require(amount > 0, "Amount must be > 0");

        Vault storage vault = vaults[msg.sender];
        _deposit(vault, amount);

        // In production: add encrypted amount
        // euint64 depositAmount = FHE.fromExternal(amount, inputProof);
        // vault.balance = FHE.add(vault.balance, depositAmount);

        emit Deposit(msg.sender, amount, block.timestamp);
    }

    /// @notice Withdraw tokens from vault
    /// @param amount Amount to withdraw
    function withdraw(uint64 amount) external vaultExists {
        require(amount > 0, "Amount must be > 0");
        require(vaults[msg.sender].plaintextBalance >= amount, "Insufficient balance");

        Vault storage vault = vaults[msg.sender];
        vault.plaintextBalance -= amount;
        require(assetToken.transfer(msg.sender, uint256(amount) * 1e18), "Token transfer failed");

        // In production: subtract encrypted amount with FHE comparison

        emit Withdrawal(msg.sender, amount, block.timestamp);
    }

    /// @notice Get balance (plaintext for demo, encrypted in prod)
    /// @return balance The vault balance
    function getBalance() external view vaultExists returns (uint64) {
        Vault storage vault = vaults[msg.sender];
        require(vault.user == msg.sender, "Not your vault");
        return vault.plaintextBalance;
    }

    /// @notice Get encrypted balance handle (for KMS decryption)
    /// @return handle The encrypted balance handle
    function getEncryptedBalance() external view vaultExists returns (bytes32) {
        Vault storage vault = vaults[msg.sender];
        require(vault.user == msg.sender, "Not your vault");
        // In production: return vault.balance.handle
        return bytes32(0);
    }

    /// @notice Check if user has a vault
    function hasVault(address user) external view returns (bool) {
        return vaults[user].exists;
    }

    /// @notice Get total number of vaults
    function getTotalVaults() external view returns (uint256) {
        return totalVaults;
    }

    /// @notice Get deposit count for a user
    function getDepositCount(address user) external view returns (uint256) {
        return vaults[user].depositCount;
    }

    function setComplianceRequired(bool required) external onlyOwner {
        complianceRequired = required;
        emit ComplianceRequiredSet(required);
    }

    function setUserAllowed(address user, bool allowed) external onlyOwner {
        require(user != address(0), "Invalid user");
        isAllowed[user] = allowed;
        emit UserAllowedSet(user, allowed);
    }

    function _deposit(Vault storage vault, uint64 amount) internal {
        require(assetToken.transferFrom(msg.sender, address(this), uint256(amount) * 1e18), "Token transfer failed");
        vault.plaintextBalance += amount;
        vault.depositCount++;
    }

    /// @notice Owner-only: withdraw contract funds
    function withdrawFunds() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
