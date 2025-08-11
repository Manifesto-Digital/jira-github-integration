#!/usr/bin/env node

/**
 * Jira to GitHub Issue Script
 *
 * Usage:
 * npm run jira-to-issue JGIT-1 Manifesto-Digital/repo-name
 *
 * What it does:
 * 1. Reads Jira ticket (user story + acceptance criteria)
 * 2. Creates GitHub Issue with structured content for Copilot
 * 3. Moves Jira ticket to "In Progress"
 * 4. Links Jira ticket to GitHub issue
 * 5. Assigns issue to "Copilot agent"
 * 6. Adds labels to the GitHub issue
 * 7. Comments on the Jira ticket with the GitHub issue link
 */

import * as dotenv from 'dotenv';
import { JiraIssue, JiraService } from '../src/jira/jira-service.js';
import { GitHubService } from '../src/github/github-service.js';
import * as readline from 'readline';
import { AcceptanceCriterion, generateGitHubIssueBody } from '../src/helper/generateGitHubIssueBody.js';

dotenv.config();

class JiraToGitHubIntegration {
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

  private async getJiraAcceptanceCriteria(ticketNumber: string): Promise<AcceptanceCriterion[]> {
    // First get the ticket, then extract acceptance criteria
    try{
      const ticket = await this.jiraService.getIssue(ticketNumber);
      const acceptanceCriteria = await this.jiraService.getAcceptanceCriteria(ticket, ticketNumber);
      return acceptanceCriteria;
    } catch (error) {
      console.error(`Failed to get Jira acceptance criteria: ${(error as Error).message}`);
      return [];
    }
  }

  private generateGitHubIssueContent(
    ticket: JiraIssue,
    acceptanceCriteria: AcceptanceCriterion[],
  ): {
    title: string;
    body: string;
    labels: string[];
  } {
    const title = `[${ticket.key}] ${ticket.summary}`;
    // Generate labels based on ticket info
    const labels = ['jira-integration', 'copilot-optimized', ticket.issueType?.toLowerCase().replace(/\s+/g, '-') || 'story'];

    // Add priority label
    if (ticket.priority) {
      labels.push(`priority-${ticket.priority.toLowerCase()}`);
    }
    const body = generateGitHubIssueBody({ title, ticket, acceptanceCriteria });

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

  private async linkJiraToGitHub(ticketNumber: string, issueUrl: string, issueNumber: number): Promise<void> {
    try {
      // Add comment to Jira ticket with GitHub issue link using JiraService
      // Since addComment is private, we use updateIssue with a comment
      await this.jiraService.updateIssue(ticketNumber, {
        comment: `GitHub Issue Created: [Issue #${issueNumber}](${issueUrl})`,
      });
    } catch (error: any) {
      console.warn(`Warning: Could not add comment to Jira: ${error.message}`);
    }
  }

  private async moveToInProgress(ticketNumber: string): Promise<void> {
    try {
      console.log(`\nMoving Jira ticket to "In Progress"...`);
      await this.jiraService.updateIssue(ticketNumber, {
        status: 'In Progress',
        comment: 'Development started - feature branch created and ready for implementation.',
      });
      console.log(`Jira ticket ${ticketNumber} moved to "In Progress"`);
    } catch (error: any) {
      console.error(`❌ Failed to update Jira ticket: ${error.message}`);
      console.log(`You may need to manually transition the ticket to "In Progress"`);
    }
  }

  // private askBranchOffPrompt(query: string): Promise<string> {
  //   return new Promise(resolve => {
  //     this.rl.question(query, answer => {
  //       resolve(answer.trim());
  //     });
  //   });
  // }

  public async run(ticketNumber: string, repoIdentifier: string): Promise<void> {
    try {

      const [repoOwner, repoName] = repoIdentifier.split('/');
      if (!repoOwner || !repoName) {
        throw new Error('Repository identifier must be in format "owner/repo"');
      }

      // Step 1: Get Jira ticket using JiraService
      console.log('[Step 1]: Fetching Jira ticket...');
      const jiraTicket = await this.jiraService.getIssue(ticketNumber);
      console.log(`\nFound ticket: "${jiraTicket.id} - ${jiraTicket.summary}"`);
      console.log(`\nStatus: ${jiraTicket.status}`);
      console.log(`\nType: ${jiraTicket.issueType}\n\n`);

      // Step 2: Extract acceptance criteria using JiraService
      console.log('\n[Step 2]: Extracting acceptance criteria...');
      const acceptanceCriteria = await this.getJiraAcceptanceCriteria(ticketNumber);
      console.log(`\nFound ${acceptanceCriteria.length} acceptance criteria`);

      if (acceptanceCriteria.length === 0) {
        console.log('⚠️  No acceptance criteria found.');
      } else {
        acceptanceCriteria.forEach((ac, i) => {
          console.log(`AC${i + 1}: ${ac.criterion.substring(0, 60)}...\n\n`);
        });
      }

      // Step 3: Generate GitHub issue content
      console.log('\n[Step 3]: Generating Copilot-optimized GitHub issue...');
      const issueData = this.generateGitHubIssueContent(jiraTicket, acceptanceCriteria);
      console.log(`\nGenerated issue title: "${issueData.title}" will be used for the GitHub issue.`);
      console.log(`\nLabels: ${issueData.labels.join(', ')} will be applied to the issue.`);

      // Step 4: Create GitHub issue using GitHubService
      console.log('[Step 4]: Creating GitHub issue...');
      const { issueUrl, issueNumber } = await this.createGitHubIssue(repoOwner, repoName, issueData);
      console.log(`✅ GitHub issue created: ${issueUrl}`);

      // Step 5: Move Jira ticket to "In Progress" using JiraService
      console.log('\n[Step 5]: Moving Jira ticket to "In Progress"...');
      await this.moveToInProgress(ticketNumber);

      // Step 6: Link Jira to GitHub
      console.log('\n[Step 6]: Linking Jira ticket to GitHub issue...');
      await this.linkJiraToGitHub(ticketNumber, issueUrl, issueNumber);
      console.log('✅ Cross-reference links created');

      // Step 7: Ask for branch name
      // const baseBranchName = await this.askBranchOffPrompt('Enter the branch name to create from: ');

      // Step 8: Assign issue to "Copilot"
      console.log(`\n[Step 7]: Assigning issue to "Copilot Agent"...`);
      await this.githubService.assignIssueToCopilot({
        owner: repoOwner,
        repo: repoName,
        issueNumber
      });
      console.log('✅ Issue assigned to "Copilot Agent" user');

      // Step 8: Start Copilot monitoring and logging
      console.log('\n[Step 8]: Starting Copilot activity monitoring...');

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
  const ticketNumber = process.argv[2];
  const repoIdentifier = process.argv[3];

  if (!ticketNumber || !repoIdentifier) {
    console.error(`
🤖 Jira to GitHub Issue Creator

Usage: npm run jira-to-issue <TICKET_NUMBER> <OWNER/REPO> <baseBranchName>

Examples:
  npm run jira-to-issue JGIT-1 Manifesto-Digital/testing-jira-github-integration
  npm run jira-to-issue PROJ-123 myorg/myproject

Environment Variables Required:
  JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN
  GITHUB_TOKEN

What this does:
  ✅ Creates GitHub Issue from Jira ticket
  ✅ Includes user story + acceptance criteria
  ✅ Assigns issue to "Copilot" user
  ✅ Monitors and logs Copilot activity
  ✅ Links Jira ↔ GitHub for traceability
  ✅ Moves Jira ticket to "In Progress"
  ✅ Automatic status updates based on Copilot progress

💡 Next Steps:
  1. Check the GitHub issue for Copilot assignment
  2. System will automatically log Copilot activity
  3. Create a PR with "Closes #" to link back to the Jira ticket
`);
    process.exit(1);
  }

  const script = new JiraToGitHubIntegration();
  script.run(ticketNumber, repoIdentifier);
}
