#!/usr/bin/env node

/**
 * Simple Jira Ticket Reader
 * 
 * Usage:
 * npm run get-ticket JGIT-1 Manifesto-Digital/repo-name
 * 
 * What it does:
 * 1. Reads Jira ticket information
 * 2. Extracts user story and acceptance criteria
 * 3. Uses the specified GitHub repository
 * 4. Provides next steps for implementation
 */

import * as dotenv from 'dotenv';
import { JiraService } from '../src/jira/jira-service.js';
import { GitHubService } from '../src/github/github-service.js';
import * as readline from 'readline';

// Load environment variables
dotenv.config();

class JiraTicketReader {
  private jiraService: JiraService;
  private githubService: GitHubService;
  private rl: readline.Interface;

  constructor() {
    this.jiraService = new JiraService({
      domain: process.env.JIRA_DOMAIN!,
      email: process.env.JIRA_EMAIL!,
      apiToken: process.env.JIRA_API_TOKEN!
    });
    
    this.githubService = new GitHubService({
      token: process.env.GITHUB_TOKEN!
    });

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }



  public async run(ticketKey: string, repoIdentifier: string): Promise<void> {
    try {
      console.log(`Fetching Jira ticket: ${ticketKey}`);
      console.log(`Target repository: ${repoIdentifier}`);
      console.log('');

      // Step 1: Get Jira ticket using JiraService
      const ticket = await this.jiraService.getIssue(ticketKey);
      const acceptanceCriteria = await this.jiraService.getAcceptanceCriteria(ticket, ticketKey);

      // Step 2: Display ticket information
      console.log('🎫 JIRA TICKET INFORMATION');
      console.log('================================');
      console.log(`Key: ${ticket.key}`);
      console.log(`Summary: ${ticket.summary}`);
      console.log(`Status: ${ticket.status}`);
      console.log(`Type: ${ticket.issueType}`);
      console.log(`Priority: ${ticket.priority}`);
      console.log(`Assignee: ${ticket.assignee || 'Unassigned'}`);
      console.log(`Reporter: ${ticket.reporter || 'Unknown'}`);
      console.log(`Labels: ${ticket.labels.join(', ') || 'None'}`);
      console.log('');

      // Step 3: Display description
      console.log('📝 DESCRIPTION');
      console.log('================================');
      if (ticket.description) {
        console.log(ticket.description);
      } else {
        console.log('No description provided');
      }
      console.log('');

      // Step 4: Display acceptance criteria
      console.log('✅ ACCEPTANCE CRITERIA');
      console.log('================================');
      if (acceptanceCriteria.length > 0) {
        acceptanceCriteria.forEach((ac, index) => {
          console.log(`${index + 1}. ${ac.id}: ${ac.criterion}`);
          if (ac.testCases && ac.testCases.length > 0) {
            ac.testCases.forEach(test => {
              console.log(`   - Test: ${test}`);
            });
          }
        });
      } else {
        console.log('No acceptance criteria found');
      }
      console.log('');

      // Step 5: Display attachments
      if (ticket.attachments && ticket.attachments.length > 0) {
        console.log('📎 ATTACHMENTS');
        console.log('================================');
        ticket.attachments.forEach((attachment, index) => {
          console.log(`${index + 1}. ${attachment.filename} (${attachment.mimeType})`);
          console.log(`   Size: ${Math.round(attachment.size / 1024)}KB`);
          console.log(`   Design file: ${attachment.isDesign ? 'Yes' : 'No'}`);
          if (attachment.isDesign) {
            console.log(`   🎨 This is a design file that can be used for implementation`);
          }
        });
        console.log('');
      }

      // Step 6: Parse GitHub repository
      const [owner, repo] = repoIdentifier.split('/');
      if (!owner || !repo) {
        throw new Error('Repository identifier must be in format "owner/repo"');
      }
      
      const repoInfo = {
        owner,
        repo,
        reasoning: 'Specified by user'
      };
      
      console.log('🐙 GITHUB REPOSITORY');
      console.log('================================');
      console.log(`Owner: ${repoInfo.owner}`);
      console.log(`Repository: ${repoInfo.repo}`);
      console.log(`Full Name: ${repoInfo.owner}/${repoInfo.repo}`);
      console.log(`Reasoning: ${repoInfo.reasoning}`);
      console.log(`GitHub URL: https://github.com/${repoInfo.owner}/${repoInfo.repo}`);
      console.log('');

      // Step 7: Summary for next steps
      console.log('🚀 SUMMARY');
      console.log('================================');
      console.log(`Ticket: ${ticket.key} - ${ticket.summary}`);
      console.log(`Repository: ${repoInfo.owner}/${repoInfo.repo}`);
      console.log(`Acceptance Criteria: ${acceptanceCriteria.length} items`);
      console.log(`Attachments: ${ticket.attachments?.length || 0} files`);
      console.log(`Design files: ${ticket.attachments?.filter(a => a.isDesign).length || 0}`);
      console.log(`Next Steps: Use this information to create GitHub issue or PR`);
      console.log('');

      // Optional: Auto-open the repository (cross-platform)
      console.log('');
      console.log('🔗 QUICK ACTION: Opening GitHub repository...');
      const { exec } = require('child_process');
      
      let openCommand: string;
      if (process.platform === 'darwin') {
        openCommand = 'open';
      } else if (process.platform === 'win32') {
        openCommand = 'start';
      } else {
        // Linux and other Unix-like systems
        openCommand = 'xdg-open';
      }
      
      exec(`${openCommand} https://github.com/${repoInfo.owner}/${repoInfo.repo}`, (error: any) => {
        if (error) {
          console.log('   (Could not auto-open - please open manually)');
          console.log(`   Manual URL: https://github.com/${repoInfo.owner}/${repoInfo.repo}`);
        } else {
          console.log('   ✅ Repository opened in browser - press "." to start coding!');
        }
      });

      // Close readline interface
      this.rl.close();

    } catch (error: any) {
      console.error('❌ Failed to fetch ticket information:', error.message);
      
      if (error.message.includes('certificate')) {
        console.log('\n💡 SSL Certificate issue detected. Try:');
        console.log('   1. Check your JIRA_DOMAIN in .env file');
        console.log('   2. Ensure it\'s the correct domain without extra .atlassian.net');
      } else if (error.message.includes('401') || error.message.includes('authentication')) {
        console.log('\n💡 Authentication issue detected. Check:');
        console.log('   1. JIRA_EMAIL is correct');
        console.log('   2. JIRA_API_TOKEN is valid and not expired');
        console.log('   3. Token has proper permissions');
      }
      
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
📋 Jira Ticket Reader

Usage: npm run get-ticket <TICKET_KEY> <OWNER/REPO>

Examples:
  npm run get-ticket JGIT-1 Manifesto-Digital/repo-name
  npm run get-ticket PROJ-123 myorg/myproject
  
Environment Variables Required:
  JIRA_DOMAIN, JIRA_EMAIL, JIRA_API_TOKEN

What this does:
  📋 Fetches complete Jira ticket information
  📝 Extracts user story and description  
  ✅ Parses acceptance criteria
  🐙 Uses the specified GitHub repository
  💡 Suggests next steps for implementation
`);
    process.exit(1);
  }

  const reader = new JiraTicketReader();
  reader.run(ticketKey, repoIdentifier);
}
