// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockRWAToken
 * @notice Mock RWA token for testing BlindOracle
 * @dev Simple ERC20 that mints tokens for testing
 */
contract MockRWAToken is ERC20, Ownable {
    // RWA metadata
    string public assetType; // e.g., "T-Bill", "Real Estate", "Private Credit"
    string public assetDescription;
    uint8 public decimals_ = 18;

    event AssetTypeSet(string assetType);
    event TokensMinted(address indexed to, uint256 amount);

    constructor(
        string memory name,
        string memory symbol,
        string memory _assetType,
        string memory _description
    ) ERC20(name, symbol) Ownable(msg.sender) {
        assetType = _assetType;
        assetDescription = _description;
        emit AssetTypeSet(_assetType);
    }

    /// @notice Mint tokens for testing
    /// @param to Address to mint to
    /// @param amount Amount to mint
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /// @notice Mint tokens to caller
    /// @param amount Amount to mint
    function mintToSelf(uint256 amount) external {
        _mint(msg.sender, amount);
        emit TokensMinted(msg.sender, amount);
    }

    /// @notice Get asset type
    /// @return type Asset type string
    function getAssetType() external view returns (string memory) {
        return assetType;
    }

    /// @notice Get balance in human-readable format
    /// @param account Address to check
    /// @return balance Balance in token units
    function getBalanceFormatted(address account) external view returns (string memory) {
        uint256 balance = balanceOf(account);
        return string.concat(
            uint256ToString(balance / 10 ** decimals_),
            " ",
            symbol()
        );
    }

    function uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value > 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
