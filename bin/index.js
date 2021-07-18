#! /usr/bin/env node

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const chalk = require('chalk');

const prProps = {
    ticketIdSet: [],
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
			await updatePrs(workingBranch);
        } else {
            await createFeatureBranchesAndOpenPrs();
        }
    } catch (e) {
        console.log(chalk.red(e));
    }
};

main().then(() => process.exit(0));

async function updatePrs(workingBranchPr) {
	// Merge workingBranch into feature_branch-preprod and push it

	// Check to see if the feature_branch-develop still has an open PR on it

	// If so,
		// Merge workingBranch into feature_branch-develop and push it

	// If not, 
		// Delete the local -develop branch, if it exists
		// await createFeatureBranch(workingBranch, 'develop');

		// Get the production PR ticketId, title, and description from workingBranchPr.
		// This will take some regex.
		// Store those values on prProps 
		// Now we have prProps populated
		console.log(workingBranchPr.split('\n')); // Just to look at it.

		// await createPr(workingBranch, 'develop');
		// Now we have new develop PR link on prLinks

		// Update all three PRs with new develop PR link by 
		// const [summary] = prProps.summary.split('_Develop_: ');
		// const newSummary = summary + '_Develop_: ' + prLinks.develop;
		// await exec(`gh pr edit ${prLinks.production} --body "${newSummary}"`);
		// await exec(`gh pr edit ${prLinks.preprod} --body "${newSummary}"`);
		// await exec(`gh pr edit ${prLinks.develop} --body "${newSummary}"`);
}

async function createFeatureBranchesAndOpenPrs() {
    try {
        await getPrProps();

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

async function getPrProps() {
	console.log('Jira Ticket ID(s), separated by commas:');
	prProps.ticketIdSet = (await getInput()).split(',').filter(ticketId => ticketId.trim() !== '');
	console.log('PR Title:');
	prProps.title = await getInput();
	console.log('PR Summary:');
	prProps.summary = await getInput();
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
}

async function createPr(workingBranch, branch) {
	console.log(chalk.blue(`Opening new PR for ${workingBranch}-${branch} to ${branch}`));

	if (branch !== 'production') {
		// Checkout feature branch
		await exec(`git checkout ${workingBranch}-${branch}`);
	}

	// Create PR
	const { stdout: prLink } = await exec(`gh pr create --base ${branch} --title "${prProps.ticketIdSet}: ${prProps.title} (${branch})" --body "${prProps.summary}"`);

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
	const jiraTicketList = prProps.ticketIdSet.map(ticketId => `\n- https://alleyinteractive.atlassian.net/browse/${ticketId}`);
	return `## Summary\n${prProps.summary}\r\n## Ticket(s)${jiraTicketList}\r\n## Related Pull Requests:\n_Production_: ${prLinks.production}\n_Preprod_: ${prLinks.preprod}\n_Develop_: ${prLinks.develop}`;
}