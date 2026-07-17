# Claude Code Action for Gitea

![Claude Code Action in action](assets/preview.png)

A Gitea action that provides a general-purpose [Claude Code](https://claude.ai/code) assistant for PRs and issues that can answer questions and implement code changes. It listens for a trigger phrase in comments and activates Claude to act on the request. Supports multiple authentication methods including Anthropic direct API, Amazon Bedrock, and Google Vertex AI.

> **Note**: This action is designed specifically for Gitea installations, using local git operations for optimal compatibility with Gitea's API capabilities.

## Features

- 🤖 **Interactive Code Assistant**: Claude can answer questions about code, architecture, and programming
- 🔍 **Code Review**: Analyzes PR changes and suggests improvements
- ✨ **Code Implementation**: Can implement simple fixes, refactoring, and even new features
- 💬 **PR/Issue Integration**: Works seamlessly with Gitea comments and PR reviews
- 🛠️ **Flexible Tool Access**: Access to Gitea APIs and file operations (additional tools can be enabled via configuration)
- 📋 **Progress Tracking**: Visual progress indicators with checkboxes that dynamically update as Claude completes tasks

## Setup

**Requirements**: You must be a repository admin to complete these steps.

1. Add `ANTHROPIC_API_KEY` to your repository secrets
2. Add `GITEA_TOKEN` to your repository secrets (a personal access token with repository read/write permissions)
3. Copy the workflow file from [`examples/gitea-claude.yml`](./examples/gitea-claude.yml) into your repository's `.gitea/workflows/`

## Usage

Add a workflow file to your repository (e.g., `.gitea/workflows/claude.yml`):

```yaml
name: Claude Assistant
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned, labeled]
  pull_request_review:
    types: [submitted]

jobs:
  claude-response:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: markwylde/claude-code-gitea-action@v1.0.5
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }} # if you want to use direct API
          gitea_token: ${{ secrets.GITEA_TOKEN }} # could be another users token (specific Claude user?)
          claude_git_name: Claude # optional
          claude_git_email: claude@anthropic.com # optional
```

## Inputs

| Input                 | Description                                                                                                                  | Required | Default                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| `anthropic_api_key`   | Anthropic API key (required for direct API, not needed for Bedrock/Vertex) | No\*     | -                      |
| `claude_code_oauth_token` | Claude Code OAuth token (alternative to anthropic_api_key) | No       | -                      |
| `direct_prompt`       | Direct prompt for Claude to execute automatically without needing a trigger (for automated workflows)                        | No       | -                      |
| `timeout_minutes`     | Timeout in minutes for execution                                                                                             | No       | `30`                   |
| `gitea_token`         | Gitea token for Claude to operate with. **Only include this if you're connecting a custom GitHub app of your own!**          | No       | -                      |
| `model`               | Model to use (provider-specific format required for Bedrock/Vertex)                                                          | No       | -                      |
| `anthropic_model`     | **DEPRECATED**: Use `model` instead. Kept for backward compatibility.                                                        | No       | -                      |
| `use_bedrock`         | Use Amazon Bedrock with OIDC authentication instead of direct Anthropic API                                                  | No       | `false`                |
| `use_vertex`          | Use Google Vertex AI with OIDC authentication instead of direct Anthropic API                                                | No       | `false`                |
| `allowed_tools`       | Additional tools for Claude to use (the base GitHub tools will always be included)                                           | No       | ""                     |
| `disallowed_tools`    | Tools that Claude should never use                                                                                           | No       | ""                     |
| `custom_instructions` | Additional custom instructions to include in the prompt for Claude                                                           | No       | ""                     |
| `assignee_trigger`    | The assignee username that triggers the action (e.g. @claude). Only used for issue and PR assignment                                | No       | -                      |
| `trigger_phrase`      | The trigger phrase to look for in comments, issue/PR bodies, and issue titles                                                | No       | `@claude`              |
| `claude_git_name`     | Git user.name for commits made by Claude                                                                                     | No       | `Claude`               |
| `claude_git_email`    | Git user.email for commits made by Claude                                                                                    | No       | `claude@anthropic.com` |

\*Required when using direct Anthropic API (default and when not using Bedrock or Vertex)

> **Note**: This action is currently in beta. Features and APIs may change as we continue to improve the integration.

## Gitea Configuration

This action has been enhanced to work with Gitea installations. The main differences from GitHub are:

1. **Local Git Operations**: Instead of using API-based file operations (which have limited support in Gitea), this action uses local git commands to create branches, commit files, and push changes.

2. **API URL Configuration**: You must specify your Gitea server URL using the `gitea_api_url` input.

3. **Custom Server URL**: For Gitea instances running in containers, you can override link generation using the `GITEA_SERVER_URL` environment variable.

### Custom Server URL Configuration

When running Gitea in containers, the action may generate links using internal container URLs (e.g., `http://gitea:3000`) instead of your public URL. To fix this, set the `GITEA_SERVER_URL` environment variable:

```yaml
- uses: markwylde/claude-code-gitea-action@v1.0.5
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    gitea_token: ${{ secrets.GITEA_TOKEN }}
  env:
    # Override the internal container URL with your public URL
    GITEA_SERVER_URL: https://gitea.example.com
```

**How it works:**
- The action first checks for `GITEA_SERVER_URL` (user-configurable)
- Falls back to `GITHUB_SERVER_URL` (automatically set by Gitea Actions)
- Uses `https://github.com` as final fallback

This ensures that all links in Claude's comments (job runs, branches, etc.) point to your public Gitea instance instead of internal container addresses.

See [`examples/gitea-custom-url.yml`](./examples/gitea-custom-url.yml) for a complete example.

### Gitea Setup Notes

- Use a Gitea personal access token "GITEA_TOKEN"
- The token needs repository read/write permissions
- Claude will use local git operations for file changes and branch creation
- Only PR creation and comment updates use the Gitea API

## Examples

### Ways to Tag @claude

These examples show how to interact with Claude using comments in PRs and issues. By default, Claude will be triggered anytime you mention `@claude`, but you can customize the exact trigger phrase using the `trigger_phrase` input in the workflow.

Claude will see the full PR context, including any comments.

#### Ask Questions

Add a comment to a PR or issue:

```
@claude What does this function do and how could we improve it?
```

Claude will analyze the code and provide a detailed explanation with suggestions.

#### Request Fixes

Ask Claude to implement specific changes:

```
@claude Can you add error handling to this function?
```

#### Code Review

Get a thorough review:

```
@claude Please review this PR and suggest improvements
```

Claude will analyze the changes and provide feedback.

#### Fix Bugs from Screenshots

Upload a screenshot of a bug and ask Claude to fix it:

```
@claude Here's a screenshot of a bug I'm seeing [upload screenshot]. Can you fix it?
```

Claude can see and analyze images, making it easy to fix visual bugs or UI issues.

### Custom Automations

These examples show how to configure Claude to act automatically based on Gitea events, without requiring manual @mentions.

#### Supported Gitea Events

This action supports the following Gitea events:

- `pull_request` - When PRs are opened or synchronized
- `issue_comment` - When comments are created on issues or PRs
- `pull_request_comment` - When comments are made on PR diffs
- `issues` - When issues are opened or assigned
- `pull_request_review` - When PR reviews are submitted
- `pull_request_review_comment` - When comments are made on PR reviews
- `repository_dispatch` - Custom events triggered via API (coming soon)
- `workflow_dispatch` - Manual workflow triggers (coming soon)

#### Automated Documentation Updates

Automatically update documentation when specific files change (see [`examples/claude-pr-path-specific.yml`](./examples/claude-pr-path-specific.yml)):

```yaml
on:
  pull_request:
    paths:
      - "src/api/**/*.ts"

steps:
  - uses: markwylde/claude-code-gitea-action@v1.0.5
    with:
      direct_prompt: |
        Update the API documentation in README.md to reflect
        the changes made to the API endpoints in this PR.
```

When API files are modified, Claude automatically updates your README with the latest endpoint documentation and pushes the changes back to the PR, keeping your docs in sync with your code.

#### Author-Specific Code Reviews

Automatically review PRs from specific authors or external contributors (see [`examples/claude-review-from-author.yml`](./examples/claude-review-from-author.yml)):

```yaml
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review-by-author:
    if: |
      github.event.pull_request.user.login == 'developer1' ||
      github.event.pull_request.user.login == 'external-contributor'
    steps:
      - uses: markwylde/claude-code-gitea-action@v1
        with:
          direct_prompt: |
            Please provide a thorough review of this pull request.
            Pay extra attention to coding standards, security practices,
            and test coverage since this is from an external contributor.
```

Perfect for automatically reviewing PRs from new team members, external contributors, or specific developers who need extra guidance.

#### Custom Prompt Templates

Use `override_prompt` for complete control over Claude's behavior with variable substitution:

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    override_prompt: |
      Analyze PR #$PR_NUMBER in $REPOSITORY for security vulnerabilities.

      Changed files:
      $CHANGED_FILES

      Focus on:
      - SQL injection risks
      - XSS vulnerabilities
      - Authentication bypasses
      - Exposed secrets or credentials

      Provide severity ratings (Critical/High/Medium/Low) for any issues found.
```

The `override_prompt` feature supports these variables:

- `$REPOSITORY`, `$PR_NUMBER`, `$ISSUE_NUMBER`
- `$PR_TITLE`, `$ISSUE_TITLE`, `$PR_BODY`, `$ISSUE_BODY`
- `$PR_COMMENTS`, `$ISSUE_COMMENTS`, `$REVIEW_COMMENTS`
- `$CHANGED_FILES`, `$TRIGGER_COMMENT`, `$TRIGGER_USERNAME`
- `$BRANCH_NAME`, `$BASE_BRANCH`, `$EVENT_TYPE`, `$IS_PR`

## How It Works

1. **Trigger Detection**: Listens for comments containing the trigger phrase (default: `@claude`) or issue assignment to a specific user
2. **Context Gathering**: Analyzes the PR/issue, comments, code changes
3. **Smart Responses**: Either answers questions or implements changes
4. **Branch Management**: Creates new PRs for human authors, pushes directly for Claude's own PRs
5. **Communication**: Posts updates at every step to keep you informed

This action is built specifically for Gitea environments with local git operations support.

## Capabilities and Limitations

### What Claude Can Do

- **Respond in a Single Comment**: Claude operates by updating a single initial comment with progress and results
- **Answer Questions**: Analyze code and provide explanations
- **Implement Code Changes**: Make simple to moderate code changes based on requests
- **Prepare Pull Requests**: Creates commits on a branch and links back to a prefilled PR creation page
- **Perform Code Reviews**: Analyze PR changes and provide detailed feedback
- **Smart Branch Handling**:
  - When triggered on an **issue**: Always creates a new branch for the work
  - When triggered on an **open PR**: Always pushes directly to the existing PR branch
  - When triggered on a **closed PR**: Creates a new branch since the original is no longer active
- **View GitHub Actions Results**: Can access workflow runs, job logs, and test results on the PR where it's tagged when `actions: read` permission is configured (see [Additional Permissions for CI/CD Integration](#additional-permissions-for-cicd-integration))

### What Claude Cannot Do

- **Submit PR Reviews**: Claude cannot submit formal Gitea PR reviews
- **Approve PRs**: For security reasons, Claude cannot approve pull requests
- **Post Multiple Comments**: Claude only acts by updating its initial comment
- **Execute Commands Outside Its Context**: Claude only has access to the repository and PR/issue context it's triggered in
- **Run Arbitrary Bash Commands**: By default, Claude cannot execute Bash commands unless explicitly allowed using the `allowed_tools` configuration
- **Perform Branch Operations**: Cannot merge branches, rebase, or perform other git operations beyond pushing commits

## Advanced Configuration

### Additional Permissions for CI/CD Integration

The `additional_permissions` input allows Claude to access GitHub Actions workflow information when you grant the necessary permissions. This is particularly useful for analyzing CI/CD failures and debugging workflow issues.

#### Enabling GitHub Actions Access

To allow Claude to view workflow run results, job logs, and CI status:

1. **Grant the necessary permission to your GitHub token**:

   - When using the default `GITHUB_TOKEN`, add the `actions: read` permission to your workflow:

   ```yaml
   permissions:
     contents: write
     pull-requests: write
     issues: write
     actions: read # Add this line
   ```

2. **Configure the action with additional permissions**:

   ```yaml
   - uses: anthropics/claude-code-action@beta
     with:
       anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
       additional_permissions: |
         actions: read
       # ... other inputs
   ```

3. **Claude will automatically get access to CI/CD tools**:
   When you enable `actions: read`, Claude can use the following MCP tools:
   - `mcp__github_ci__get_ci_status` - View workflow run statuses
   - `mcp__github_ci__get_workflow_run_details` - Get detailed workflow information
   - `mcp__github_ci__download_job_log` - Download and analyze job logs

#### Example: Debugging Failed CI Runs

```yaml
name: Claude CI Helper
on:
  issue_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write
  issues: write
  actions: read # Required for CI access

jobs:
  claude-ci-helper:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@beta
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          additional_permissions: |
            actions: read
          # Now Claude can respond to "@claude why did the CI fail?"
```

**Important Notes**:

- The GitHub token must have the `actions: read` permission in your workflow
- If the permission is missing, Claude will warn you and suggest adding it
- Currently, only `actions: read` is supported, but the format allows for future extensions

### Custom Environment Variables

You can pass custom environment variables to Claude Code execution using the `claude_env` input. This is useful for CI/test setups that require specific environment variables:

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    claude_env: |
      NODE_ENV: test
      CI: true
      DATABASE_URL: postgres://test:test@localhost:5432/test_db
    # ... other inputs
```

The `claude_env` input accepts YAML format where each line defines a key-value pair. These environment variables will be available to Claude Code during execution, allowing it to run tests, build processes, or other commands that depend on specific environment configurations.

### Limiting Conversation Turns

You can use the `max_turns` parameter to limit the number of back-and-forth exchanges Claude can have during task execution. This is useful for:

- Controlling costs by preventing runaway conversations
- Setting time boundaries for automated workflows
- Ensuring predictable behavior in CI/CD pipelines

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    max_turns: "5" # Limit to 5 conversation turns
    # ... other inputs
```

When the turn limit is reached, Claude will stop execution gracefully. Choose a value that gives Claude enough turns to complete typical tasks while preventing excessive usage.

### Custom Tools

By default, Claude only has access to:

- File operations (reading, committing, editing files, read-only git commands)
- Comment management (creating/updating comments)
- Basic Gitea operations

Claude does **not** have access to execute arbitrary Bash commands by default. If you want Claude to run specific commands (e.g., npm install, npm test), you must explicitly allow them using the `allowed_tools` configuration:

**Note**: If your repository has a `.mcp.json` file in the root directory, Claude will automatically detect and use the MCP server tools defined there. However, these tools still need to be explicitly allowed via the `allowed_tools` configuration.

```yaml
- uses: markwylde/claude-code-gitea-action@v1
  with:
    allowed_tools: |
      Bash(npm install)
      Bash(npm run test)
      Edit
      Replace
      NotebookEditCell
    disallowed_tools: |
      TaskOutput
      KillTask
    # ... other inputs
```

**Note**: The base Gitea tools are always included. Use `allowed_tools` to add additional tools (including specific Bash commands), and `disallowed_tools` to prevent specific tools from being used.

### Custom Model

Use a specific Claude model:

```yaml
- uses: markwylde/claude-code-gitea-action@v1
  with:
    # model: "claude-3-5-sonnet-20241022"  # Optional: specify a different model
    # ... other inputs
```

### Network Restrictions

For enhanced security, you can restrict Claude's network access to specific domains only. This feature is particularly useful for:

- Enterprise environments with strict security policies
- Preventing access to external services
- Limiting Claude to only your internal APIs and services

When `experimental_allowed_domains` is set, Claude can only access the domains you explicitly list. You'll need to include the appropriate provider domains based on your authentication method.

#### Provider-Specific Examples

##### If using Anthropic API or subscription

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    # Or: claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    experimental_allowed_domains: |
      .anthropic.com
```

##### If using AWS Bedrock

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    use_bedrock: "true"
    experimental_allowed_domains: |
      bedrock.*.amazonaws.com
      bedrock-runtime.*.amazonaws.com
```

##### If using Google Vertex AI

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    use_vertex: "true"
    experimental_allowed_domains: |
      *.googleapis.com
      vertexai.googleapis.com
```

#### Common GitHub Domains

In addition to your provider domains, you may need to include GitHub-related domains. For GitHub.com users, common domains include:

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    experimental_allowed_domains: |
      .anthropic.com  # For Anthropic API
      .github.com
      .githubusercontent.com
      ghcr.io
      .blob.core.windows.net
```

For GitHub Enterprise users, replace the GitHub.com domains above with your enterprise domains (e.g., `.github.company.com`, `packages.company.com`, etc.).

To determine which domains your workflow needs, you can temporarily run without restrictions and monitor the network requests, or check your GitHub Enterprise configuration for the specific services you use.

### Claude Code Settings

You can provide Claude Code settings to customize behavior such as model selection, environment variables, permissions, and hooks. Settings can be provided either as a JSON string or a path to a settings file.

#### Option 1: Settings File

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    settings: "path/to/settings.json"
    # ... other inputs
```

#### Option 2: Inline Settings

```yaml
- uses: anthropics/claude-code-action@beta
  with:
    settings: |
      {
        "model": "claude-opus-4-20250514",
        "env": {
          "DEBUG": "true",
          "API_URL": "https://api.example.com"
        },
        "permissions": {
          "allow": ["Bash", "Read"],
          "deny": ["WebFetch"]
        },
        "hooks": {
          "PreToolUse": [{
            "matcher": "Bash",
            "hooks": [{
              "type": "command",
              "command": "echo Running bash command..."
            }]
          }]
        }
      }
    # ... other inputs
```

The settings support all Claude Code settings options including:

- `model`: Override the default model
- `env`: Environment variables for the session
- `permissions`: Tool usage permissions
- `hooks`: Pre/post tool execution hooks
- And more...

For a complete list of available settings and their descriptions, see the [Claude Code settings documentation](https://docs.anthropic.com/en/docs/claude-code/settings).

**Notes**:

- The `enableAllProjectMcpServers` setting is always set to `true` by this action to ensure MCP servers work correctly.
- If both the `model` input parameter and a `model` in settings are provided, the `model` input parameter takes precedence.
- The `allowed_tools` and `disallowed_tools` input parameters take precedence over `permissions` in settings.
- In a future version, we may deprecate individual input parameters in favor of using the settings file for all configuration.

## Cloud Providers

You can authenticate with Claude using any of these methods:

1. **Direct Anthropic API** (default) - Use your Anthropic API key
2. **Claude Code OAuth Token** - Use OAuth token from Claude Code application

### Using Claude Code OAuth Token

If you have access to [Claude Code](https://claude.ai/code), you can use OAuth authentication instead of an API key:

1. **Generate OAuth Token**: run the following command and follow instructions:
   ```
   claude setup-token
   ```
   This will generate an OAuth token that you can use for authentication.

2. **Add Token to Repository**: Add the generated token as a repository secret named `CLAUDE_CODE_OAUTH_TOKEN`.

3. **Configure Workflow**: Use the OAuth token in your workflow:

```yaml
- uses: markwylde/claude-code-gitea-action@v1.0.5
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    gitea_token: ${{ secrets.GITEA_TOKEN }}
```

When `claude_code_oauth_token` is provided, it will be used instead of `anthropic_api_key` for authentication.

## Security

### Access Control

- **Repository Access**: The action can only be triggered by users with write access to the repository
- **No Bot Triggers**: Bots cannot trigger this action
- **Token Permissions**: The Gitea token is scoped specifically to the repository it's operating in
- **No Cross-Repository Access**: Each action invocation is limited to the repository where it was triggered
- **Limited Scope**: The token cannot access other repositories or perform actions beyond the configured permissions

### Gitea Token Permissions

The Gitea personal access token requires these permissions:

- **Pull Requests**: Read and write to create PRs and push changes
- **Issues**: Read and write to respond to issues
- **Contents**: Read and write to modify repository files

### Authentication Security

**⚠️ IMPORTANT: Never commit API keys directly to your repository! Always use Gitea Actions secrets.**

To securely use your Anthropic API key:

1. Add your API key as a repository secret:

   - Go to your repository's Settings
   - Navigate to "Secrets and variables" → "Actions"
   - Click "New repository secret"
   - Name it `ANTHROPIC_API_KEY`
   - Paste your API key as the value

2. Reference the secret in your workflow:
   ```yaml
   anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

**Never do this:**

```yaml
# ❌ WRONG - Exposes your API key
anthropic_api_key: "sk-ant-..."
```

**Always do this:**

```yaml
# ✅ CORRECT - Uses Gitea secrets
anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

This applies to all sensitive values including API keys, access tokens, and credentials.

## License

This project is licensed under the MIT License—see the LICENSE file for details.
