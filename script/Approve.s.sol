// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ScriptKeycut, VmKeycut} from "./VmKeycut.sol";

interface IERC20Approval {
    function approve(address spender, uint256 value) external returns (bool);
}

contract Approve is ScriptKeycut {
    function run() external {
        uint256 privateKey = vm.envUint("MONAD_TESTNET_PRIVATE_KEY");
        address tokenA = vm.envAddress("MONAD_TOKEN_A_ADDRESS");
        address tokenB = vm.envAddress("MONAD_TOKEN_B_ADDRESS");
        address alpha = vm.envAddress("KEYCUT_SPENDER_ALPHA");
        address bravo = vm.envAddress("KEYCUT_SPENDER_BRAVO");
        address charlie = vm.envAddress("KEYCUT_SPENDER_CHARLIE");

        vm.startBroadcast(privateKey);
        require(IERC20Approval(tokenA).approve(alpha, 1_000 ether), "alpha approval failed");
        require(IERC20Approval(tokenA).approve(bravo, 350 ether), "bravo approval failed");
        require(IERC20Approval(tokenB).approve(charlie, 75 ether), "charlie approval failed");
        vm.stopBroadcast();
    }
}
