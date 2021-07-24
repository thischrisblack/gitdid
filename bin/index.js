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

/**
 * Determines current branch, checks for potential merge conflicts, determines subsequent workflow
 * @returns bool Success or failure
 */
async function main() {
    // Check to be sure the GitHub CLI is installed
    try {
        await exec('gh --version');
    } catch (e) {
        console.log(chalk.red('ERROR: You do not have the gh CLI installed on your system. Please see the gitdid readme for info. https://github.com/thischrisblack/gitdid'));
		return false;
    }
    
    try {
        // Get current branch
        const { stdout } = await exec('git branch --show-current');
        // Trim the newline at the end
        workingBranch = stdout.replace('\n', '');

        // Rough check to be sure we're on the correct branch.
		if (workingBranch.endsWith('-develop') || workingBranch.endsWith('-preprod') || workingBranch === 'production') {
			throw new Error('You are on the wrong branch. Please check out the feature branch you cut from production, not your -develop or -preprod feature branch.');
		}

        // Check for merge conflicts
        await checkForMergeConflicts(workingBranch, 'develop');
        await checkForMergeConflicts(workingBranch, 'preprod');

        // Get the working branch PR
        const workingBranchPr = await getOpenPr(workingBranch);

        if (workingBranchPr) {
            // If a PR exists, we are updating existing PRs

            // Set props in prProps with info from from the workingBranch PR.
            updatePrProps(workingBranchPr);

            // Update PRs
            const developPrCreated = await updateOrCreatePr(workingBranch, 'develop');
            const preprodPrCreated = await updateOrCreatePr(workingBranch, 'preprod');

            if (developPrCreated || preprodPrCreated) {
                // Append new PR links to open PR summaries.
                await appendNewPrLinksToSummaries(workingBranch);
            }
        } else {
            // Otherwise, we are starting from scratch
            await createFeatureBranchesAndOpenPrs(workingBranch);
        }
		return true;
    } catch (e) {
        console.log(chalk.red(e));
		return false;
    }
};

// Start the process.
main().then((success) => {
	if (success) {
		console.log('🐙 All did!');
	}
	process.exit(0);
});

/**
 * Attempts a test merge to a given branch to find out if there will be conflicts
 * @param {string} workingBranch The name of the current branch
 * @param {string} branch The name of the target branch
 */
async function checkForMergeConflicts(workingBranch, branch) {
    console.log(chalk.blue(`Checking for possible merge conflicts on ${branch}`));
    await exec(`git checkout ${branch}`);
    await exec(`git pull origin ${branch}`);
    await exec(`git checkout -b temp_merge_check_branch ${workingBranch}`);
    try {
        await exec(`git merge --no-ff ${branch}`);
        await exec(`git checkout ${workingBranch}`);
        await exec(`git branch -D temp_merge_check_branch`);
    } catch {
        console.log(chalk.red(`😧 There is a merge conflict in ${branch}. Nothing was did. You will have to proceed manually. Sorry 😢`));
        await exec(`git merge --abort`);
        await exec(`git checkout ${workingBranch}`);
        await exec(`git branch -D temp_merge_check_branch`);
        process.exit(0);
    }
    console.log(chalk.green(`✔️ No conflict detected on ${branch}\r\n`));
}

/**
 * Find open PR for a given branch
 * https://cli.github.com/manual/gh_pr_view
 * @param {string} branch The branch to check for an existing open PR
 * @returns null if no PR exists, string with PR info otherwise
 */
async function getOpenPr(branch) {
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

/**
 * Merge new work into feature branches, create new PRs if necessary
 * @param {string} workingBranch The branch with the new work in it
 * @param {string} branch The target branch (i.e. preprod or develop)
 */
async function updateOrCreatePr(workingBranch, branch) {
    let newPrCreated = false;
    // Check to see if the working_branch-{branch} still has an open PR on it.
    const thereIsAnOpenPr =
        (await getOpenPr(`${workingBranch}-${branch}`)) != null;

    if (thereIsAnOpenPr) {
        // Merge workingBranch into working_branch-{branch} and push it.
        await updateAndPushBranch(workingBranch, branch);
    } else {
        // If not, delete the local working_branch-{branch} branch, if it exists.
        try {
            await exec(`git branch -D ${workingBranch}-${branch}`);
        } catch (e) {
            // An error means there was no local working_branch-{branch} branch,
            // which is fine, so we catch the error and proceed.
        }

        // Create new working_branch-{branch} feature branch.
        await createFeatureBranch(workingBranch, branch);

        // Create new PR to branch
        await createPr(workingBranch, branch);

        newPrCreated = true;
    }

    return newPrCreated;
}

/**
 * Checks out existing feature branches and merges new changes into them.
 * @param {string} workingBranch The name of the branch with all the work in it.
 * @param {string} branch The target branch.
 */
async function updateAndPushBranch(workingBranch, branch) {
    console.log(chalk.blue(`Updating ${workingBranch}-${branch}`));
    await exec(`git checkout ${workingBranch}-${branch}`);
    await exec(`git merge --no-ff ${workingBranch}`);
    await exec(`git push origin ${workingBranch}-${branch}`);
    await exec(`git checkout ${workingBranch}`);
    console.log(chalk.green(`✔️ ${workingBranch}-${branch} updated.\r\n`));
}

/**
 * Updates existing PR descriptions with new develop PR link
 * @param {string} workingBranch The name of the working branch.
 */
async function appendNewPrLinksToSummaries(workingBranch) {
	console.log(chalk.blue(`Updating all ${workingBranch} PR summaries.`));

    // Create Related Pull Requests string
    const relatedPrString = '## Related Pull Requests:\n' +
        '_Production_: ' + prLinks.production + '\n' +
        '_Preprod_: ' + prLinks.preprod + '\n' +
        '_Develop_: ' + prLinks.develop;

	// Append PR links to the end of the summary.
	const newSummary = prProps.summary + relatedPrString;

	// Get array of open PR numbers.
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

/**
 * Populates prProps object with data from an existing PR obtained with 'gh pr view'
 * https://cli.github.com/manual/gh_pr_view
 * @param {string} prString PR data (title, number, status, etc.)
 */
function updatePrProps(prString) {
    // Parse the ticket ID and title
    const titleRegex = /title:\t(.*?)\s\(production\)/m;
    const ticketIdAndTitle = prString.match(titleRegex)[1];
    const [ticketId, ...restOfTitle] = ticketIdAndTitle.split(': ');
    prProps.ticketIdSet = [ticketId];
    prProps.title = restOfTitle.join(': ');
    // Parse the body
    const [ summary, prLinksString ] = prString.split('--\n')[1].split('## Related Pull Requests:\n');
    prProps.summary = summary;
    // Parse the PR links
    const [ production, preprod, develop ] = prLinksString.split('\n');
    prLinks.production = production.split(': ')[1];
    prLinks.preprod = preprod.split(': ')[1];
    prLinks.develop = develop.split(': ')[1];
}

/**
 * Handles the feature branch and PR creation when gitdid is run for the first time
 * @param {string} workingBranch The name of the branch with new work in it
 */
async function createFeatureBranchesAndOpenPrs(workingBranch) {
    try {
        await getPrProps(workingBranch);

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

/**
 * Prompts user for information to be used in the PR.
 */
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

/**
 * Prompts user for input
 * Taken from https://stackoverflow.com/questions/43638105/how-to-get-synchronous-readline-or-simulate-it-using-async-in-nodejs
 */
const getInput = (() => {
    const getLineGen = (async function* () {
        for await (const line of rl) {
            yield line;
        }
    })();
    return async () => (await getLineGen.next()).value;
})();

/**
 * Creates new feature brnaches for develop and preprod, with -develop and -preprod suffixes
 * @param {string} workingBranch The name of the working branch
 * @param {string} branch The name of the target branch
 */
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

/**
 * Opens a new PR.
 * https://cli.github.com/manual/gh_pr
 * @param {string} workingBranch The name of the working branch
 * @param {string} branch The name of the target branch
 */
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

/**
 * Updates each PR with ammended descriptions.
 */
async function updatePrBodies() {
    console.log(chalk.blue(`Updating PR descriptions.`));

    // Update PRs with new descriptions
    await exec(`gh pr edit ${prLinks.production} --body "${buildPrBody()}"`);
    await exec(`gh pr edit ${prLinks.preprod} --body "${buildPrBody()}"`);
    await exec(`gh pr edit ${prLinks.develop} --body "${buildPrBody()}"`);

    console.log(chalk.green(`✔️ PRs updated.\r\n`));
}

/**
 * Creates a string for the PR description.
 * @returns string The full PR description.
 */
function buildPrBody() {
    const jiraTicketList = prProps.ticketIdSet.map(
        (ticketId) =>
            `\n- https://alleyinteractive.atlassian.net/browse/${ticketId}`
    );
    return `## Summary\n${prProps.summary}\r\n## Ticket(s)${jiraTicketList}\r\n## Related Pull Requests:\n_Production_: ${prLinks.production}\n_Preprod_: ${prLinks.preprod}\n_Develop_: ${prLinks.develop}`;
}
