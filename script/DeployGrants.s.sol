// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {KeycutGrants} from "../contracts/KeycutGrants.sol";
import {ScriptKeycut} from "./VmKeycut.sol";

contract DeployGrants is ScriptKeycut {
    function run() external returns (address grants) {
        uint256 privateKey = vm.envUint("MONAD_TESTNET_PRIVATE_KEY");
        vm.startBroadcast(privateKey);
        grants = address(new KeycutGrants());
        vm.stopBroadcast();
    }
}
