# Commit review for Paseo

A [Paseo](https://paseo.sh) plugin to review one commit and send line comments to an agent.

Paseo's own review covers uncommitted changes or a whole branch against its base. When a branch has thousands of changed lines and you only want to review the last commit, use this plugin instead. It shows only the changes in the commit you select.

## Features

- Select a commit from the last 100 commits in the workspace.
- See the commit's diff with Paseo's syntax highlighter and diff colours.
- Click a line, or the + on its line number, to add a comment.
  - Enter submits the comment.
  - Shift+Enter adds a new line.
  - Escape cancels.
  - On mobile, the return key submits.
- Edit or delete comments before you send them.
- Send all comments to the agent as a native Paseo review attachment. The chat shows the usual Review pill. If the agent is working, the review steers into the current turn.

## Requirements

Paseo 0.11.x. You also need `npm` on the daemon host, because the install runs `npm ci`.

## Install

```bash
paseo plugin add git:markahesketh/paseo-plugin-commit-review
```

## Use

Open the panel in one of these ways:

- In the Explorer, click **+** and then **Commit review**.
- From an agent, use ⌘K → **Review a commit**.
- From an agent, use the `/review-commit` slash command.

The panel opens in the Explorer, next to Files and Changes. You choose the agent that gets the review next to the **Send** button. If you open the panel from an agent, that agent is selected. If not, the agent you last picked for the workspace is selected, or else the most recently updated agent.

## Behaviour to know

- Draft comments belong to the workspace. They stay in memory in the plugin process. You lose them if the plugin reloads or the daemon restarts. They are also deleted when the workspace is archived.
- Paseo has no "commit" review mode. So each commit is sent as a `base` review of the range from its first parent to the commit, using full SHAs. A root commit is compared with the empty tree. If you comment on more than one commit, the plugin sends one review for each commit.
- Comments are sent only for commits that are still in the current branch's history. If you amend or rebase a commit, or switch branch, after you comment on it, its comments are not sent. The footer counts them, and **Discard** deletes only those comments.
- The diff does not show binary files or files with more than 5,000 diff lines. In a very large commit, files past the first 1,000,000 characters of diff are not shown, and files past the first 2 MB of source have no syntax highlighting.

## Develop

```bash
npm install
npm run typecheck
npm test
paseo plugin add ./            # once
paseo plugin reload commit-review
```

The tests run `git` against temporary repositories and sign commits with `ssh-keygen`. They do not read your global git config.

`node --no-warnings bench/large-commit.ts many` measures the diff of a 2,000-file commit.
