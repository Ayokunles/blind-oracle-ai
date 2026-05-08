// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title BlindOracleFHEVault
 * @notice FHE-native vault ledger for private RWA allocation accounting.
 * @dev This contract keeps balances encrypted. The existing BlindOracleVault is
 *      preserved for the working ERC20 demo flow because ERC20 transfers require
 *      public amounts.
 */
contract BlindOracleFHEVault is ZamaEthereumConfig {
    address public owner;
    bool public complianceRequired;
    mapping(address => bool) public isAllowed;

    struct PrivateVault {
        address user;
        euint64 encryptedBalance;
        uint256 operationCount;
        bool exists;
    }

    mapping(address => PrivateVault) private privateVaults;
    mapping(uint256 => address) public vaultIndex;
    uint256 public totalVaults;

    event PrivateVaultCreated(address indexed user, bytes32 encryptedBalanceHandle, uint256 timestamp);
    event PrivateDeposit(address indexed user, bytes32 encryptedBalanceHandle, uint256 timestamp);
    event PrivateWithdrawal(address indexed user, bytes32 encryptedBalanceHandle, uint256 timestamp);
    event BalanceAccessGranted(address indexed user, address indexed viewer);
    event ComplianceRequiredSet(bool required);
    event UserAllowedSet(address indexed user, bool allowed);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier vaultExists(address user) {
        require(privateVaults[user].exists, "Private vault does not exist");
        _;
    }

    modifier complianceApproved(address user) {
        require(!complianceRequired || isAllowed[user], "User not allowlisted");
        _;
    }

    constructor() {
        owner = msg.sender;
        isAllowed[msg.sender] = true;
    }

    /// @notice Create a private vault with an encrypted initial balance.
    function createPrivateVault(externalEuint64 encryptedInitialBalance, bytes calldata inputProof)
        external
        complianceApproved(msg.sender)
    {
        require(!privateVaults[msg.sender].exists, "Private vault already exists");

        euint64 initialBalance = FHE.fromExternal(encryptedInitialBalance, inputProof);
        initialBalance = FHE.allowThis(initialBalance);
        initialBalance = FHE.allow(initialBalance, msg.sender);

        PrivateVault storage vault = privateVaults[msg.sender];
        vault.user = msg.sender;
        vault.encryptedBalance = initialBalance;
        vault.exists = true;

        vaultIndex[totalVaults] = msg.sender;
        totalVaults++;

        emit PrivateVaultCreated(msg.sender, euint64.unwrap(initialBalance), block.timestamp);
    }

    /// @notice Add an encrypted amount to the caller's encrypted vault balance.
    function depositPrivate(externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        vaultExists(msg.sender)
        complianceApproved(msg.sender)
    {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        PrivateVault storage vault = privateVaults[msg.sender];
        euint64 updatedBalance = FHE.add(vault.encryptedBalance, amount);
        updatedBalance = FHE.allowThis(updatedBalance);
        updatedBalance = FHE.allow(updatedBalance, msg.sender);

        vault.encryptedBalance = updatedBalance;
        vault.operationCount++;

        emit PrivateDeposit(msg.sender, euint64.unwrap(updatedBalance), block.timestamp);
    }

    /// @notice Subtract an encrypted amount from the caller's encrypted vault balance.
    /// @dev Production withdrawals should pair this with policy checks and gateway/KMS
    ///      decryption where appropriate. The balance itself remains encrypted here.
    function withdrawPrivate(externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        vaultExists(msg.sender)
        complianceApproved(msg.sender)
    {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        PrivateVault storage vault = privateVaults[msg.sender];
        euint64 updatedBalance = FHE.sub(vault.encryptedBalance, amount);
        updatedBalance = FHE.allowThis(updatedBalance);
        updatedBalance = FHE.allow(updatedBalance, msg.sender);

        vault.encryptedBalance = updatedBalance;
        vault.operationCount++;

        emit PrivateWithdrawal(msg.sender, euint64.unwrap(updatedBalance), block.timestamp);
    }

    /// @notice Grant another address permission to request decryption of this encrypted balance.
    function grantBalanceAccess(address viewer) external vaultExists(msg.sender) {
        require(viewer != address(0), "Invalid viewer");

        PrivateVault storage vault = privateVaults[msg.sender];
        vault.encryptedBalance = FHE.allow(vault.encryptedBalance, viewer);

        emit BalanceAccessGranted(msg.sender, viewer);
    }

    /// @notice Return the encrypted balance handle. The value is not plaintext.
    function getEncryptedBalanceHandle(address user) external view vaultExists(user) returns (bytes32) {
        return euint64.unwrap(privateVaults[user].encryptedBalance);
    }

    /// @notice Return encrypted balance ciphertext type for SDK/KMS flows.
    function getEncryptedBalance(address user) external view vaultExists(user) returns (euint64) {
        return privateVaults[user].encryptedBalance;
    }

    function hasPrivateVault(address user) external view returns (bool) {
        return privateVaults[user].exists;
    }

    function getPrivateOperationCount(address user) external view returns (uint256) {
        return privateVaults[user].operationCount;
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

    function getPublicVaultMetadata(address user)
        external
        view
        vaultExists(user)
        returns (address vaultOwner, uint256 operationCount, bytes32 encryptedBalanceHandle)
    {
        PrivateVault storage vault = privateVaults[user];
        return (vault.user, vault.operationCount, euint64.unwrap(vault.encryptedBalance));
    }
}
