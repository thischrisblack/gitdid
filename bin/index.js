#! /usr/bin/env node

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const readline = require('readline');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});
const chalk = require('chalk');

/**
 * Branch my_feature_branch from production exists and is pushed already
 * 
 * If a PR for my_feature_branch does NOT exist, then this is the first time running gitdid
 * *
 * * CREATE flow
 * *
 * * Prompt for prProps
 * *
 * * PRODUCTION
 * * Create PR to production using prProps
 * * Store PR id
 * *
 * * DEVELOP
 * * Create my_feature_branch-DEVELOP from my_feature_branch
 * * Create PR to develop using prProps
 * * Store PR id
 * *
 * * PREPROD
 * * Create my_feature_branch-PREPROD from my_feature_branch
 * * Create PR to preprod using prProps
 * * Store PR id
 * 
 * If a PR for my_feature_branch DOES exist, then we create a new PR for develop and update PREPROD
 * *
 * * UPDATE FLOW
 * *
 * * Get the title & description from the response to gh pr view my_feature_branch
 * * You'll have to use regex
 * * The description goes from the '--' to the end.
 * * Store them.
 * *
 * * DEVELOP
 * * Create my_feature_branch-DEVELOP from my_feature_branch
 * * Create PR to develop using prProps
 * * Store PR id
 * *
 * * Fetch PR ids of preduction and preprod and store them
 * *
 * * PREPROD
 * * Merge my_feature_branch into my_feature_branch-PREPROD
 * 
 * IN EITHER CASE: 
 * 
 * PR TITLE/DESCRIPTION UPDATE
 * Go to each PR and update the title and description, appending the three PR links at the end. 
 * 
 */

const prProps = {
	ticketId: '',
	title: '',
	description: '',
};

const getInput = (function () {
	const getLineGen = (async function* () {
		for await (const line of rl) {
			yield line;
		}
	})();
	return async () => (await getLineGen.next()).value;
})();

async function runCommands() {
	try {
		const { stdout } = await exec('gh pr view my_feature_branch');
		console.log(stdout.split('--')[1].split('\r\n_Develop_: ')[1]);
	} catch (e) {
		console.log(e);
	}
}

const main = async () => {
	// console.log('blah');
	// prProps.ticketId = await getInput();
	// console.log('PR Title:');
	// prProps.title = await getInput();
	// console.log('PR Description:');
	// prProps.description = await getInput();
	// console.log(prProps);
	await runCommands();
};

main().then(() => process.exit(0));

