const util = require('util')

const STAKINGTOKEN = artifacts.require('../StakingToken');
const TOKEN = artifacts.require('../AuditToken');
const STAKING = artifacts.require('../Staking.sol');
const MEMBERHELPERS = artifacts.require('../MemberHelpers.sol')
// var Tx = require('ethereumjs-tx');




import {
    ensureException,
    duration
} from './helpers/utils.js';

import expectRevert from './helpers/expectRevert';
const timeMachine = require('ganache-time-traveler');






//import should from 'should';

var BigNumber = require('big-number');

contract("Staking Token", (accounts) => {
    let owner;
    let holder1;
    let holder2;

    let tokensToDeposit = new BigNumber(1000).mult(1e18);
    let doubleTokensToDeposit = new BigNumber(2000).mult(1e18);
    let totalReward = new BigNumber(2000).mult(1e18);
    let token;
    let depositContract;
    let staking;
    let memberHelpers;
    let MINTER_ROLE = web3.utils.keccak256("MINTER_ROLE");
    let CONTROLLER_ROLE = web3.utils.keccak256("CONTROLLER_ROLE");

    let snapshotId;

    before(async () => {
        owner = accounts[0];
        holder1 = accounts[1];
        holder2 = accounts[2];
        depositContract = accounts[5];
    });

    beforeEach(async () => {

        let blockNumber = await web3.eth.getBlockNumber();

        token = await TOKEN.new(owner);
        let blockTime = await web3.eth.getBlock(blockNumber);

        let endDate = blockTime.timestamp + 2000;

        staking = await STAKING.new(token.address, endDate);
        memberHelpers = await MEMBERHELPERS.new();
        await token.grantRole(MINTER_ROLE, owner, { from: owner });
        await token.grantRole(MINTER_ROLE, staking.address, { from: owner });
        await token.mint(holder1, tokensToDeposit, { from: owner });

    })

    describe("Deploy", async () => {



        it("Should succeed. Initiate reward within allowed boundaries", async () => {

            let blockNumber = await web3.eth.getBlockNumber();
            let blockTime = await web3.eth.getBlock(blockNumber);
            let endDate = blockTime.timestamp + 2000;

            staking = await STAKING.new(token.address, endDate.toString());
            let dateEndFromContract = await staking.stakingDateEnd();
            assert.strictEqual(dateEndFromContract.toString(), endDate.toString());
        })
    })


    describe("Deposit", async () => {

        it("Approve allowance of 1000 AUDT tokens to staking contract by holder1", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });

            let _allowance = await token
                .allowance
                .call(holder1, staking.address);

            assert.strictEqual(_allowance.toString(), tokensToDeposit.toString());
        });


        it("Transfer AUDT tokens from holder1 to staking contract", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });
            await staking.stake(tokensToDeposit, { from: holder1 });

            let balance = await token.balanceOf(holder1);
            assert.strictEqual(balance.toNumber(), 0);

        })


        it("It should fail contribution of AUDT tokens from holder1 for staking due to deposit period expired", async () => {

            let blockNumber = await web3.eth.getBlockNumber();
            let blockTime = await web3.eth.getBlock(blockNumber);
            let endDate = blockTime.timestamp;
            staking = await STAKING.new(token.address, endDate - 1);
            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });

            try {

                await staking.stake(tokensToDeposit, { from: holder1 });
                expectRevert();
            } catch (error) {

                ensureException(error);
            }
        })



        it("It should fail transferring less than 1000 AUDT tokens", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });

            try {

                await staking.stake(new BigNumber(999).mult(1e18), { from: holder1 });
                expectRevert();

            } catch (error) {
                ensureException(error);
            }
        })


        it("It should fail accepting deposit from blacklisted address", async () => {

            await token.mint(holder1, tokensToDeposit, { from: owner });
            await staking.blacklistAddresses(holder1, { from: owner });
            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });

            try {
                await staking.stake(tokensToDeposit, { from: holder1 });
                expectRevert();

            } catch (error) {
                ensureException(error);
            }


        })


        it("It should fail accepting deposit twice", async () => {

            // await token.mint(holder1, tokensToDeposit, { from: owner });
            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });
            await staking.stake(tokensToDeposit, { from: holder1 });

            await token.mint(holder1, tokensToDeposit, { from: owner });
            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });

            try {
                await staking.stake(tokensToDeposit, { from: holder1 });
                expectRevert();

            } catch (error) {
                ensureException(error);
            }
        })
    });


    describe("Redeem", async () => {

        beforeEach(async () => {
            let snapshot = await timeMachine.takeSnapshot();
            snapshotId = snapshot['result'];
        });

        afterEach(async () => {
            await timeMachine.revertToSnapshot(snapshotId);
        });


        it("It should redeem all AUDT tokens to holder1 who redeemed after staking ended.", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });
            await staking.stake(tokensToDeposit, { from: holder1 });
            await timeMachine.advanceTime(60 * 60 * 24);  // a month
            await staking.setDepositContract(memberHelpers.address);
            await memberHelpers.grantRole(CONTROLLER_ROLE, staking.address, { from: owner });
            await staking.redeem({ from: holder1 });

            let balanceAfterStaking = await token.balanceOf(memberHelpers.address);
            let depositValue = await memberHelpers.returnDepositAmount(holder1)
            assert.strictEqual(balanceAfterStaking.toString(), depositValue.toString());

        })

        it("It should redeem 1000 AUDT tokens to holder1. Redeeming has been done before staking ended, so no reward", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });
            await staking.stake(tokensToDeposit, { from: holder1 });
            await timeMachine.advanceTime(60);  // a minute
            await staking.redeem({ from: holder1 });

            let balanceAfterStaking = await token.balanceOf.call(holder1)
            assert.strictEqual(balanceAfterStaking.toString(), new BigNumber(tokensToDeposit).toString());

        })



        it("It should zero balance of staking token after all users redeemed their earnings", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });
            await staking.stake(tokensToDeposit, { from: holder1 });
            await staking.redeem({ from: holder1 });
            let balanceAfterStaking = await token.balanceOf(staking.address);

            assert.strictEqual(balanceAfterStaking.toNumber(), 0);
        })

    });

    describe("update staking end date", async () => {

        it("It should update end date by the owner", async () => {

            let blockNumber = await web3.eth.getBlockNumber();
            let blockTime = await web3.eth.getBlock(blockNumber);
            let endDateSet = blockTime.timestamp + 3000;

            await token.mint(holder1, tokensToDeposit, { from: owner });
            await staking.updateEndDate(endDateSet, { from: owner });
            let endDate = await staking.stakingDateEnd();
            assert.strictEqual(endDate.toString(), endDateSet.toString());
        })

        it("It should fail updating end date by holder1", async () => {

            let blockNumber = await web3.eth.getBlockNumber();
            let blockTime = await web3.eth.getBlock(blockNumber);

            let endDateSet = blockTime.timestamp + 3000;

            try {
                await await staking.updateEndDate(endDateSet, { from: holder1 });
                expectRevert();
            } catch (error) {
                ensureException(error);
            }
        })

        it("It should fail updating staking period by passing argument 0", async () => {

            try {
                await staking.updateEndDate(0, { from: owner })
                expectRevert();

            } catch (error) {
                ensureException(error);
            }
        })

        it("It should fail updating end date by passing end date less or equal current block timestamp", async () => {


            let blockNumber = await web3.eth.getBlockNumber();
            let blockTime = await web3.eth.getBlock(blockNumber);
            let endDate = blockTime.timestamp - 1;

            try {
                await staking.updateEndDate(endDate, { from: owner });
                expectRevert();
            } catch (error) {
                ensureException(error);
            }
        })


    })

    describe("returnUnauthorizedTokens", async () => {

        it("It should fail to refund tokens to holder1 due to insufficient funds in the contract", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });
            await staking.stake(tokensToDeposit, { from: holder1 });

            try {
                let result = await staking.returnUnauthorizedTokens(holder1, doubleTokensToDeposit, { from: owner });
                expectRevert();
            }
            catch (error) {
                ensureException(error);
            }
        })

        it("It should refund tokens to holder1", async () => {


            await token.transfer(staking.address, tokensToDeposit, { from: holder1 });
            let result = await staking.returnUnauthorizedTokens(holder1, tokensToDeposit, { from: owner });
            let balanceAfterRefund = await token.balanceOf(holder1)
            assert.strictEqual(balanceAfterRefund.toString(), tokensToDeposit.toString());
            assert.lengthOf(result.logs, 1);

            let event = result.logs[0];
            assert.equal(event.event, 'LogUnauthorizedTokensReturn');
            assert.strictEqual(event.args.amount.toString(), tokensToDeposit.toString());

        })

        it("It should fail to refund tokens to holder1 when refund is called by not authorized user", async () => {


            await token.transfer(staking.address, tokensToDeposit, { from: holder1 })

            try {
                let result = await staking.returnUnauthorizedTokens(holder1, tokensToDeposit, { from: holder1 });
                expectRevert();
            }
            catch (error) {
                ensureException(error);
            }
        })

    })


    describe("Blacklisted", async () => {

        it("It should fail accepting deposit from blacklisted address", async () => {

            await token.mint(holder1, tokensToDeposit, { from: owner });
            await staking.blacklistAddresses(holder1, { from: owner });
            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });

            try {
                await staking.stake(tokensToDeposit, { from: holder1 });
                expectRevert();

            } catch (error) {
                ensureException(error);
            }


        })
    })

});
