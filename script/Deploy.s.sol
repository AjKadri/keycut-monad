// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DemoToken} from "../contracts/DemoToken.sol";
import {ScriptKeycut, VmKeycut} from "./VmKeycut.sol";

contract Deploy is ScriptKeycut {
    function run() external returns (address tokenA, address tokenB) {
        uint256 privateKey = vm.envUint("MONAD_TESTNET_PRIVATE_KEY");
        vm.startBroadcast(privateKey);

        DemoToken dollar = new DemoToken("Keycut Demo Dollar", "KUSD", 1_000_000 ether);
        DemoToken euro = new DemoToken("Keycut Demo Euro", "KEUR", 1_000_000 ether);

        vm.stopBroadcast();
        return (address(dollar), address(euro));
    }
}
