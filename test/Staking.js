const util = require('util')

const TOKEN = artifacts.require('../AuditToken');
const STAKING = artifacts.require('../Staking.sol');
const MEMBERHELPERS = artifacts.require('../MemberHelpers.sol')


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
    let holder3;

    let tokensToDeposit = new BigNumber(1000).mult(1e18);
    let tokensToRecover = new BigNumber(10000).mult(1e18);

    let token;
    let staking;
    let memberHelpers;
    let MINTER_ROLE = web3.utils.keccak256("MINTER_ROLE");
    let CONTROLLER_ROLE = web3.utils.keccak256("CONTROLLER_ROLE");

    let snapshotId;

    before(async () => {
        owner = accounts[0];
        holder1 = accounts[1];
        holder2 = accounts[2];
        holder3 = accounts[3];

        
    });

    beforeEach(async () => {

        let blockNumber =await web3.eth.getBlockNumber();

        token = await TOKEN.new(owner);
        let blockTime = await web3.eth.getBlock(blockNumber);

        let endDate = Number(blockTime.timestamp) + 200;

        staking = await STAKING.new(token.address, endDate);
        memberHelpers = await MEMBERHELPERS.new(token.address);
        await token.grantRole(MINTER_ROLE, owner, { from: owner });
        await token.grantRole(MINTER_ROLE, staking.address, { from: owner });
        await token.mint(holder1, tokensToDeposit, { from: owner });
        await token.mint(holder2, tokensToDeposit, { from: owner });


        await staking.setDepositContract(memberHelpers.address);
        await memberHelpers.grantRole(CONTROLLER_ROLE, staking.address, { from: owner });

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

            let snapshot = await timeMachine.takeSnapshot();
            snapshotId = snapshot['result'];

            await timeMachine.advanceTime(60 * 60 * 24);  // a month
            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });
            try {
                await staking.stake(tokensToDeposit, { from: holder1 });
                expectRevert();
            } catch (error) {

                ensureException(error);
            }

            await timeMachine.revertToSnapshot(snapshotId);
        })



        it("It should fail transferring less than 500 AUDT tokens", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });
            try {
                await staking.stake(new BigNumber(499).mult(1e18), { from: holder1 });
                expectRevert();

            } catch (error) {
                ensureException(error);
            }
        })


        // it("It should fail accepting deposit from blacklisted address", async () => {

        //     await token.mint(holder1, tokensToDeposit, { from: owner });
        //     await staking.blacklistAddresses(holder1, { from: owner });
        //     await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder1 });

        //     try {
        //         await staking.stake(tokensToDeposit, { from: holder1 });
        //         expectRevert();

        //     } catch (error) {
        //         ensureException(error);
        //     }
        // })


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
            await timeMachine.advanceTime(60 * 60 * 24 * 366);  // year
            await timeMachine.advanceBlock();

            await staking.redeem({ from: holder1 });

            let balanceAfterStaking = await token.balanceOf(memberHelpers.address);
            let depositValue = await memberHelpers.returnDepositAmount(holder1);

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

        it("It should send tokens to user wallet when redeeming after staking is over.", async () => {

            await token.increaseAllowance(staking.address, tokensToDeposit, { from: holder2 });
            await staking.stake(tokensToDeposit, { from: holder2 });

            let blockNumber = await web3.eth.getBlockNumber();
            let blockTime = await web3.eth.getBlock(blockNumber);

            await timeMachine.advanceTime(60 * 60 * 24 * 366);
            await timeMachine.advanceBlock();

            blockNumber = await web3.eth.getBlockNumber();


            await staking.redeem({ from: holder2 });
            let result = await memberHelpers.redeem({ from: holder2 });

            assert.lengthOf(result.logs, 1);

            let event = result.logs[0];
            assert.equal(event.event, 'LogDepositRedeemed');
            assert.strictEqual(event.args.from, holder2);

        })


        it("It should fail redeeming from member helpers when nothing is there.", async () => {

            try {
                await memberHelpers.redeem({ from: holder2 });
                expectRevert();
            } catch (error) {
                ensureException(error);
            }
        });


    });


    describe("Update min stake amount", async () => {

        it("It should update min stake amount by owner", async () => {

            await staking.updateMinStakeAmount(1, { from: owner });
            let minAmount = await staking.minAmount();
            assert.strictEqual(minAmount.toNumber(), 1);

        })

        it("It should fail update min stake amount by owner", async () => {

            try {
                await staking.updateMinStakeAmount(0, { from: owner });
                expectRevert();
            } catch (error) {
                ensureException(error);
            }

        })

        it("It should fail update min stake amount by random user", async () => {

            try {
                await staking.updateMinStakeAmount(10000, { from: holder1 });
                expectRevert();
            } catch (error) {
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


    describe("Recover Tokens", async () => {

        it("It should succeed receiving tokens by the controller", async () => {

            await token.mint(memberHelpers.address, tokensToDeposit, { from: owner });
            await memberHelpers.grantRole(CONTROLLER_ROLE, holder3, { from: owner });
            await memberHelpers.receiveTokens(tokensToDeposit, { from: holder3 });

            let balance = await token.balanceOf(holder3);
            assert.equal(balance.toString(), tokensToDeposit.toString());
        })


        it("It should succeed fail receiving tokens by not an authorized user.", async () => {

            await token.mint(memberHelpers.address, tokensToDeposit, { from: owner });



            try {
                await memberHelpers.receiveTokens(tokensToDeposit, { from: owner });
                expectRevert();

            } catch (error) {
                ensureException(error);
            }


        })

        it("It should succeed fail receiving more tokens than available in contract.", async () => {

            await token.mint(memberHelpers.address, tokensToDeposit, { from: owner });
            await memberHelpers.grantRole(CONTROLLER_ROLE, owner, { from: owner });


            try {
                await memberHelpers.receiveTokens(tokensToRecover, { from: owner });
                expectRevert();

            } catch (error) {
                ensureException(error);
            }


        })
    })

});
