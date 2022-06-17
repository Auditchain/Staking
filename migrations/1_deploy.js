const TOKEN = artifacts.require('../AuditToken');
const STAKING = artifacts.require('../Staking.sol');
const MEMBERHELPERS = artifacts.require('../MemberHelpers.sol')

var BigNumber = require('big-number');

let MINTER_ROLE = web3.utils.keccak256("MINTER_ROLE");
let CONTROLLER_ROLE = web3.utils.keccak256("CONTROLLER_ROLE");

const timeMachine = require('ganache-time-traveler');




module.exports = async function (deployer, network, accounts) { // eslint-disable-line

    const owner = accounts[0];
    let tokensToDeposit = "1000000000000000000000";

    let blockNumber = await web3.eth.getBlockNumber();

    token = await TOKEN.new(owner);
    let blockTime = await web3.eth.getBlock(blockNumber);

    let endDate = blockTime.timestamp + (60 );
    // let endDate = blockTime.timestamp + (60 * 60 );



    staking = await STAKING.new(token.address, endDate);
    memberHelpers = await MEMBERHELPERS.new(token.address);

    // await token.grantRole(MINTER_ROLE, staking.address, { from: owner });
    // await token.mint(holder1, tokensToDeposit, { from: owner });
    // await token.mint(holder2, tokensToDeposit, { from: owner });


    await staking.setDepositContract(memberHelpers.address);
    await memberHelpers.grantRole(CONTROLLER_ROLE, staking.address, { from: owner });

    await token.grantRole(MINTER_ROLE, owner, { from: owner });
    await token.grantRole(MINTER_ROLE, staking.address, { from: owner });
    // await token.mint(owner, tokensToDeposit, { from: owner });


    await token.increaseAllowance(staking.address, tokensToDeposit, { from: owner });
    await staking.stake(tokensToDeposit, { from: owner });

    await timeMachine.advanceTime(60 * 60 * 24 * 366);
    await timeMachine.advanceBlock();

    console.log("\n\n" + '"AUDT_TOKEN_ADDRESS":"' + token.address + '",');
    console.log('"STAKING_CONTRACT_ADDRESS":"' + staking.address + '",');
    console.log('"MEMBER_STAKING_ADDRESS":"' + memberHelpers.address + '"');


}
