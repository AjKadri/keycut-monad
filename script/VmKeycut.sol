// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface VmKeycut {
    function envUint(string calldata name) external returns (uint256 value);
    function envAddress(string calldata name) external returns (address value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract ScriptKeycut {
    VmKeycut internal constant vm =
        VmKeycut(address(uint160(uint256(keccak256("hevm cheat code")))));
}
