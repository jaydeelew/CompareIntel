# GitHub Secrets Configuration Guide

This guide explains how to configure the required secrets in your GitHub repository settings to eliminate linter warnings and enable CI/CD workflows.

## Overview

The GitHub Actions workflows require several secrets to be configured in your repository settings. These secrets are used for:
- E2E testing with Playwright
- Visual regression testing
- API authentication for test environments

## Required Secrets

The following secrets must be configured:

1. `TEST_OPENROUTER_API_KEY` - API key for OpenRouter (used in E2E tests)
2. `TEST_FREE_EMAIL` - Test user email (free tier account)
3. `TEST_FREE_PASSWORD` - Test user password (free tier account)
4. `TEST_ADMIN_EMAIL` - Admin test user email
5. `TEST_ADMIN_PASSWORD` - Admin test user password

## Step-by-Step Instructions

### 1. Navigate to Repository Settings

1. Go to your GitHub repository on GitHub.com
2. Click on the **Settings** tab (located at the top of the repository page)
3. In the left sidebar, click on **Secrets and variables** → **Actions**

### 2. Add a New Secret

For each secret listed above, follow these steps:

1. Click the **New repository secret** button
2. In the **Name** field, enter the exact secret name (e.g., `TEST_OPENROUTER_API_KEY`)
3. In the **Secret** field, enter the secret value
4. Click **Add secret**

### 3. Configure Each Secret

#### TEST_OPENROUTER_API_KEY

- **Purpose**: API key for OpenRouter service used in E2E tests
- **How to obtain**:
  1. Sign up or log in to [OpenRouter](https://openrouter.ai/)
  2. Navigate to your API keys section
  3. Create a new API key or copy an existing one
  4. Use this key as the secret value

#### TEST_FREE_EMAIL

- **Purpose**: Email address for a test user account (free tier)
- **How to obtain**: Create a test account in your application or use an existing test email
- **Note**: This should be a dedicated test account, not a production account

#### TEST_FREE_PASSWORD

- **Purpose**: Password for the free tier test user account
- **How to obtain**: Use the password associated with `TEST_FREE_EMAIL`
- **Security Note**: Use a strong password even for test accounts

#### TEST_ADMIN_EMAIL

- **Purpose**: Email address for an admin test user account
- **How to obtain**: Create an admin test account in your application
- **Note**: This account should have admin privileges for testing admin-specific features

#### TEST_ADMIN_PASSWORD

- **Purpose**: Password for the admin test user account
- **How to obtain**: Use the password associated with `TEST_ADMIN_EMAIL`
- **Security Note**: Use a strong password even for test accounts

## Verification

After adding all secrets:

1. Navigate to **Settings** → **Secrets and variables** → **Actions**
2. Verify that all 5 secrets are listed:
   - ✅ `TEST_OPENROUTER_API_KEY`
   - ✅ `TEST_FREE_EMAIL`
   - ✅ `TEST_FREE_PASSWORD`
   - ✅ `TEST_ADMIN_EMAIL`
   - ✅ `TEST_ADMIN_PASSWORD`

## Testing the Configuration

1. Push a commit or create a pull request that triggers the CI workflows
2. Check the workflow runs in the **Actions** tab
3. E2E tests should run successfully with the configured secrets

**Note about Linter Warnings**: The linter warnings about "Context access might be invalid" for secrets are **expected and normal**. These are static analysis warnings that occur because the linter cannot verify that secrets exist in your repository settings. They are:
- **Warnings, not errors** - Workflows will run successfully
- **False positives** - They don't indicate actual problems
- **Common in GitHub Actions** - Most workflows using secrets will show these warnings
- **From VS Code Extension** - These warnings come from the GitHub Actions extension in VS Code/Cursor

**To Reduce Warnings**:
- The workflow files include comment blocks documenting all configured secrets
- An `.actionlintrc.yml` file documents secrets for actionlint users
- A `.vscode/settings.json` file includes notes about these warnings
- These warnings can be safely ignored - workflows will execute successfully

These warnings do not affect workflow execution and can be safely ignored once you've verified the secrets are configured correctly.

## Troubleshooting

### Secrets Not Found Error

If workflows fail with "secrets not found" errors:

1. Verify the secret names match exactly (case-sensitive)
2. Ensure you're adding secrets to the correct repository
3. Check that you have admin access to the repository (required to add secrets)

### Linter Warnings About Secrets

**Important**: The linter warnings about secret access are **expected and cannot be eliminated**. They occur because:

1. The linter performs static analysis and cannot access your repository settings
2. It cannot verify that secrets exist, so it warns about potential issues
3. These are warnings, not errors - workflows will run successfully

**You can safely ignore these warnings** as long as:
- Your workflows run successfully
- Secrets are configured in repository settings
- Tests execute without "secret not found" errors

### Workflow Still Fails

If workflows fail even after adding secrets:

1. Check the workflow logs in the **Actions** tab
2. Verify the secret values are correct (you can update them if needed)
3. Ensure the test accounts exist and are accessible
4. Verify the OpenRouter API key is valid and has the necessary permissions

## Security Best Practices

1. **Never commit secrets to the repository** - Always use GitHub Secrets
2. **Use dedicated test accounts** - Don't use production credentials
3. **Rotate secrets regularly** - Update test account passwords periodically
4. **Limit access** - Only grant repository admin access to trusted team members
5. **Monitor usage** - Review Actions logs regularly for any suspicious activity

## Updating Secrets

To update an existing secret:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Find the secret you want to update
3. Click the **Update** button (pencil icon)
4. Enter the new value
5. Click **Update secret**

## Removing Secrets

To remove a secret (if no longer needed):

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Find the secret you want to remove
3. Click the **Delete** button (trash icon)
4. Confirm the deletion

**Warning**: Removing a secret that is still referenced in workflows will cause those workflows to fail.

## Additional Resources

- [GitHub Actions Encrypted Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [GitHub Actions Security Best Practices](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)

## Support

If you encounter issues not covered in this guide:

1. Check the GitHub Actions documentation
2. Review workflow logs for specific error messages
3. Contact your repository administrator for assistance
