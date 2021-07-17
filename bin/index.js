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
 * 
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
		const { stdout } = await exec('gh pr status');
		console.log(`stdout:\n${stdout}`);
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

