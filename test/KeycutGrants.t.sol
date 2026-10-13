// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DemoToken} from "../contracts/DemoToken.sol";
import {KeycutGrants} from "../contracts/KeycutGrants.sol";

interface VmGrants {
    function prank(address) external;
    function expectRevert(bytes calldata) external;
    function warp(uint256) external;
}

contract KeycutGrantsTest {
    VmGrants internal constant vm = VmGrants(address(uint160(uint256(keccak256("hevm cheat code")))));
    DemoToken internal token;
    KeycutGrants internal grants;
    address internal owner = address(0xA11CE);
    address internal agent = address(0xB0B);
    address internal recipient = address(0xCAFE);

    function setUp() public {
        token = new DemoToken("Test Dollar", "TUSD", 1_000 ether);
        grants = new KeycutGrants();
        token.transfer(owner, 100 ether);
        vm.prank(owner);
        token.approve(address(grants), 100 ether);
    }

    function _grant(uint256 cap, uint256 expiry) internal {
        vm.prank(owner);
        grants.grant(agent, address(token), cap, expiry);
    }

    function testPayWithinCap() public {
        _grant(50 ether, block.timestamp + 1 days);
        vm.prank(agent);
        grants.pay(owner, address(token), recipient, 10 ether);
        (, uint256 spent, , bool active) = grants.grants(owner, agent, address(token));
        require(spent == 10 ether && active, "grant state mismatch");
        require(token.balanceOf(recipient) == 10 ether, "recipient balance mismatch");
    }

    function testPayOverCapReverts() public {
        _grant(50 ether, block.timestamp + 1 days);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KeycutGrants.CapExceeded.selector));
        grants.pay(owner, address(token), recipient, 51 ether);
    }

    function testPayAfterExpiryReverts() public {
        _grant(50 ether, block.timestamp + 1 days);
        vm.warp(block.timestamp + 1 days);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KeycutGrants.GrantExpired.selector));
        grants.pay(owner, address(token), recipient, 1 ether);
    }

    function testPayAfterRevokeReverts() public {
        _grant(50 ether, block.timestamp + 1 days);
        vm.prank(owner);
        grants.revoke(agent, address(token));
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KeycutGrants.GrantInactive.selector));
        grants.pay(owner, address(token), recipient, 1 ether);
    }

    function testOnlyGrantOwnerCanRevoke() public {
        _grant(50 ether, block.timestamp + 1 days);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(KeycutGrants.GrantInactive.selector));
        grants.revoke(agent, address(token));

        vm.prank(owner);
        grants.revoke(agent, address(token));
    }

    function testOnlyAgentCanPay() public {
        _grant(50 ether, block.timestamp + 1 days);
        vm.prank(address(0xD00D));
        vm.expectRevert(abi.encodeWithSelector(KeycutGrants.GrantInactive.selector));
        grants.pay(owner, address(token), recipient, 1 ether);
    }
}
