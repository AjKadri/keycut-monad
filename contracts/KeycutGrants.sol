// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Grant {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract KeycutGrants {
    struct Grant {
        uint256 cap;
        uint256 spent;
        uint64 expiry;
        bool active;
    }

    mapping(address owner => mapping(address agent => mapping(address token => Grant))) public grants;

    error NotAgent();
    error InvalidAgent();
    error InvalidToken();
    error InvalidRecipient();
    error InvalidCap();
    error InvalidExpiry();
    error GrantInactive();
    error GrantExpired();
    error CapExceeded();
    error TransferFailed();

    event GrantCreated(address indexed owner, address indexed agent, address indexed token, uint256 cap, uint256 expiry);
    event GrantSpent(address indexed owner, address indexed agent, address indexed token, address to, uint256 amount, uint256 spent);
    event GrantRevoked(address indexed owner, address indexed agent, address indexed token);

    function grant(address agent, address token, uint256 cap, uint256 expiry) external {
        if (agent == address(0)) revert InvalidAgent();
        if (token == address(0)) revert InvalidToken();
        if (cap == 0) revert InvalidCap();
        if (expiry <= block.timestamp) revert InvalidExpiry();
        grants[msg.sender][agent][token] = Grant({ cap: cap, spent: 0, expiry: uint64(expiry), active: true });
        emit GrantCreated(msg.sender, agent, token, cap, expiry);
    }

    function pay(address owner, address token, address to, uint256 amount) external {
        if (to == address(0)) revert InvalidRecipient();
        Grant storage permission = grants[owner][msg.sender][token];
        if (!permission.active) revert GrantInactive();
        if (block.timestamp >= permission.expiry) revert GrantExpired();
        if (amount == 0 || permission.spent + amount > permission.cap) revert CapExceeded();
        permission.spent += amount;
        if (!IERC20Grant(token).transferFrom(owner, to, amount)) revert TransferFailed();
        emit GrantSpent(owner, msg.sender, token, to, amount, permission.spent);
    }

    function revoke(address agent, address token) external {
        Grant storage permission = grants[msg.sender][agent][token];
        if (!permission.active) revert GrantInactive();
        permission.active = false;
        emit GrantRevoked(msg.sender, agent, token);
    }

    function getGrant(address owner, address agent, address token) external view returns (Grant memory) {
        return grants[owner][agent][token];
    }
}
