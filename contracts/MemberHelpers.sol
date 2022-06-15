// SPDX-License-Identifier: MIT
pragma solidity =0.8.0;
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IAuditToken.sol";

/**
 * @title MemberHelpers
 */
contract MemberHelpers is AccessControlEnumerable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");

    address public auditToken; //AUDT tokenIERC20Upgradeable
    mapping(address => uint256) public deposits; //track deposits per user

    event LogDepositRedeemed(address indexed from, uint256 amount);
    event LogIncreaseDeposit(address user, uint256 amount);
    event LogDecreaseDeposit(address user, uint256 amount);

    constructor(address _auditToken) {
        require(_auditToken != address(0), "MemberHelpers:setCohort - Cohort address can't be 0");
        auditToken = _auditToken;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

   /// @dev check if caller is a controller
    modifier isController(string memory source) {
        string memory msgError = string(abi.encodePacked("MemberHelpers(isController - Modifier):", source, "- Caller is not a controller"));
        require(hasRole(CONTROLLER_ROLE, msg.sender),msgError);

        _;
    }


    function returnDepositAmount(address user) external view returns (uint256) {
        return deposits[user];
    }


    function increaseDeposit(address user, uint256 amount) external isController("increaseDeposit") returns(bool){
        deposits[user] += amount;
        emit LogIncreaseDeposit(user, amount);
        return true;
    }

    function decreaseDeposit(address user, uint256 amount) external isController("decreaseDeposit") returns (bool){
        deposits[user] -= amount;
        emit LogDecreaseDeposit(user, amount);
        return true;
    }

    /**
     * @dev Function to redeem contribution.
     */
    function redeem() external nonReentrant {

        // deposits[msg.sender] -= amount;
        uint256 amount = deposits[msg.sender];
        deposits[msg.sender] = 0;
        require(amount > 0, "MemberHelpers:redeem - Nothing to redeem. ");
        IERC20(auditToken).safeTransfer(msg.sender, amount);
        emit LogDepositRedeemed(msg.sender, amount);
    }

    function receiveTokens(uint256 amount) external isController("receiveTokens") {
        IERC20(auditToken).safeTransfer(msg.sender, amount);
    }
    
}
