// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

import "./BlindOracleVault.sol";

/**
 * @title BlindOracleAnalyst
 * @notice AI query handler for encrypted RWA portfolios
 * @dev Receives encrypted queries, triggers FHE compute, returns encrypted results
 */
contract BlindOracleAnalyst is ZamaEthereumConfig {
    address public owner;
    BlindOracleVault public vault;

    struct Query {
        uint256 queryId;
        address user;
        string queryType;
        euint64 encryptedResult;
        bool responded;
        uint256 timestamp;
    }

    mapping(uint256 => Query) public queries;
    uint256 public queryCounter;

    event QuerySubmitted(uint256 indexed queryId, address indexed user, string queryType, uint256 timestamp);
    event QueryResponded(uint256 indexed queryId, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _vaultAddress) {
        owner = msg.sender;
        vault = BlindOracleVault(_vaultAddress);
    }

    /// @notice Submit an encrypted portfolio query
    /// @param queryType Type of query (balance, allocation, yield, etc.)
    /// @return queryId The query ID
    function submitQuery(string calldata queryType) external payable returns (uint256) {
        require(vault.hasVault(msg.sender), "No vault found");

        uint256 queryId = queryCounter++;
        Query storage q = queries[queryId];
        q.queryId = queryId;
        q.user = msg.sender;
        q.queryType = queryType;
        q.timestamp = block.timestamp;
        q.responded = false;

        emit QuerySubmitted(queryId, msg.sender, queryType, block.timestamp);

        return queryId;
    }

    /// @notice Respond to a query with encrypted result
    /// @param _queryId The query ID
    /// @param resultValue Encrypted result value
    function respondToQuery(uint256 _queryId, externalEuint64 resultValue, bytes calldata inputProof)
        external
        onlyOwner
    {
        Query storage q = queries[_queryId];
        require(q.user != address(0), "Query not found");
        require(!q.responded, "Already responded");

        q.encryptedResult = FHE.fromExternal(resultValue, inputProof);
        q.responded = true;

        emit QueryResponded(_queryId, block.timestamp);
    }

    /// @notice Get encrypted result for a query
    /// @param _queryId Query ID
    /// @return result The encrypted result
    /// @return responded Whether query was responded to
    function getResult(uint256 _queryId)
        external
        view
        returns (euint64 result, bool responded)
    {
        Query storage q = queries[_queryId];
        require(q.user == msg.sender, "Not your query");
        return (q.encryptedResult, q.responded);
    }

    /// @notice Get query details
    /// @param _queryId Query ID
    /// @return user Query submitter
    /// @return queryType Type of query
    /// @return responded Whether responded
    function getQueryDetails(uint256 _queryId)
        external
        view
        returns (address user, string memory queryType, bool responded)
    {
        Query storage q = queries[_queryId];
        return (q.user, q.queryType, q.responded);
    }

    /// @notice Set the vault address
    /// @param _vaultAddress New vault address
    function setVault(address _vaultAddress) external onlyOwner {
        vault = BlindOracleVault(_vaultAddress);
    }

    /// @notice Owner-only: withdraw contract funds
    function withdrawFunds() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
}
