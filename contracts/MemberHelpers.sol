// SPDX-License-Identifier: MIT
pragma solidity =0.8.0;
import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

/**
 * @title MemberHelpers
 * Additional function for Members
 */
contract MemberHelpers is AccessControlEnumerable {
    using SafeMath for uint256;

    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");

 
    mapping(address => uint256) public deposits; //track deposits per user
    uint256 public totalStaked;
    

    event LogIncreaseDeposit(address user, uint256 amount);

    constructor() {

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

    }
   
   /// @dev check if caller is a controller
    modifier isController(string memory source) {
        string memory msgError = string(abi.encodePacked("MemberHelpers(isController - Modifier):", source, "- Caller is not a controller"));
        require(hasRole(CONTROLLER_ROLE, msg.sender),msgError);

        _;
    }
   

    function increaseDeposit(address user, uint256 amount) public isController("increaseDeposit") {
        deposits[user] = deposits[user].add(amount);
        emit LogIncreaseDeposit(user, amount);
    }


    function returnDepositAmount(address user) public view returns (uint256) {
        return deposits[user];
    }


}
