#! /usr/bin/env node

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const chalk = require('chalk');

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
    summary: ''
};

const prLinks = {
	production: '',
	preprod: '',
	develop: '',
};

const main = async () => {
    try {
        // Get current branch
        const { stdout } = await exec('git branch --show-current');
        // Trim the newline at the end
        workingBranch = stdout.replace('\n', '');

        // Get the working branch PR
        let workingBranchPr;
        try {
            const { stdout } = await exec(`gh pr view ${workingBranch}`);
			// If there is an open PR, update workingBranchPr
            workingBranchPr = stdout.includes('state:\tOPEN') ? stdout : null;
        } catch (e) {
			// If there is no PR, gh throws an error, so we must catch it here
			// so the code will keep running. It's not really an error as far as 
			// we're concerned.
        }

        if (workingBranchPr) {
			console.log(workingBranchPr.split('\n'));
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
        console.log('Jira Ticket ID:');
        prProps.ticketId = await getInput();
        console.log('PR Title:');
        prProps.title = await getInput();
        console.log('PR Summary:');
        prProps.summary = await getInput();

        await createFeatureBranch(workingBranch, 'develop');
        await createFeatureBranch(workingBranch, 'preprod');

		await createPr(workingBranch, 'production');
		await createPr(workingBranch, 'preprod');
		await createPr(workingBranch, 'develop');

        // Update the body the PRs on each branch
        await updatePrBodies();

		console.log('🐙 All did!')
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

async function createFeatureBranch(workingBranch, branch) {
	// CHRIS LOOK does this need to be wrapped in a promise?
	return new Promise(async resolve => {
		// Create a new feature branch and push to origin
		console.log(chalk.blue(`Creating ${workingBranch}-${branch}`));
		await exec(`git checkout ${branch}`);
		await exec(`git pull origin ${branch}`);
		await exec(
			`git checkout -b ${workingBranch}-${branch} ${workingBranch}`
		);
		await exec(`git merge --no-ff ${branch}`);
		await exec(`git push origin ${workingBranch}-${branch}`);
		await exec(`git checkout ${workingBranch}`);
		console.log(chalk.green(`${workingBranch}-${branch} created.`));
		resolve();
	});	
}

async function createPr(workingBranch, branch) {
	console.log(chalk.blue(`Opening new PR for ${workingBranch}-${branch} to ${branch}`));

	if (branch !== 'production') {
		// Checkout feature branch
		await exec(`git checkout ${workingBranch}-${branch}`);
	}

	// Create PR
	const { stdout: prLink } = await exec(`gh pr create --base ${branch} --title "${prProps.ticketId}: ${prProps.title} (${branch})" --body "${prProps.summary}"`);

	// Store PR link
	prLinks[branch] = prLink.replace('\n', '');

	console.log(chalk.green(`New PR for ${workingBranch}-${branch} created.`));

	if (branch !== 'production') {
		// Return to working branch
		await exec(`git checkout ${workingBranch}`);
	}
}

async function updatePrBodies() {
	console.log(chalk.blue(`Updating PR descriptions.`));

	// Update PRs with new descriptions
	await exec(`gh pr edit ${prLinks.production} --body "${buildPrBody()}"`);
	await exec(`gh pr edit ${prLinks.preprod} --body "${buildPrBody()}"`);
	await exec(`gh pr edit ${prLinks.develop} --body "${buildPrBody()}"`);

	console.log(chalk.green(`PRs updated.`));
}

function buildPrBody() {
	return `
	## Summary
	${prProps.summary}

	## Ticket(s)
	- https://alleyinteractive.atlassian.net/browse/${prProps.ticketId}

	### Related Pull Requests:
	_Production_: ${prLinks.production}
	_Preprod_: ${prLinks.preprod}
	_Develop_: ${prLinks.develop}
	`
}