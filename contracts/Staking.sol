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
 * Contract will issue one staking token for each AUDT Token staked
 * Contract will burn all redeemed staking tokens upon redemption
 * Contract will eliminate staking rewards for redemptions made during the staking period
 */
contract Staking is Ownable {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

        struct TokenHolder {     
        uint256 tokensStaked;      // amount of tokens  sent        
        bool revoked;              // true if right to continue vesting is revoked
        uint256 dateStaked;
        bool blacklisted;
        bool released;
        bool cancelled;
    }

    // mapping(address => bool) public blacklistedAddress; //store addresses not eligible for staking

    mapping(address => TokenHolder) public tokenHolders; //tokenHolder list


    uint256 public totalReleased;                       //track total number of redeemed deposits
    uint256 public totalCancelled;                      //track total number of cancelled deposits
    uint256 public stakedAmount;                        //total number of staked tokens    
    AuditToken private _auditToken;                     //AUDT token 
    uint256 public stakingDateEnd;                      //Staking date end
    address public depositContract;                     //contract where tokens will be transferred after staking

    uint256 multiplier = 1e18;
    uint256 stakingRewards = 500;  // added 2 zeros to accomplish fractional interstes like e.g. 5.55 would be represented as 555
    uint256 yearLength = 366;
    uint256 minAmount = 1000e18;

    
    ///@dev Emitted when when staking token is issued
    event LogStaked(address indexed to, uint256 amount);

    ///@dev Emitted when reward has been delivered
    event LogRewardDelivered(address indexed from, uint256 deposit, uint256 reward);

    ///@dev Emitted when deposit is withdrawn before end of staking
    event LogDepositCancelled(address indexed from, uint256 amount);

    ///@dev Emitted when address is entered into blacklist
    event LogBlacklisted(address indexed to);

    ///@dev Emitted when unauthorized tokens are refunded
    event LogUnauthorizedTokensReturn(address indexed to, uint256 amount);

    event LogUpdateEndDate(uint256 endDate);


    /**
     * @dev Sets the below variables 
     * @param _auditTokenAddress - address of the AUDT token
     */
    constructor(address _auditTokenAddress, uint256 dateEnd)  {
        require(_auditTokenAddress != address(0), "Staking:constructor - Audit token address can't be 0");
        _auditToken = AuditToken(_auditTokenAddress);
        stakingDateEnd = dateEnd;
    }

     /**
     * @dev Function to store addresses exempt from staking
     * @param blacklisted - array of addresses to enter    
     */
    function blacklistAddresses(address blacklisted) public onlyOwner() {

        TokenHolder storage tokenHolder = tokenHolders[blacklisted];
        tokenHolder.blacklisted = true;
    }


    /**
     * @dev Function to manually return tokens which were send directly to the contract
     * @param recipient - address of recipient
     * @param amount - amount refunded   
     */
    function returnUnauthorizedTokens( address recipient, uint256 amount) public onlyOwner() {

        require(recipient != address(0), "Staking:returnUnauthorizedTokens - Recipient address can't be 0");
        require(amount > 0, "Staking:returnUnauthorizedTokens - Amount of tokens can't be 0");

        IERC20(_auditToken).safeTransfer(recipient, amount);
        LogUnauthorizedTokensReturn(recipient, amount);
    }


     /**
     * @dev Function to return earning ratio per given amount
     * @param user - user in question   
     * @return number representing earning ratio for given amount       
     */
    function returnEarningsPerUser(address user) public view returns(uint256) {

        TokenHolder storage tokenHolder = tokenHolders[user];

        uint256 daysNumber = (block.timestamp.sub(tokenHolder.dateStaked)).div(60 * 60 * 24);

        return tokenHolder.tokensStaked.mul(daysNumber).mul(earningPertokenPerDay());
    }


    function earningPertokenPerDay() public view returns (uint256){ 
        return  stakingRewards.mul(multiplier).div(366).div(100);
    }

    /**
     * @dev Function to set the min amount
     * @param amount min staking amount
     */
    function updateMinStakeAmount(uint256 amount) public onlyOwner() {

        require(amount > 0, "Staking:updateMinStakeAmount = Min Staking Amount  can't be 0");

        minAmount = amount;

    }

    function setDepositContract(address _depositContract) public onlyOwner() {

        require(_depositContract != address(0), "Staking:setDepositContract - contract address can't be 0");
        depositContract = _depositContract;

    }

    function updateEndDate(uint256 _stakingDateEnd) public onlyOwner() {

        require(_stakingDateEnd > block.timestamp, "Staking:updateEndDate - End date can't be less than current block timestamp");
        stakingDateEnd = _stakingDateEnd;
        LogUpdateEndDate(_stakingDateEnd);
    }

    /**
     * @dev Function to accept contribution to staking
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

    function returnBlockTimeStamp() public view returns (uint256) {

        return block.timestamp;
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

        uint256 amountEarned = returnEarningsPerUser(msg.sender).div(multiplier);
        _auditToken.mint(address(this), amountEarned);
        uint256 amountToTransfer = amountRedeemed.add(amountEarned);
        totalReleased = totalReleased.add(amountRedeemed);
        IERC20(_auditToken).approve(depositContract, amountToTransfer);
        IERC20(_auditToken).safeTransfer(depositContract, amountToTransfer);
        MemberHelpers(depositContract).increaseDeposit(msg.sender, amountToTransfer);
        LogRewardDelivered(msg.sender, amountRedeemed, amountEarned);
    }

     /**
     * @dev Function to return deposit in case user requests before the end of staking period. 
     */
    function _returnDeposit(uint256 amount) internal {

        stakedAmount = stakedAmount.sub(amount);
        totalCancelled = totalCancelled.add(amount);
        IERC20(_auditToken).safeTransfer(msg.sender, amount);
        LogDepositCancelled(msg.sender, amount);
    }
}