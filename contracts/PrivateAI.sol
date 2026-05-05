// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32, ebool, eaddress} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title PrivateAIInference
 * @notice A confidential AI inference contract using FHE
 * @dev Users submit encrypted queries and get encrypted responses
 */
contract PrivateAIInference is ZamaEthereumConfig {
    address public owner;

    struct Query {
        uint256 queryId;
        address user;
        euint32[] encryptedQuery;
        euint32 encryptedResponse;
        bool responded;
        uint256 timestamp;
    }

    mapping(uint256 => Query) public queries;
    uint256 public queryCounter;
    uint256 public inferenceFee;

    event QuerySubmitted(uint256 indexed queryId, address indexed user, uint256 timestamp);
    event QueryResponded(uint256 indexed queryId, uint256 timestamp);
    event FeeUpdated(uint256 newFee);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(uint256 _initialFee) {
        owner = msg.sender;
        inferenceFee = _initialFee;
    }

    /// @notice Submit an encrypted query
    /// @param inputQuery Array of encrypted query values
    /// @param inputProof Proof for the encrypted data
    function submitQuery(externalEuint32[] calldata inputQuery, bytes[] calldata inputProof)
        external
        payable
        returns (uint256 queryId)
    {
        require(msg.value >= inferenceFee, "Insufficient fee");

        queryId = queryCounter++;
        Query storage q = queries[queryId];
        q.queryId = queryId;
        q.user = msg.sender;
        q.timestamp = block.timestamp;
        q.responded = false;

        q.encryptedQuery = new euint32[](inputQuery.length);
        for (uint256 i = 0; i < inputQuery.length; i++) {
            q.encryptedQuery[i] = FHE.fromExternal(inputQuery[i], inputProof[i]);
        }

        emit QuerySubmitted(queryId, msg.sender, block.timestamp);
    }

    /// @notice Respond to a query with encrypted result
    /// @param _queryId The query ID
    /// @param inputResponse Encrypted response value
    /// @param inputProof Proof for the response
    function respondToQuery(uint256 _queryId, externalEuint32 inputResponse, bytes calldata inputProof)
        external
        onlyOwner
    {
        Query storage q = queries[_queryId];
        require(q.user != address(0), "Query not found");
        require(!q.responded, "Already responded");

        q.encryptedResponse = FHE.fromExternal(inputResponse, inputProof);
        q.responded = true;

        emit QueryResponded(_queryId, block.timestamp);
    }

    /// @notice Get encrypted response
    /// @param _queryId Query ID
    /// @return encryptedResponse The encrypted response
    /// @return responded Whether query was responded to
    function getResponse(uint256 _queryId)
        external
        view
        returns (euint32 encryptedResponse, bool responded)
    {
        Query storage q = queries[_queryId];
        require(q.user == msg.sender, "Not your query");
        return (q.encryptedResponse, q.responded);
    }

    function withdraw() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    function setFee(uint256 _newFee) external onlyOwner {
        inferenceFee = _newFee;
        emit FeeUpdated(_newFee);
    }

    receive() external payable {}
}
