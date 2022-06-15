const timeMachine = require('ganache-time-traveler');


before(async () => {
    let blockBefore = await web3.eth.getBlock();

    console.log("blockBefore:", blockBefore.timestamp);
    // await timeMachine.advanceTimeAndBlock(60 * 60 * 24 * 338);  // year


});


describe("Deploy", async () => {

    it("Should succeed. validation deployed and initialized", async () => {
        let blockAfter = await web3.eth.getBlock();

        console.log("blockAfter:", blockAfter.timestamp);
    })
})
// async function moveTime() {

//     let blockBefore = await web3.eth.getBlock();

//     console.log("blockBefore:", blockBefore);
//     await timeMachine.advanceTimeAndBlock(60 * 60 * 24 * 366);  // year
//     let blockAfter = await web3.eth.getBlock();

//     console.log("blockAfter:", blockAfter);
// }

// moveTime();

