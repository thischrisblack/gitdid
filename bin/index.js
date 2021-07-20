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
    develop: ''
};

const main = async () => {
    try {
        // Get current branch
        const { stdout } = await exec('git branch --show-current');
        // Trim the newline at the end
        workingBranch = stdout.replace('\n', '');

		if (workingBranch.endsWith('-develop') || workingBranch.endsWith('-preprod')) {
			throw new Error('You are on the wrong branch. Please check out the feature branch you cut from production, not your -develop or -preprod feature branch.');
		}

        // Get the working branch PR
        const workingBranchPr = await getOpenPr(workingBranch);

        if (workingBranchPr) {
            await updatePrs(workingBranch, workingBranchPr);
        } else {
            await createFeatureBranchesAndOpenPrs(workingBranch);
        }
		return true;
    } catch (e) {
        console.log(chalk.red(e));
		return false;
    }
};

main().then((success) => {
	if (success) {
		console.log('🐙 All did!');
	}
	process.exit(0);
});

// CHRIS LOOK
async function checkForMergeConflicts(workingBranch, branch) {
    // git checkout branch
    // git pull origin branch
    // git checkout -b merge-check workingBranch
    // try
    //      git merge --no-ff branch
    //      git checkout workingBranch
    //      git branch -D merge-check
    // catch
    //      log error
    //      git checkout workingBranch
    //      git branch -D merge-check
    //      quit
}

async function getOpenPr(branch) {
    // Get the working branch PR
    let existingPr = null;
    try {
        const { stdout } = await exec(`gh pr view ${branch}`);
        existingPr = stdout.includes('state:\tOPEN') ? stdout : null;
    } catch (e) {
        // If there is no PR, gh throws an error, so we must catch it here
        // so the code will keep running. It's not really an error as far as
        // we're concerned.
    }
    return existingPr;
}

async function updatePrs(workingBranch, workingBranchPr) {
    // Merge workingBranch into working_branch-preprod and push it.
    await updateAndPushBranch(workingBranch, 'preprod');

    // Check to see if the working_branch-develop still has an open PR on it.
    const thereIsAnOpenPrToDevelop =
        (await getOpenPr(`${workingBranch}-develop`)) != null;

    if (thereIsAnOpenPrToDevelop) {
        // Merge workingBranch into working_branch-develop and push it.
        await updateAndPushBranch(workingBranch, 'develop');
    } else {
        // If not, delete the local -develop branch, if it exists.
        try {
            await exec(`git branch -D ${workingBranch}-develop`);
        } catch (e) {
            console.log(
                chalk.blue(
                    `Excellent, ${workingBranch}-develop was already deleted.`
                )
            );
        }

        // Create new -develop feature branch.
        await createFeatureBranch(workingBranch, 'develop');

        // Set props in prProps from the workingBranch PR.
        updatePrProps(workingBranchPr);

        // Create new PR to develop
        await createPr(workingBranch, 'develop');

		// Append new develop PR link to open PR summaries.
        await appendNewDevelopPrToSummaries(workingBranch);
    }
}

async function updateAndPushBranch(workingBranch, branch) {
    console.log(chalk.blue(`Updating ${workingBranch}-${branch}`));
    await exec(`git checkout ${workingBranch}-${branch}`);
    await exec(`git merge --no-ff ${workingBranch}`);
    await exec(`git push origin ${workingBranch}-${branch}`);
    await exec(`git checkout ${workingBranch}`);
    console.log(chalk.green(`✔️ ${workingBranch}-${branch} updated.\r\n`));
}

async function appendNewDevelopPrToSummaries(workingBranch) {
	console.log(chalk.blue(`Updating all ${workingBranch} PR summaries.`));

	// Append develop PR link to the end of the summary.
	const newSummary = prProps.summary + '_Develop_: ' + prLinks.develop;

	// Get array of open PR numbers
	const { stdout: prList } = await exec(`gh pr list -s open`);

	// Filter list by current workingBranch name, split to get the number
	const prNumberSet = prList
		// One PR per line
		.split('\n')
		// Filter by the workingBranch name
		.filter(prLine => prLine.includes(workingBranch))
		// Split to the PR number, which comes first on the line
		.map(workingBranchPrLine => workingBranchPrLine.split('\t')[0])
		// Remove any empty values
		.filter(prNumber => prNumber !== '');

	// Update all PRs
	const promiseSet = prNumberSet.map(prNumber => {
		exec(`gh pr edit ${prNumber} --body "${newSummary}"`)
	})
	await Promise.all(promiseSet);

	console.log(chalk.green(`✔️ All ${workingBranch} PR summaries updated.\r\n`));
}

function updatePrProps(prString) {
    // Parse the ticket ID and title
    const titleRegex = /title:\t(.*?)\s\(production\)/m;
    const ticketIdAndTitle = prString.match(titleRegex)[1];
    const [ticketId, ...restOfTitle] = ticketIdAndTitle.split(': ');
    prProps.ticketIdSet = [ticketId];
    prProps.title = restOfTitle.join(': ');
    // Parse the body
    prProps.summary = prString.split('--\n')[1].split('_Develop_')[0];
}

async function createFeatureBranchesAndOpenPrs(workingBranch) {
    try {
        await getPrProps();

        await createFeatureBranch(workingBranch, 'develop');
        await createFeatureBranch(workingBranch, 'preprod');

        await createPr(workingBranch, 'production');
        await createPr(workingBranch, 'preprod');
        await createPr(workingBranch, 'develop');

        // Update the body the PRs on each branch
        await updatePrBodies();
    } catch (e) {
        console.log(e);
    }
}

async function getPrProps() {
    console.log('Jira Ticket ID(s), separated by commas:');
    prProps.ticketIdSet = (await getInput())
        .split(',')
        .filter((ticketId) => ticketId.trim() !== '');
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
    await exec(`git checkout -b ${workingBranch}-${branch} ${workingBranch}`);
    await exec(`git merge --no-ff ${branch}`);
    await exec(`git push origin ${workingBranch}-${branch}`);
    await exec(`git checkout ${workingBranch}`);
    console.log(chalk.green(`✔️ ${workingBranch}-${branch} created.\r\n`));
}

async function createPr(workingBranch, branch) {
    console.log(
        chalk.blue(`Opening new PR for ${workingBranch}${branch !== 'production' ? `-${branch}` : ''} to ${branch}`)
    );

    if (branch !== 'production') {
        // Checkout feature branch
        await exec(`git checkout ${workingBranch}-${branch}`);
    }

    // Create PR
    const { stdout: prLink } = await exec(
        `gh pr create --base ${branch} --title "${prProps.ticketIdSet[0]}: ${prProps.title} (${branch})" --body "${prProps.summary}"`
    );

    // Store PR link
    prLinks[branch] = prLink.replace('\n', '');

    console.log(chalk.green(`✔️ New PR for ${workingBranch}-${branch} created.\r\n`));

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

    console.log(chalk.green(`✔️ PRs updated.\r\n`));
}

function buildPrBody() {
    const jiraTicketList = prProps.ticketIdSet.map(
        (ticketId) =>
            `\n- https://alleyinteractive.atlassian.net/browse/${ticketId}`
    );
    return `## Summary\n${prProps.summary}\r\n## Ticket(s)${jiraTicketList}\r\n## Related Pull Requests:\n_Production_: ${prLinks.production}\n_Preprod_: ${prLinks.preprod}\n_Develop_: ${prLinks.develop}`;
}
