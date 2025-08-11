import { GitHubClient } from './githubClient';
import { assignCopilotAgentToIssueQuery, getCopilotAgentIdQuery, getIssueIdQuery } from './gql-queries';

export interface GitHubConfig {
  token: string;
  owner?: string;
  repo?: string;
}

export interface GitHubIssue {
  id: string;
  issue_id: string;
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: string[];
  assignees: string[];
  milestone?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body?: string;
  head: string;
  base: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
}

/**
 * Service for interacting with GitHub API
 * Handles issue creation, PR management, and repository operations
 */
export class GitHubService {
  private client: GitHubClient;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.client = new GitHubClient(config.token);
  }

  private async getCopilotAgentId(owner: string, repo: string): Promise<string | null> {
    const query = getCopilotAgentIdQuery(owner, repo);
    try {
      const response = await this.client.graphql<{ repository: { suggestedActors: { nodes: Array<{ id: string }> } } }>({
        query,
      });

      return response.repository.suggestedActors.nodes[0]?.id || null;
    } catch (error) {
      console.error(`Failed to get Copilot agent ID: ${(error as Error).message}`);
      return null;
    }
  }
  
  private async getIssueId(owner: string, repoName: string, issueNumber: number): Promise<string | null> {
    const query = getIssueIdQuery(owner, repoName, issueNumber);
    try {
      const response = await this.client.graphql<{
        repository: {
          issue: {
            id: string;
          };
        };
      }>({
        query,
      });
      return response.repository.issue.id || null;
    } catch (error) {
      console.error(`Failed to get issue ID: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Create a GitHub issue from Jira ticket
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issue - Issue data
   * @returns Promise<GitHubIssue>
   */
  async createIssue(
    owner: string,
    repo: string,
    issue: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: number;
    },
  ): Promise<GitHubIssue> {
    try {
      const response = await this.client.rest.issues.create({
        owner,
        repo,
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
        assignees: issue.assignees,
        milestone: issue.milestone,
      });

      return this.mapGitHubIssue(response.data);
    } catch (error) {
      throw new Error(`Failed to create GitHub issue: ${(error as Error).message}`);
    }
  }

    /**
   * Update an existing GitHub issue
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param update - Update data
   */
  async updateIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    update: {
      title?: string;
      body?: string;
      state?: 'open' | 'closed';
      labels?: string[];
    },
  ): Promise<GitHubIssue> {
    try {
      const response = await this.client.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        title: update.title,
        body: update.body,
        state: update.state,
        labels: update.labels,
      });

      return this.mapGitHubIssue(response.data);
    } catch (error) {
      throw new Error(`Failed to update GitHub issue: ${(error as Error).message}`);
    }
  }

  /**
   * Add a comment to an issue or PR
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue/PR number
   * @param comment - Comment text
   */
  async addComment(owner: string, repo: string, issueNumber: number, comment: string): Promise<void> {
    try {
      await this.client.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment,
      });
    } catch (error) {
      throw new Error(`Failed to add comment: ${(error as Error).message}`);
    }
  }

  /**
   * Monitor repository for Copilot-generated draft PRs
   * This checks for draft PRs that may have been created by GitHub Copilot
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Related issue number to monitor
   * @returns Promise with draft PR info if found
   */

  /**
   * Get detailed information about a draft PR using GraphQL for richer data
   * Added: Better insight into PR status and Copilot involvement
   */
  async getDraftPRDetails({ owner, repo, prNumber }: { owner: string; repo: string; prNumber: number }): Promise<any> {
    try {
      // Updated: Use GraphQL for more detailed PR information
      const prDetails = await this.client.graphql(
        `
        query GetPullRequest($owner: String!, $repo: String!, $prNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              id
              title
              body
              isDraft
              mergeable
              additions
              deletions
              changedFiles
              commits(last: 10) {
                nodes {
                  commit {
                    message
                    author {
                      name
                      email
                    }
                    authoredDate
                  }
                }
              }
              files(first: 20) {
                nodes {
                  path
                  additions
                  deletions
                }
              }
              reviews(last: 5) {
                nodes {
                  state
                  author {
                    login
                  }
                }
              }
            }
          }
        }
      `,
        {
          owner,
          repo,
          prNumber,
        },
      );

      const pr = (prDetails as any).repository.pullRequest;

      console.log(`📊 Draft PR Analysis:`);
      console.log(`   Files changed: ${pr.changedFiles}`);
      console.log(`   Lines added: ${pr.additions}, deleted: ${pr.deletions}`);
      console.log(`   Mergeable: ${pr.mergeable}`);
      console.log(`   Recent commits: ${pr.commits.nodes.length}`);

      return pr;
    } catch (error) {
      throw new Error(`Failed to get draft PR details: ${(error as Error).message}`);
    }
  }



  /**
   * Create or update a file with AC-generated code
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - File path
   * @param content - File content
   * @param message - Commit message
   * @param branch - Branch name
   */
  async createOrUpdateFile(owner: string, repo: string, path: string, content: string, message: string, branch: string): Promise<void> {
    try {
      // Check if file exists
      let sha: string | undefined;
      try {
        const { data: existingFile } = await this.client.rest.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
        });

        if ('sha' in existingFile) {
          sha = existingFile.sha;
        }
      } catch (error) {
        // File doesn't exist, which is fine for creation
      }

      // Create or update file
      await this.client.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha,
      });
    } catch (error) {
      throw new Error(`Failed to create/update file ${path}: ${(error as Error).message}`);
    }
  }

  /**
   * Assign issue to Copilot (special handling since Copilot isn't a real user)
   * Copilot can't be assigned like a regular user
   */
  async assignIssueToCopilot({owner, repo, issueNumber}: {
    owner: string,
    repo: string,
    issueNumber: number,
  }): Promise<void> {
    const copilotAgentId = await this.getCopilotAgentId(owner, repo);
    const issueId = await this.getIssueId(owner, repo, issueNumber);

    if (copilotAgentId && issueId) {
      console.log("Copilot id", copilotAgentId, "issueId", issueId)
      // Step 1: Add Copilot-related labels
      await this.client.rest.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: ['copilot-assigned', 'ai-development', 'auto-code-gen'],
      });

      // Step 2: Add a comment indicating Copilot assignment
      await this.addComment(owner, repo, issueNumber, `Issue Assigned to GitHub Copilot`);

      const query = assignCopilotAgentToIssueQuery({
        issueId: issueId,
        assigneeIds: [copilotAgentId],
      });

      await this.client.graphql({ query });

    } else {
      console.warn(`No Copilot agent found for ${owner}/${repo}`);
    }
  }

  /**
   * Get repository information
   * @param owner - Repository owner
   * @param repo - Repository name
   */
  async getRepository(owner: string, repo: string): Promise<any> {
    try {
      const response = await this.client.rest.repos.get({
        owner,
        repo,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get repository info: ${(error as Error).message}`);
    }
  }

  private mapGitHubIssue(githubResponse: any): GitHubIssue {
    return {
      id: githubResponse.id,
      issue_id: githubResponse.node_id,
      number: githubResponse.number,
      title: githubResponse.title,
      body: githubResponse.body,
      state: githubResponse.state,
      labels: githubResponse.labels.map((label: any) => label.name),
      assignees: githubResponse.assignees.map((assignee: any) => assignee.login),
    };
  }
}
