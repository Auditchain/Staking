const TOKEN = artifacts.require('../AuditToken');
const STAKING = artifacts.require('../Staking.sol');
const MEMBERHELPERS = artifacts.require('../MemberHelpers.sol')

var BigNumber = require('big-number');

let MINTER_ROLE = web3.utils.keccak256("MINTER_ROLE");
let CONTROLLER_ROLE = web3.utils.keccak256("CONTROLLER_ROLE");



module.exports = async function (deployer, network, accounts) { // eslint-disable-line

    const owner = accounts[0];
    let tokensToDeposit = "1000000000000000000000";

    let blockNumber = await web3.eth.getBlockNumber();

    token = await TOKEN.new(owner);
    let blockTime = await web3.eth.getBlock(blockNumber);

    let endDate = blockTime.timestamp + 2000;

    staking = await STAKING.new(token.address, endDate);
    memberHelpers = await MEMBERHELPERS.new();
    await token.grantRole(MINTER_ROLE, owner, { from: owner });
    await token.grantRole(MINTER_ROLE, staking.address, { from: owner });
    await token.mint(owner, tokensToDeposit, { from: owner });

    console.log("\n\n" + '"AUDT_TOKEN_ADDRESS":"' + token.address + '",');
    console.log('"STAKING_CONTRACT_ADDRESS":"' + staking.address + '",');
    console.log('"MEMBER_STAKING_ADDRESS":"' + memberHelpers.address + '"');


}
