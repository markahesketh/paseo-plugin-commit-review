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

Paseo 0.11.1 or later. You also need `npm` on the daemon host, because the install runs `npm ci`.

## Install

```bash
paseo plugin add git:markahesketh/paseo-plugin-commit-review
```

## Use

Open the panel from an agent. You can use either of these:

- ⌘K → **Review a commit**
- the `/review-commit` slash command

The panel opens in the Explorer, next to Files and Changes. It sends the review to the agent you opened it from.

## Behaviour to know

- Each agent has its own draft comments. Drafts stay in memory in the plugin process. You lose them if the plugin reloads or the daemon restarts. They are also deleted when the agent closes.
- Paseo has no "commit" review mode. So each commit is sent as a `base` review of the range `<sha>^..<sha>`. If you comment on more than one commit, the plugin sends one review for each commit.
- If you amend or rebase a commit after you comment on it, its comments are not sent. The footer counts them, and **Discard** deletes them.
- The diff does not show binary files or files with more than 5,000 changed lines.

## Develop

```bash
npm install
npm run typecheck
npm test
paseo plugin add ./            # once
paseo plugin reload commit-review
```

The tests run `git` against temporary repositories. They do not read your global git config.
