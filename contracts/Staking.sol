// SPDX-License-Identifier: MIT
pragma solidity =0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./AuditToken.sol";
import "./MemberHelpers.sol";


/**
 * @title Staking 
 * @dev To facilitate staking of AUDT tokens.
 * Participants can stake their AUDT tokens until platform goes live.
 * Contract will eliminate staking rewards for redemptions made during the staking period
 */
contract Staking is Ownable {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

        struct TokenHolder {     
        uint256 tokensStaked;       // amount of tokens  sent        
        bool revoked;               // true if right to continue vesting is revoked
        uint256 dateStaked;         // date stake was set
        bool blacklisted;           // true if blacklisted
        bool released;              // true if stake released
        bool cancelled;             // true if canceled before the term was over
    }

    mapping(address => TokenHolder) public tokenHolders; //tokenHolder list


    uint256 public totalReleased;   //track total number of redeemed deposits
    uint256 public totalCancelled;  //track total number of cancelled deposits
    uint256 public stakedAmount;    //total number of staked tokens    
    AuditToken private _auditToken; //AUDT token 
    uint256 public stakingDateEnd;  //Staking date end
    address public depositContract; //contract where tokens will be transferred after staking

    uint256 multiplier = 1e18;      // number to calculate accrued gains with precision of 18 decimal points                
    
    uint256 public stakingRewards  = 1200;   // added 2 zeros to accomplish fractional interests like e.g. 5.55 would be represented as 555
    uint256 public minAmount  = 500e18;    // minium amount which can be staked

    
    ///@dev Emitted when staking token is issued
    event LogStaked(address indexed to, uint256 amount);

    ///@dev Emitted when reward has been delivered
    event LogRewardDelivered(address indexed from, uint256 deposit, uint256 reward);

    ///@dev Emitted when deposit is withdrawn before end of staking
    event LogDepositCancelled(address indexed from, uint256 amount);

    ///@dev Emitted when address is entered into blacklist
    event LogBlacklisted(address indexed to);


    /**
     * @dev Sets the below variables 
     * @param auditTokenAddress - address of the AUDT token
     * @param dateEnd - date end of staking
     */
    constructor(address auditTokenAddress, uint256 dateEnd)  {
        require(auditTokenAddress != address(0), "Staking:constructor - Audit token address can't be 0");
        require(dateEnd > block.timestamp, "Staking:constructor - Date end can't be less than current time.");

        _auditToken = AuditToken(auditTokenAddress);
        stakingDateEnd = dateEnd;
    }

     /**
     * @dev Function to store addresses exempt from staking
     * @param blacklisted - array of addresses to enter    
     */
    function blacklistAddresses(address blacklisted) public onlyOwner() {
        require(blacklisted != address(0), "Staking:blacklistAddresses - Blacklisted address can't be 0");
        TokenHolder storage tokenHolder = tokenHolders[blacklisted];
        tokenHolder.blacklisted = true;

        emit LogBlacklisted(blacklisted);
    }

     /**
     * @dev Function to return earning ratio per given amount
     * @param user - user in question   
     * @return number representing earning ratio for given amount       
     */
    function returnEarningsPerUser(address user) public view returns(uint256) {

        require(user != address(0), "Staking:returnEarningsPerUser - User address can't be 0");

        TokenHolder storage tokenHolder = tokenHolders[user];
        uint256 daysNumber = (block.timestamp.sub(tokenHolder.dateStaked)).div(60 * 60 * 24);
        return (tokenHolder.tokensStaked.mul(daysNumber).mul(earningPerTokenPerDay())).div(multiplier);
    }

    /**
     * @dev Function to calculate earnings per token per day 
     */
    function earningPerTokenPerDay() public view returns (uint256){ 
        return  stakingRewards.mul(multiplier).div(366).div(10000);
    }

    /**
     * @dev Function to set the min amount
     * @param amount min staking amount
     */
    function updateMinStakeAmount(uint256 amount) public onlyOwner() {

        require(amount > 0, "Staking:updateMinStakeAmount = Min Staking Amount  can't be 0");
        minAmount = amount;

    }

    /**
     * @dev Function to set deposit contract address
     * @param _depositContract address of contract to which tokens will be deposited
     */
    function setDepositContract(address _depositContract) public onlyOwner() {

        require(_depositContract != address(0), "Staking:setDepositContract - contract address can't be 0");
        depositContract = _depositContract;
    }
    

    /**
     * @dev Function to accept contribution for staking
     * @param amount number of AUDT tokens sent to contract for staking     
     */

    function stake(uint256 amount) public {

        TokenHolder storage tokenHolder = tokenHolders[msg.sender];
        require(block.timestamp < stakingDateEnd, "Stake:stake - The deposit time is over");

        require(amount >= minAmount, "Staking:stake - Your contribution is below allowed minimum.");
        require(tokenHolder.blacklisted == false, "This address has been blacklisted");
        require(tokenHolder.tokensStaked == 0, "This address is staking already");

        stakedAmount = stakedAmount.add(amount);  // track tokens contributed so far
        _receiveDeposit(amount);
        emit LogStaked(msg.sender, amount);
    }

    /**
     * @dev Function to receive and process deposits called from stake() function
     * @param amount number of tokens deposited
     */
    function _receiveDeposit(uint amount) internal  {      

        TokenHolder storage tokenHolder = tokenHolders[msg.sender];
        tokenHolder.tokensStaked = tokenHolder.tokensStaked.add(amount);
        tokenHolder.dateStaked = block.timestamp;
        IERC20(_auditToken).safeTransferFrom(msg.sender, address(this), amount);
    }

     /**
     * @dev Function to redeem contribution. . 
     * User can claim staking total staking amount.
     * if 
     */
    function redeem() public {

        TokenHolder storage tokenHolder = tokenHolders[msg.sender];
        require(!tokenHolder.released, "Staking:redeem - You have already claimed your stake");

        tokenHolder.released = true;
        uint256 amountRedeemed = tokenHolder.tokensStaked;
        
        if (block.timestamp > stakingDateEnd)
            _deliverRewards(amountRedeemed);       
        else
            _returnDeposit(amountRedeemed);

    }

     /**
     * @dev Function to deliver rewards with original deposit called from redeem() function
     */
    function _deliverRewards(uint256 amountRedeemed) internal  {

        uint256 amountEarned = returnEarningsPerUser(msg.sender);
        _auditToken.mint(address(this), amountEarned);
        uint256 amountToTransfer = amountRedeemed.add(amountEarned);
        totalReleased = totalReleased.add(amountRedeemed);
        IERC20(_auditToken).safeTransfer(depositContract, amountToTransfer);
        MemberHelpers(depositContract).increaseDeposit(msg.sender, amountToTransfer);
        emit LogRewardDelivered(msg.sender, amountRedeemed, amountEarned);
    }

     /**
     * @dev Function to return deposit in case user requests before the end of staking period. 
     */
    function _returnDeposit(uint256 amount) internal {

        stakedAmount = stakedAmount.sub(amount);
        totalCancelled = totalCancelled.add(amount);
        IERC20(_auditToken).safeTransfer(msg.sender, amount);
        emit LogDepositCancelled(msg.sender, amount);
    }
}