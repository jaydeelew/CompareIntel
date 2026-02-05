# Git Workflow for Solo Developers

This guide describes the recommended Git workflow for solo developers working on CompareIntel. Using feature branches and pull requests provides better code quality, test protection, and project history management.

---

## Table of Contents

1. [Why Use Feature Branches + PRs?](#why-use-feature-branches--prs)
2. [Basic Workflow](#basic-workflow)
3. [Step-by-Step Guide](#step-by-step-guide)
4. [Branch Protection Setup](#branch-protection-setup)
5. [Workflow Variations](#workflow-variations)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

---

## Why Use Feature Branches + PRs?

### Benefits

- ✅ **Test Protection**: Tests run automatically on PRs before merging
- ✅ **Clean History**: Feature branches keep `master` stable and organized
- ✅ **Easy Rollback**: Can revert changes by closing PR or reverting merge
- ✅ **Self-Review**: Review your own changes before merging to catch issues
- ✅ **No Second Account Needed**: Create PRs from your own account to your own repository

### What Happens When Tests Fail?

**Important**: When you push a commit (directly or via PR), the code is **immediately** in the repository. Tests run **after** the push, so:

- ✅ **With PRs**: Failed tests prevent merging, keeping `master` clean
- ⚠️ **Direct Push**: Failed tests don't prevent the code from being in the repository

This is why feature branches + PRs are recommended - they provide a safety net.

---

## Basic Workflow

```
┌─────────────────┐
│  master branch  │ (protected, always stable)
└────────┬────────┘
         │
         │ git checkout -b feature/my-feature
         │
         ▼
┌─────────────────┐
│ feature branch  │ (your work)
└────────┬────────┘
         │
         │ git push origin feature/my-feature
         │
         ▼
┌─────────────────┐
│  Create PR      │ (tests run automatically)
└────────┬────────┘
         │
         │ Tests pass ✓
         │
         ▼
┌─────────────────┐
│  Merge to master│ (clean, tested code)
└─────────────────┘
```

---

## Step-by-Step Guide

### 1. Create a Feature Branch

```bash
# Make sure you're on master and up to date
git checkout master
git pull origin master

# Create and switch to a new feature branch
git checkout -b feature/my-new-feature

# Or use a more descriptive name:
git checkout -b feature/add-user-authentication
git checkout -b fix/resolve-login-bug
git checkout -b refactor/improve-api-structure
```

**Branch Naming Conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test improvements

### 2. Make Your Changes

```bash
# Make your code changes
# ... edit files ...

# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "Add user authentication feature"

# Or use a multi-line commit message:
git commit -m "Add user authentication feature

- Implement login/logout functionality
- Add JWT token management
- Update user model with authentication fields"
```

### 3. Push the Branch

```bash
# Push your branch to GitHub
git push origin feature/my-new-feature

# If it's the first push, set upstream:
git push -u origin feature/my-new-feature
```

### 4. Create a Pull Request

**Option A: Using GitHub Web Interface (Recommended)**

1. Go to your repository on GitHub
2. You'll see a banner: **"Compare & pull request"** - click it
3. Fill in the PR details:
   - **Title**: Descriptive title (e.g., "Add user authentication feature")
   - **Description**: Explain what the PR does and why
   - **Draft**: Check if work-in-progress
4. Click **"Create pull request"**

**Option B: Using GitHub CLI**

```bash
# Install GitHub CLI first: https://cli.github.com/
gh pr create --title "Add user authentication feature" --body "Description of changes"
```

### 5. Tests Run Automatically

Once the PR is created, the CI workflow (`.github/workflows/ci.yml`) will automatically:
- Run frontend lint, type-check, and unit tests
- Run frontend build and bundle size checks
- Run backend lint, type-check, and tests (unit, integration, E2E)
- Run full-stack E2E tests (including mobile device testing)
- Generate coverage reports and upload artifacts

You can see the progress in the **"Checks"** tab of the PR.

### 6. Review and Merge

**If Tests Pass:**
- Review your changes in the **"Files changed"** tab
- Add any comments or notes
- Click **"Merge pull request"** → **"Confirm merge"**
- Optionally delete the branch after merging

**If Tests Fail:**
- Check the failed tests in the **"Checks"** tab
- Fix the issues in your feature branch
- Push the fixes (tests will run again automatically)
- Merge when all tests pass

### 7. Clean Up

```bash
# Switch back to master
git checkout master

# Pull the merged changes
git pull origin master

# Delete the local feature branch (optional)
git branch -d feature/my-new-feature

# Delete the remote branch (if not auto-deleted)
git push origin --delete feature/my-new-feature
```

---

## Branch Protection Setup

To enforce that tests must pass before merging, enable branch protection:

### Setup Steps

1. Go to your repository on GitHub
2. Navigate to: **Settings** → **Branches**
3. Click **"Add rule"** or edit existing rule for `master`
4. Configure:
   - **Branch name pattern**: `master`
   - ✅ **Require a pull request before merging**
     - ✅ Require approvals: `0` (since you're solo)
   - ✅ **Require status checks to pass before merging**
     - Select: `Backend Tests`
     - Select: `Frontend Unit/Integration Tests`
     - Select: `Frontend E2E Tests`
   - ✅ **Require branches to be up to date before merging**
   - ✅ **Include administrators** (so you're not blocked)

5. Click **"Create"** or **"Save changes"**

### What This Does

- ✅ Prevents direct pushes to `master`
- ✅ Requires PRs for all changes
- ✅ Blocks merging if tests fail
- ✅ Ensures `master` is always up to date

---

## Workflow Variations

### Draft PRs for Work-in-Progress

If you want to push code but aren't ready to merge:

```bash
# Create a draft PR
# In GitHub: Check "Create as draft" when creating the PR

# Or via CLI:
gh pr create --draft --title "WIP: Add feature"
```

**Benefits:**
- Tests still run (catch issues early)
- Can't be merged accidentally
- Can mark as "Ready for review" when done

### Skipping Tests (Use Sparingly)

If you need to push without running tests (e.g., documentation only):

```bash
git commit -m "Update README [skip ci]"
git push origin feature/docs-update
```

**Skip patterns:**
- `[skip ci]`
- `[ci skip]`
- `[no ci]`
- `[skip actions]`
- `***NO_CI***`

**Note**: Use sparingly - tests help catch issues early!

### Hotfixes

For urgent production fixes:

```bash
# Create hotfix branch from master
git checkout master
git pull origin master
git checkout -b hotfix/critical-security-fix

# Make fix, commit, push
git add .
git commit -m "Fix critical security issue"
git push origin hotfix/critical-security-fix

# Create PR, merge quickly after tests pass
```

---

## Best Practices

### Commit Messages

**Good:**
```
Add user authentication feature

- Implement login/logout functionality
- Add JWT token management
- Update user model with authentication fields
- Add tests for authentication flow
```

**Bad:**
```
fix stuff
update
changes
```

### Branch Naming

**Good:**
- `feature/add-user-dashboard`
- `fix/resolve-login-error`
- `refactor/improve-api-performance`

**Bad:**
- `my-branch`
- `test`
- `fix`

### PR Descriptions

Include:
- **What** the PR does
- **Why** it's needed
- **How** to test it
- **Screenshots** (if UI changes)

**Example:**
```markdown
## What
Adds user authentication feature with login/logout functionality.

## Why
Users need to authenticate to access protected features.

## How to Test
1. Navigate to `/login`
2. Enter credentials
3. Verify redirect to dashboard
4. Test logout functionality

## Screenshots
[Add screenshots if applicable]
```

### Keep Branches Small

- One feature per branch
- Easier to review
- Faster to test
- Less merge conflicts

### Regular Updates

Keep your feature branch up to date with `master`:

```bash
# On your feature branch
git checkout feature/my-feature
git fetch origin
git merge origin/master
# Resolve conflicts if any
git push origin feature/my-feature
```

Or use rebase (cleaner history):

```bash
git checkout feature/my-feature
git fetch origin
git rebase origin/master
# Resolve conflicts if any
git push origin feature/my-feature --force-with-lease
```

---

## Troubleshooting

### Tests Fail on PR

**Problem**: Tests fail when creating a PR

**Solution**:
1. Check the "Checks" tab for error details
2. Fix issues locally
3. Commit and push fixes
4. Tests will run again automatically

### Can't Push to Master

**Problem**: "Cannot push to master" error

**Solution**: This is expected if branch protection is enabled. Use a feature branch and create a PR instead.

### Merge Conflicts

**Problem**: PR shows merge conflicts

**Solution**:
```bash
# On your feature branch
git checkout feature/my-feature
git fetch origin
git merge origin/master
# Resolve conflicts in your editor
git add .
git commit -m "Resolve merge conflicts"
git push origin feature/my-feature
```

### Tests Pass Locally But Fail in CI

**Problem**: Tests pass on your machine but fail in GitHub Actions

**Common Causes**:
- Environment differences (Python/Node versions)
- Missing environment variables
- Database/API differences
- Timing issues in tests

**Solution**:
- Check CI logs for specific errors
- Ensure local environment matches CI (see workflow file)
- Run tests in Docker to match CI environment

### Accidentally Pushed to Master

**Problem**: Pushed directly to master (if protection not enabled)

**Solution**:
```bash
# Revert the commit
git revert HEAD
git push origin master

# Or reset (if no one else has pulled)
git reset --hard HEAD~1
git push origin master --force
```

**Better Solution**: Enable branch protection to prevent this.

---

## Quick Reference

### Common Commands

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "Description"

# Push branch
git push origin feature/my-feature

# Update from master
git merge origin/master

# Delete local branch
git branch -d feature/my-feature

# Delete remote branch
git push origin --delete feature/my-feature
```

### Workflow Checklist

- [ ] Create feature branch from `master`
- [ ] Make changes and commit
- [ ] Push branch to GitHub
- [ ] Create PR (draft if WIP)
- [ ] Wait for tests to pass
- [ ] Review changes
- [ ] Merge PR
- [ ] Delete branch (local and remote)
- [ ] Update local `master`

---

## Summary

Using feature branches + PRs as a solo developer provides:

1. **Better Code Quality**: Tests must pass before merging
2. **Cleaner History**: Organized, feature-based commits
3. **Safety Net**: Can review and revert easily
4. **Professional Workflow**: Same process as team projects

**Remember**: You can create PRs from your own account to your own repository - no second account needed!

For questions or issues, refer to:
- [GitHub Docs: Creating a Pull Request](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request)
- [GitHub Docs: Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
