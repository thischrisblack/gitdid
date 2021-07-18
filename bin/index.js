#! /usr/bin/env node

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const chalk = require('chalk');
const { access } = require('fs');

/*
Branch my_feature_branch from production exists and is pushed already
 
 If a PR for my_feature_branch does NOT exist, then this is the first time running gitdid
 
	CREATE flow
	
	Prompt for prProps
	
	PRODUCTION
	Create PR to production using prProps
	Store PR id
	
	DEVELOP
	Create my_feature_branch-DEVELOP from my_feature_branch
	Create PR to develop using prProps
	Store PR id
	
	PREPROD
	Create my_feature_branch-PREPROD from my_feature_branch
	Create PR to preprod using prProps
	Store PR id
 
 If a PR for my_feature_branch DOES exist, then we create a new PR for develop and update PREPROD
 
	UPDATE FLOW
	
	Get the title & description from the response to gh pr view my_feature_branch
	You'll have to use regex
	The description goes from the '--' to the end.
	Store them.
	
	DEVELOP
	Create my_feature_branch-DEVELOP from my_feature_branch
	Create PR to develop using prProps
	Store PR id
	
	Fetch PR ids of preduction and preprod and store them
	
	PREPROD
	Merge my_feature_branch into my_feature_branch-PREPROD
 
 IN EITHER CASE: 
 
 PR TITLE/DESCRIPTION UPDATE
 Go to each PR and update the title and description, appending the three PR links at the end. 
 
 */

const prProps = {
    ticketId: '',
    title: '',
    body: ''
};

const prLinks = [];

const main = async () => {
    try {
        // Get current branch
        const { stdout } = await exec('git branch --show-current');
        // Trim the newline at the end
        currentBranch = stdout.replace('\n', '');

        // Get the current branch PR
        let currentBranchPr = null;
        try {
            const { stdout } = await exec(`gh pr view ${currentBranch}`);
            currentBranchPr = sdtout;
        } catch (e) {
            console.log(`No pull requests found for ${currentBranch}`);
        }

        if (currentBranchPr) {
            // We are updating.
            // Get the PR title and description without the "Develop" link at the end.
            // This will take some regex!
            //
        } else {
            await createFeatureBranchesAndOpenPrs();
        }
    } catch (e) {
        console.log(chalk.red(e));
    }
};

main().then(() => process.exit(0));

async function createFeatureBranchesAndOpenPrs() {
    try {
        // console.log('Jira Ticket ID:');
        // prProps.ticketId = await getInput();
        // console.log('PR Title:');
        // prProps.title = await getInput();
        // console.log('PR Description:');
        // prProps.body = await getInput();
        // console.log(prProps);

        await createFeatureBranch(currentBranch, 'DEVELOP');
        // await createFeatureBranch(currentBranch, 'PREPROD');

        // Open a PR for that branch into branch
        // ALL BRANCHES
        // exec:
        // gh pr create --base ${branch} --title "${prProps.ticketId}: ${prProps.title} (${branch})" --body "${prProps.body}"
        // If this returns the PR number or a link, store it in prLinks
        // End for loop
        // Here we must update the body the PRs on each branch with the PR links
        // Build the string out of PR links.
        // Use gh to update each PR title.
    } catch (e) {
        console.log(e);
    }
}

const getInput = (function () {
    const getLineGen = (async function* () {
        for await (const line of rl) {
            yield line;
        }
    })();
    return async () => (await getLineGen.next()).value;
})();

async function createFeatureBranch(currentBranch, branch) {
	return new Promise(async resolve => {
		// Create a new feature branch and push to origin
		console.log(chalk.blue(`Creating ${currentBranch}-${branch}`));
		await exec(`git checkout ${branch}`);
		await exec(`git pull origin ${branch}`);
		await exec(
			`git checkout -b ${currentBranch}-${branch} ${currentBranch}`
		);
		await exec(`git merge --no-ff ${branch}`);
		await exec(`git push origin ${currentBranch}-${branch}`);
		console.log(chalk.green(`${currentBranch}-${branch} created.`));
		resolve();
	});	
}
