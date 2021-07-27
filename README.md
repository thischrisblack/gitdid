# gitdid

A CLI tool to manage complex GitHub workflows.

This is very much a work-in-progress, so excuse the mess in all its imperative and stateful glory. Also note, this is very specific to my team's current deployment workflow, so your needs will definitely vary! But you get the idea.

### Installation

- Fork this repo to your development machine.
- From the root of this repo, run:

`npm install -g .`

**Important:** You will also need the [GitHub CLI](https://cli.github.com/) if you don't have it already. Find installation instructions [here](https://github.com/cli/cli#installation). If it prompts you to choose https or SSH, I used https and it worked fine. **Don't forget to authorize it!** Instructions [here](https://cli.github.com/manual/gh_auth_login). I used the browser to authenticate.

### Usage

Create a feature branch from `production` (e.g. `my_feature_branch`) and do your work in it as usual. Once finished, commit your changes and push them. Like this:

```
git checkout production
git pull origin production
git checkout my_feature_branch
// work work work
git add .
git commit -m "Wow great feature."
git push origin my_feature_branch
```

Then, still in your project and on `my_feature_branch`, run `gitdid` from the command line.

```
gitdid
```

After running checks for potential merge conflicts, this will create new feature branches for your `develop` and `preprod` branches (e.g. `my_feature_branch-develop` etc.), and open new pull requests for all three branches on GitHub.

If you make changes to `my_feature_branch`, you can propagate these changes to the other branches and update the PRs simply by running `gitdid` again (after you've commited and pushed your changes to `my_feature_branch`, of course).

If the PRs on `develop` or `preprod` get merged and changes are required afterwards (i.e. requests in code review, QA, or UAT), simply do the required work on `my_feature_branch` and run `gitdid` again. It will open new PRs on the branches with closed PRs, and update the still-open PRs.

### To Do

This code is pretty imperative and stateful right now, as it is a literal translation of the process. Naturally I'd like to clean it up and abstract the logic a bit as the requirements become more clear. It also needs more consistent error catching and handling. However, it works (!!!) and it's a good start.