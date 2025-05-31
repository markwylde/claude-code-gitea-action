# Migration Guide: Pure Actions & Gitea Compatibility

This document outlines the changes made to migrate from GitHub App authentication to pure GitHub Actions and add Gitea compatibility.

## What Changed

### 1. Removed GitHub App Dependencies

- **Before**: Used OIDC token exchange with Anthropic's GitHub App service
- **After**: Uses standard `GITHUB_TOKEN` from workflow environment
- **Benefit**: No external dependencies, works with any Git provider

### 2. Self-Contained Implementation

- **Before**: Depended on external `anthropics/claude-code-base-action`
- **After**: Includes built-in Claude execution engine
- **Benefit**: Complete control over functionality, no external action dependencies

### 3. Gitea Compatibility

- **Before**: GitHub-specific triggers and authentication
- **After**: Compatible with Gitea Actions (with some limitations)
- **Benefit**: Works with self-hosted Gitea instances

## Required Changes for Existing Users

### Workflow Permissions

Update your workflow permissions:

```yaml
# Before (GitHub App)
permissions:
  contents: read
  pull-requests: read
  issues: read
  id-token: write

# After (Pure Actions)
permissions:
  contents: write
  pull-requests: write
  issues: write
```

### Required Token Input

Now required to explicitly provide a GitHub token:

```yaml
# Before (optional)
- uses: anthropics/claude-code-action@beta
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}

# After (required)
- uses: anthropics/claude-code-action@beta
  with:
    gitea_token: ${{ secrets.GITHUB_TOKEN }}
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Gitea Setup

### 1. Basic Gitea Workflow

Use the example in `examples/gitea-claude.yml`:

```yaml
name: Claude Assistant for Gitea

on:
  issue_comment:
    types: [created]
  issues:
    types: [opened, assigned]

jobs:
  claude-assistant:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'issues' && contains(github.event.issue.body, '@claude'))
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude Assistant
        uses: ./ # Adjust path as needed for your Gitea setup
        with:
          gitea_token: ${{ secrets.GITHUB_TOKEN }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 2. Gitea Limitations

Be aware of these Gitea Actions limitations:

- **`issue_comment` on PRs**: May not trigger reliably in some Gitea versions
- **`pull_request_review_comment`**: Limited support compared to GitHub
- **GraphQL API**: Not supported - action automatically falls back to REST API
- **Cross-repository access**: Token permissions may be more restrictive
- **Workflow triggers**: Some advanced trigger conditions may not work
- **Permission checking**: Simplified for Gitea compatibility

### 3. Gitea Workarounds

#### For PR Comments

Use `issue_comment` instead of `pull_request_review_comment`:

```yaml
on:
  issue_comment:
    types: [created] # This covers both issue and PR comments
```

#### For Code Review Comments

Gitea has limited support for code review comment webhooks. Consider using:

- Regular issue comments on PRs
- Manual trigger via issue assignment
- Custom webhooks (advanced setup)

## Benefits of Migration

### 1. Simplified Authentication

- No OIDC token setup required
- Uses standard workflow tokens
- Works with custom GitHub tokens

### 2. Provider Independence

- No dependency on Anthropic's GitHub App service
- Works with any Git provider supporting Actions
- Self-contained functionality

### 3. Enhanced Control

- Direct control over Claude execution
- Customizable tool management
- Easier debugging and modifications

### 4. Gitea Support

- Compatible with self-hosted Gitea
- Automatic fallback to REST API (no GraphQL dependency)
- Simplified permission checking for Gitea environments
- Reduced external dependencies
- Standard Actions workflow patterns

## Troubleshooting

### Common Issues

#### 1. Token Permissions

**Error**: "GitHub token authentication failed"
**Solution**: Ensure workflow has required permissions:

```yaml
permissions:
  contents: write
  pull-requests: write
  issues: write
```

#### 2. Gitea Trigger Issues

**Error**: Workflow not triggering on PR comments
**Solution**: Use `issue_comment` instead of `pull_request_review_comment`

#### 3. Missing Dependencies

**Error**: "Module not found" or TypeScript errors
**Solution**: Run `npm install` or `bun install` to update dependencies

### Gitea-Specific Issues

#### 1. Authentication Errors

**Error**: "Failed to check permissions: HttpError: Bad credentials"
**Solution**: This is normal in Gitea environments. The action automatically detects Gitea and bypasses GitHub-specific permission checks.

#### 1a. User Profile API Errors

**Error**: "Prepare step failed with error: Visit Project" or "GET /users/{username} - 404"
**Solution**: This occurs when Gitea's user profile API differs from GitHub's. The action automatically detects Gitea and skips user type validation.

#### 2. Limited Event Support

Some GitHub Events may not be fully supported in Gitea. Use basic triggers:

- `issue_comment` for comments
- `issues` for issue events
- `push` for code changes

#### 3. Token Scope Limitations

Gitea tokens may have different scope limitations. Ensure your Gitea instance allows:

- Repository write access
- Issue/PR comment creation
- Branch creation and updates

#### 4. GraphQL Not Supported

**Error**: GraphQL queries failing
**Solution**: The action automatically detects Gitea and uses REST API instead of GraphQL. No manual configuration needed.

## Migration Checklist

- [ ] Update workflow permissions to include `write` access
- [ ] Add `github_token` input to action configuration
- [ ] Remove `id-token: write` permission if not used elsewhere
- [ ] Test with GitHub Actions
- [ ] Test with Gitea Actions (if applicable)
- [ ] Update any custom triggers for Gitea compatibility
- [ ] Verify token permissions in target environment

## Example Workflows

See the `examples/` directory for complete workflow examples:

- `claude.yml` - Updated GitHub Actions workflow
- `gitea-claude.yml` - Gitea-compatible workflow
