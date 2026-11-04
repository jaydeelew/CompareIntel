# Production Operations Workflow

This document describes how to use the GitHub Actions workflow for operating the production EC2 server from the GitHub mobile app or web interface.

## Overview

The Production Operations workflow (`.github/workflows/ops.yml`) provides a secure way to perform common production operations without direct SSH access to the server. This is especially useful for mobile operations where Jack can manage the server from anywhere.

## Available Operations

The workflow supports four operations via the `action` input:

- **status** (default) - Shows the current status of production services
- **logs** - Displays recent application logs (includes last 200 lines of Docker Compose logs)
- **deploy** - Runs the full deployment process
- **rollback** - Rolls back to the previous deployment

## Security

### Authorization

The workflow is restricted to run **only by the repository owner** (`jaydeelew`). Any other user attempting to run the workflow will receive an authorization error.

### Concurrency

The workflow uses a concurrency group to ensure **only one operation runs at a time**. This prevents conflicts from overlapping deployments or operations.

### SSH Security

- Uses SSH key authentication (password-less)
- SSH key is written to `~/.ssh/prod_key` with `600` permissions during the workflow
- Key is automatically cleaned up after the workflow completes (success or failure)
- Uses `StrictHostKeyChecking=accept-new` to accept the host key on first connection
- Connection timeout is set to 30 seconds

### Secrets Protection

The workflow never prints secret values to logs. All sensitive information (SSH keys, hostnames, usernames) is handled securely through GitHub Secrets.

## Setup Instructions

### Required Secrets

To use this workflow, configure the following secrets in your GitHub repository:

**Navigate to:** Repository Settings → Secrets and variables → Actions → New repository secret

#### 1. `PROD_SSH_KEY`

The private SSH key used to authenticate to the production server.

**How to create:**

```bash
# On your local machine, generate a new SSH key pair (if needed)
ssh-keygen -t ed25519 -C "github-actions-prod-ops" -f ~/.ssh/prod_ops_key

# Display the private key (this goes in the GitHub secret)
cat ~/.ssh/prod_ops_key

# Copy the public key to the production server
ssh-copy-id -i ~/.ssh/prod_ops_key.pub ubuntu@your-production-server.com
```

**Add to GitHub:**
- Secret Name: `PROD_SSH_KEY`
- Secret Value: The entire contents of the private key file (including `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----`)

#### 2. `PROD_HOST`

The hostname or IP address of the production server.

**Example values:**
- `compareintel.com`
- `ec2-XX-XXX-XXX-XXX.compute-1.amazonaws.com`
- `XXX.XXX.XXX.XXX` (IP address)

**Add to GitHub:**
- Secret Name: `PROD_HOST`
- Secret Value: Your production server hostname or IP

#### 3. `PROD_USER`

The SSH username for connecting to the production server.

**Common values:**
- `ubuntu` (for Ubuntu EC2 instances)
- `ec2-user` (for Amazon Linux)
- `admin` (for Debian)

**Add to GitHub:**
- Secret Name: `PROD_USER`
- Secret Value: Your SSH username

### Optional Secret

#### `PROD_APP_DIR`

The directory path where the CompareIntel application is installed on the production server.

**Default:** `/home/ubuntu/CompareIntel`

Only set this secret if your application is installed in a different location.

**Add to GitHub:**
- Secret Name: `PROD_APP_DIR`
- Secret Value: Your custom application directory path (e.g., `/opt/compareintel`)

## How to Use

### From GitHub Web Interface

1. Navigate to the repository on GitHub
2. Click **Actions** tab
3. Select **Production Operations** from the workflows list
4. Click **Run workflow** dropdown
5. Select the operation you want to perform from the **action** dropdown
6. Click **Run workflow** button
7. Monitor the workflow run for progress and output

### From GitHub Mobile App

1. Open the GitHub mobile app
2. Navigate to the CompareIntel repository
3. Tap **Actions**
4. Tap **Production Operations**
5. Tap **Run workflow**
6. Select the desired **action**
7. Tap **Run workflow**
8. View the workflow progress and logs in real-time

### Viewing Results

After the workflow completes:

1. Open the workflow run
2. Click on the **Production [action]** job
3. Expand the **Run [action]** step to see the full output
4. Check the **Summary** page for a formatted output report

The job summary includes:
- Server details (host, directory)
- Timestamp
- Full command output
- For logs operations: last 200 lines of Docker Compose logs

## Operation Details

### Status

Shows the current state of all production services (nginx, backend, redis, postgres).

**Typical output:**
- Service status (running/stopped)
- Health check results
- Container uptime
- Image versions

**When to use:**
- Quick check of service health
- Before performing a deployment
- After a deployment to verify success
- Troubleshooting connectivity issues

### Logs

Displays recent application logs for debugging and monitoring.

**Output includes:**
- Last 100 lines from deployment script
- Last 200 lines from Docker Compose logs (all services)

**When to use:**
- Investigating errors or issues
- Checking recent API requests
- Monitoring application behavior
- Debugging deployment problems

### Deploy

Runs the full deployment process:
1. System checks
2. Git pull latest code
3. Database backup
4. Build new containers (if code changed)
5. Deploy updated services
6. Health checks and verification

**When to use:**
- Deploying new features or bug fixes
- Updating production to latest master
- After merging a PR

**Safety features:**
- Automatic backup before deployment
- Health check verification
- Automatic rollback on verification failure

### Rollback

Reverts to the previous deployment using the `:previous` Docker image tags.

**What it does:**
1. Checks that previous images exist
2. Swaps `:current` and `:previous` tags
3. Restarts services with previous images
4. Verifies health checks

**When to use:**
- After a failed deployment
- When new version has critical bugs
- To quickly restore service

**Note:** This is the fast rollback (no rebuild). For database rollbacks or older versions, SSH access is required.

## Troubleshooting

### Workflow Fails with "Unauthorized"

**Cause:** You are not the repository owner (jaydeelew)

**Solution:** Only Jack can run production operations. Contact the repository owner if you need something deployed.

### Workflow Fails with "Missing required secrets"

**Cause:** One or more required secrets (PROD_SSH_KEY, PROD_HOST, PROD_USER) are not configured

**Solution:** Follow the [Setup Instructions](#setup-instructions) above to configure all required secrets

### SSH Connection Timeout

**Cause:** Cannot reach the production server

**Solutions:**
- Verify `PROD_HOST` is correct
- Check that the production server is running
- Verify security group/firewall allows SSH from GitHub Actions IPs
- Confirm the server is not experiencing downtime

### Permission Denied (SSH)

**Cause:** SSH key is not authorized or incorrect

**Solutions:**
- Verify the public key is in `~/.ssh/authorized_keys` on the production server
- Ensure the private key in `PROD_SSH_KEY` matches the public key
- Check file permissions on server: `~/.ssh` should be 700, `authorized_keys` should be 600

### Operation Times Out

**Cause:** Operation takes longer than 30 minutes (workflow timeout)

**Solutions:**
- For long-running deploys, SSH directly to the server
- Increase the `timeout-minutes` in the workflow file (requires code change)
- For stuck deployments, may need to manually intervene on the server

### Directory Not Found

**Cause:** Application is not in the default `/home/ubuntu/CompareIntel` location

**Solution:** Set the `PROD_APP_DIR` secret with the correct application directory path

## GitHub Actions IP Ranges

If your production server has firewall restrictions, you may need to allow GitHub Actions IP ranges. GitHub Actions uses dynamic IP addresses from [these published ranges](https://api.github.com/meta).

For AWS Security Groups, you can use the AWS IP ranges for GitHub Actions or allow your specific GitHub Actions IPs.

## Related Documentation

- [backup-rollback.md](../runbooks/backup-rollback.md) - Detailed backup and rollback procedures
- [WORKFLOW.md](../development/WORKFLOW.md) - Development and deployment workflow
- [ARCHITECTURE.md](../ARCHITECTURE.md) - System architecture overview

## Security Considerations

1. **Audit Workflow Runs:** Review the Actions tab regularly to ensure only authorized runs
2. **Rotate SSH Keys:** Periodically generate new SSH keys and update the secret
3. **Monitor Server Access:** Check server auth logs for any suspicious activity
4. **Limit Secret Access:** Only repository admins should have access to manage secrets
5. **Review Workflow Changes:** Any changes to `.github/workflows/ops.yml` should be carefully reviewed

## Emergency Procedures

If you suspect the workflow has been compromised or misused:

1. **Disable the workflow:**
   - Go to Actions → Production Operations
   - Click the ⋮ menu → Disable workflow

2. **Rotate the SSH key:**
   - Generate a new SSH key pair
   - Update `authorized_keys` on the production server
   - Update the `PROD_SSH_KEY` secret

3. **Audit recent runs:**
   - Review all workflow runs in the Actions tab
   - Check production server logs for unexpected access

4. **Re-enable when safe:**
   - After verification and key rotation, re-enable the workflow

## Future Enhancements

Potential improvements for this workflow:

- Add Slack notifications for deployment status
- Include pre-deployment smoke tests
- Add support for custom deployment branches
- Integrate with monitoring alerts
- Add deployment approval gates for rollback operations

---

**Version:** 1.0  
**Last Updated:** 2026-11-04  
**Maintained By:** Platform Team
