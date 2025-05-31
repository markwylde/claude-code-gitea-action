# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Development Tools

- Runtime: Bun 1.2.11

## Common Development Tasks

### Available npm/bun scripts from package.json:

```bash
# Test
bun test

# Formatting
bun run format          # Format code with prettier
bun run format:check    # Check code formatting
```

## Architecture Overview

This is a GitHub Action that enables Claude to interact with GitHub PRs and issues. The action:

1. **Trigger Detection**: Uses `check-trigger.ts` to determine if Claude should respond based on comment/issue content
2. **Context Gathering**: Fetches GitHub data (PRs, issues, comments) via `github-data-fetcher.ts` and formats it using `github-data-formatter.ts`
3. **AI Integration**: Supports multiple Claude providers (Anthropic API, AWS Bedrock, Google Vertex AI)
4. **Prompt Creation**: Generates context-rich prompts using `create-prompt.ts`
5. **MCP Server Integration**: Installs and configures GitHub MCP server for extended functionality

### Key Components

- **Trigger System**: Responds to `/claude` comments or issue assignments
- **Authentication**: OIDC-based token exchange for secure GitHub interactions
- **Cloud Integration**: Supports direct Anthropic API, AWS Bedrock, and Google Vertex AI
- **GitHub Operations**: Creates branches, posts comments, and manages PRs/issues

### Project Structure

```
src/
├── check-trigger.ts        # Determines if Claude should respond
├── create-prompt.ts        # Generates contextual prompts
├── github-data-fetcher.ts  # Retrieves GitHub data
├── github-data-formatter.ts # Formats GitHub data for prompts
├── install-mcp-server.ts  # Sets up GitHub MCP server
├── update-comment-with-link.ts # Updates comments with job links
└── types/
    └── github.ts          # TypeScript types for GitHub data
```

## Important Notes

- Actions are triggered by `@claude` comments or issue assignment unless a different trigger_phrase is specified
- The action creates branches for issues and pushes to PR branches directly
- All actions create OIDC tokens for secure authentication
- Progress is tracked through dynamic comment updates with checkboxes

## MCP Tool Development

When adding new MCP tools:

1. **Add to MCP Server**: Implement the tool in the appropriate MCP server file (e.g., `src/mcp/local-git-ops-server.ts`)
2. **Expose to Claude**: Add the tool name to `BASE_ALLOWED_TOOLS` array in `src/create-prompt/index.ts`
3. **Tool Naming**: Follow the pattern `mcp__server_name__tool_name` (e.g., `mcp__local_git_ops__checkout_branch`)
4. **Documentation**: Update the prompt's "What You CAN Do" section if the tool adds new capabilities

## Feature Development Reminders

When implementing new features that add action inputs, configuration options, or capabilities:
1. Always update README.md to document new inputs in the inputs table
2. Update example workflows to show how new inputs can be used
3. Add appropriate defaults and descriptions to action.yml
