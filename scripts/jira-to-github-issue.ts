#!/usr/bin/env node

/**
 * Jira to GitHub Issue Script
 *
 * Usage:
 * npm run jira-to-issue JGIT-1 nataliarusu/a11y
 *
 * What it does:
 * 1. Reads Jira ticket (user story + acceptance criteria)
 * 2. Creates GitHub Issue with structured content for Copilot
 * 3. Moves Jira ticket to "In Progress"
 * 4. Links Jira ticket to GitHub issue
 *
 * Then developers can:
 * - Use GitHub Copilot to generate code from the issue
 * - Create PR that closes the issue
 * - Automatic linking between Jira → GitHub Issue → PR
 */

import dotenv from 'dotenv';
import { JiraService } from '../src/jira/jira-service.js';
import { GitHubService } from '../src/github/github-service.js';
import * as readline from 'readline';

// Load environment variables
dotenv.config();

interface AcceptanceCriterion {
  id: string;
  criterion: string;
  status: string;
  testCases?: string[];
}

class JiraToGitHubIssueScript {
  private jiraService: JiraService;
  private githubService: GitHubService;
  private rl: readline.Interface;

  constructor() {
    this.jiraService = new JiraService({
      domain: process.env.JIRA_DOMAIN!,
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!,
    });

    this.githubService = new GitHubService({
      token: process.env.GITHUB_TOKEN!,
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  private async getAcceptanceCriteria(ticketKey: string): Promise<AcceptanceCriterion[]> {
    // First get the ticket, then extract acceptance criteria
    const ticket = await this.jiraService.getIssue(ticketKey);
    const criteria = await this.jiraService.getAcceptanceCriteria(ticket, ticketKey);
    return criteria;
    // return criteria.map(ac => ({
    //   id: ac.id,
    //   criterion: ac.criterion,
    //   status: ac.status || 'pending-no-status',
    //   testCases: ac.testCases
    // }));
  }

  private generateGitHubIssueContent(
    ticket: any,
    acceptanceCriteria: AcceptanceCriterion[],
  ): {
    title: string;
    body: string;
    labels: string[];
  } {
    const description = ticket.description || 'No description provided';

    const title = `[${ticket.key}] ${ticket.summary}`;

    const body = `## User Story
${ticket.summary}

## 📝 Description
${description}

## ✅ Acceptance Criteria
${acceptanceCriteria
  .map(
    (ac, i) => `
### ${ac.id}: ${ac.criterion}
- [ ] Implementation completed
- [ ] Tests written and passing
- [ ] Code reviewed
${ac.testCases ? ac.testCases.map((test) => `- [ ] Test case: ${test}`).join('\n') : ''}
`,
  )
  .join('\n')}

## 🤖 GitHub Copilot Instructions

**This issue is optimized for GitHub Copilot code generation. Follow these steps:**

### 1. Create Feature Branch
\`\`\`bash
git checkout -b feature/${ticket.key.toLowerCase()}-implementation
\`\`\`

### 2. Use Copilot Chat for Implementation
In VS Code, open GitHub Copilot Chat and use these prompts:

\`\`\`
@workspace Implement the following user story with all acceptance criteria:

**User Story:** ${ticket.summary}

**Requirements:**
${acceptanceCriteria.map((ac) => `- ${ac.criterion}`).join('\n')}

**Technical Requirements:**
- Use TypeScript for type safety
- Include comprehensive error handling  
- Add JSDoc comments for all public methods
- Follow clean architecture principles
- Include unit tests with high coverage
- Implement proper validation

Please generate:
1. Main implementation files
2. Type definitions/interfaces
3. Unit tests
4. Integration tests (if needed)
5. Documentation

Focus on production-ready, maintainable code that fully satisfies each acceptance criterion.
\`\`\`

### 3. Verify Each Acceptance Criterion
${acceptanceCriteria
  .map(
    (ac, i) => `
**AC${i + 1}**: ${ac.criterion}
- Use Copilot to generate implementation
- Write tests to verify the criterion
- Document how the code satisfies this AC
`,
  )
  .join('\n')}

### 4. Create Pull Request
When implementation is complete:
- Create PR with title: \`[${ticket.key}] ${ticket.summary}\`
- Use \`Closes #<issue-number>\` to auto-close this issue
- Include test results and AC verification

## 🔗 Links
- **Jira Ticket:** [${ticket.key}](https://your-jira-domain.atlassian.net/browse/${ticket.key})
- **Priority:** ${ticket.priority || 'Not set'}
- **Issue Type:** ${ticket.issueType || 'Unknown'}

## 📋 Definition of Done
- [ ] All acceptance criteria implemented
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Jira ticket moved to "PR"
- [ ] No breaking changes introduced

---
*This issue was automatically generated from Jira ticket ${ticket.key}*
*Use GitHub Copilot to implement the requirements above*`;

    // Generate labels based on ticket info
    const labels = ['jira-integration', 'copilot-optimized', ticket.issueType?.toLowerCase().replace(/\s+/g, '-') || 'story'];

    // Add priority label
    if (ticket.priority) {
      labels.push(`priority-${ticket.priority.toLowerCase()}`);
    }

    return { title, body, labels };
  }

  private async createGitHubIssue(owner: string, repo: string, issueData: { title: string; body: string; labels: string[] }): Promise<{ issueUrl: string; issueNumber: number }> {
    try {
      const issue = await this.githubService.createIssue(owner, repo, {
        title: issueData.title,
        body: issueData.body,
        labels: issueData.labels,
      });

      return {
        issueUrl: `https://github.com/${owner}/${repo}/issues/${issue.number}`,
        issueNumber: issue.number,
      };
    } catch (error: any) {
      throw new Error(`Failed to create GitHub issue: ${error.message}`);
    }
  }

  private async linkJiraToGitHub(ticketKey: string, issueUrl: string, issueNumber: number): Promise<void> {
    try {
      // Add comment to Jira ticket with GitHub issue link using JiraService
      // Since addComment is private, we use updateIssue with a comment
      await this.jiraService.updateIssue(ticketKey, {
        comment: `GitHub Issue Created: [Issue #${issueNumber}](${issueUrl})`,
      });
    } catch (error: any) {
      console.warn(`Warning: Could not add comment to Jira: ${error.message}`);
    }
  }

  private async moveToInProgress(ticketKey: string): Promise<void> {
    try {
      console.log(`\n📊 Moving Jira ticket to "In Progress"...`);
      await this.jiraService.updateIssue(ticketKey, {
        status: 'In Progress',
        comment: 'Development started - feature branch created and ready for implementation.',
      });
      console.log(`✅ Jira ticket ${ticketKey} moved to "In Progress"`);
    } catch (error: any) {
      console.error(`❌ Failed to update Jira ticket: ${error.message}`);
      console.log(`💡 You may need to manually transition the ticket to "In Progress"`);
    }
  }

  private async promptForBaseBranch(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question('🌿 Which branch to branch off from? (main/develop/other): ', (answer) => {
        const baseBranch = answer.trim() || 'main';
        resolve(baseBranch);
      });
    });
  }

  private generateFeatureBranchName(ticketKey: string, summary: string): string {
    // Create a short description from the summary
    const shortDesc = summary
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .substring(0, 30) // Limit length
      .replace(/-+$/, ''); // Remove trailing hyphens

    return `feature/${ticketKey}-${shortDesc}`;
  }

  private async createFeatureBranch(owner: string, repo: string, ticketKey: string, summary: string): Promise<string> {
    try {
      const baseBranch = await this.promptForBaseBranch();
      const featureBranchName = this.generateFeatureBranchName(ticketKey, summary);

      console.log(`\nCreating feature branch: ${featureBranchName}`);
      console.log(`Branching off from: ${baseBranch}`);

      await this.githubService.createBranch(owner, repo, featureBranchName, baseBranch);

      console.log(`✅ Feature branch created successfully!`);
      return featureBranchName;
    } catch (error: any) {
      console.error(`❌ Failed to create branch: ${error.message}`);
      if (error.message.includes('already exists')) {
        console.log(`💡 Branch already exists - continuing with existing branch`);
        return this.generateFeatureBranchName(ticketKey, summary);
      }
      throw error;
    }
  }

  private openRepository(owner: string, repo: string, branch: string): void {
    console.log('\n🔗 Opening GitHub repository in web editor...');
    const { exec } = require('child_process');

    let openCommand: string;
    if (process.platform === 'darwin') {
      openCommand = 'open';
    } else if (process.platform === 'win32') {
      openCommand = 'start';
    } else {
      openCommand = 'xdg-open';
    }

    // Open to the specific branch
    const url = `https://github.com/${owner}/${repo}/tree/${branch}`;

    exec(`${openCommand} ${url}`, (error: any) => {
      if (error) {
        console.log('   (Could not auto-open - please open manually)');
        console.log(`   Manual URL: ${url}`);
      } else {
        console.log('   ✅ Repository opened in browser');
        console.log('   💡 Press "." to open web editor with your feature branch');
      }
    });
  }

  public async run(ticketKey: string, repoIdentifier: string): Promise<void> {
    try {
      console.log(`🚀 Creating GitHub Issue from Jira ticket ${ticketKey} → ${repoIdentifier}`);
      console.log('');

      const [repoOwner, repoName] = repoIdentifier.split('/');
      if (!repoOwner || !repoName) {
        throw new Error('Repository identifier must be in format "owner/repo"');
      }

      // Step 1: Get Jira ticket using JiraService
      console.log('📋 Step 1: Fetching Jira ticket...');
      const ticket = await this.jiraService.getIssue(ticketKey);
      console.log(`✅ Found ticket: "${ticket.summary}"`);
      console.log(`   Status: ${ticket.status}`);
      console.log(`   Type: ${ticket.issueType}`);

      // Step 2: Extract acceptance criteria using JiraService
      console.log('\n📝 Step 2: Extracting acceptance criteria...');
      const acceptanceCriteria = await this.getAcceptanceCriteria(ticketKey);
      console.log(`✅ Found ${acceptanceCriteria.length} acceptance criteria`);

      if (acceptanceCriteria.length === 0) {
        console.log('⚠️  No acceptance criteria found - issue will be created but may need manual AC addition');
      } else {
        acceptanceCriteria.forEach((ac, i) => {
          console.log(`   AC${i + 1}: ${ac.criterion.substring(0, 60)}...`);
        });
      }

      // Step 4: Create feature branch
      console.log('\n🌿 Step 4: Creating feature branch...');
      const branchName = await this.createFeatureBranch(repoOwner, repoName, ticket.key, ticket.summary);

      // Step 5: Generate GitHub issue content
      console.log('\n🤖 Step 5: Generating Copilot-optimized GitHub issue...');
      const issueData = this.generateGitHubIssueContent(ticket, acceptanceCriteria);
      console.log(`✅ Generated issue: "${issueData.title}"`);
      console.log(`   Labels: ${issueData.labels.join(', ')}`);

      // Step 6: Create GitHub issue using GitHubService
      console.log('\n📤 Step 6: Creating GitHub issue...');
      const { issueUrl, issueNumber } = await this.createGitHubIssue(repoOwner, repoName, issueData);
      console.log(`✅ GitHub issue created: ${issueUrl}`);

      // Step 7: Move Jira ticket to "In Progress" using JiraService
      console.log('\n⏳ Step 7: Moving Jira ticket to "In Progress"...');
      await this.moveToInProgress(ticketKey);

      // Step 8: Link Jira to GitHub
      console.log('\n🔗 Step 8: Linking Jira ticket to GitHub issue...');
      await this.linkJiraToGitHub(ticketKey, issueUrl, issueNumber);
      console.log('✅ Cross-reference links created');

      // Step 9: Open repository
      this.openRepository(repoOwner, repoName, branchName);

      // Success summary
      console.log('\n🎉 SUCCESS! Complete workflow completed:');
      console.log(` Jira: https://your-jira-domain.atlassian.net/browse/${ticketKey}`);
      console.log(` Branch: ${branchName}`);
      console.log(` GitHub Issue: ${issueUrl}`);
      console.log('');
      
      console.log('💡 Next steps for developers:');
      console.log('   1. Repository should open automatically in your browser');
      console.log('   2. Press "." to open GitHub web editor');
      console.log('   3. You\'re already on the feature branch: ' + branchName);
      console.log('   4. Use the GitHub issue as a guide for implementation');
      console.log('   5. Use GitHub Copilot Chat with the prompts in the issue');
      console.log('   6. Create PR with "Closes #' + issueNumber + '" to auto-close the issue');

      // Close readline interface
      this.rl.close();

    } catch (error: any) {
      console.error('\n❌ Failed to create GitHub issue:', error.message);
      this.rl.close();
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const ticketKey = process.argv[2];
  const repoIdentifier = process.argv[3];

  if (!ticketKey || !repoIdentifier) {
    console.error(`
🤖 Jira to GitHub Issue Creator

Usage: npm run jira-to-issue <TICKET_KEY> <OWNER/REPO>

Examples:
  npm run jira-to-issue JGIT-1 nataliarusu/a11y
  npm run jira-to-issue PROJ-123 myorg/myproject

Environment Variables Required:
  JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN
  GITHUB_TOKEN

What this does:
  ✅ Creates GitHub Issue from Jira ticket
  ✅ Includes user story + acceptance criteria
  ✅ Optimizes content for GitHub Copilot
  ✅ Provides step-by-step Copilot prompts
  ✅ Links Jira ↔ GitHub for traceability
  ✅ Moves Jira ticket to "In Progress"
  ✅ Creates feature branch in GitHub
  ✅ Opens repository in web editor

💡 Next Steps:
  1. Implement the feature based on the GitHub issue
  2. Use GitHub Copilot for code suggestions
  3. Create a PR with "Closes #" to link back to the Jira ticket
`);
    process.exit(1);
  }

  const script = new JiraToGitHubIssueScript();
  script.run(ticketKey, repoIdentifier);
}
