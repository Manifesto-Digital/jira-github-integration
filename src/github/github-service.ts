import { Octokit } from '@octokit/rest';

export interface GitHubConfig {
  token: string;
  owner?: string;
  repo?: string;
}

export interface GitHubIssue {
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
  private octokit: Octokit;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token
    });
  }

  /**
   * Create a GitHub issue from Jira ticket
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issue - Issue data
   * @returns Promise<GitHubIssue>
   */
  async createIssue(owner: string, repo: string, issue: {
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
  }): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.rest.issues.create({
        owner,
        repo,
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
        assignees: issue.assignees,
        milestone: issue.milestone
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
  async updateIssue(owner: string, repo: string, issueNumber: number, update: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
  }): Promise<GitHubIssue> {
    try {
      const response = await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        title: update.title,
        body: update.body,
        state: update.state,
        labels: update.labels
      });

      return this.mapGitHubIssue(response.data);
    } catch (error) {
      throw new Error(`Failed to update GitHub issue: ${(error as Error).message}`);
    }
  }

  /**
   * Create a pull request based on acceptance criteria
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pr - Pull request data
   * @returns Promise<PullRequest>
   */
  async createPullRequest(owner: string, repo: string, pr: {
    title: string;
    body?: string;
    head: string;
    base: string;
    draft?: boolean;
  }): Promise<PullRequest> {
    try {
      const response = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title: pr.title,
        body: pr.body,
        head: pr.head,
        base: pr.base,
        draft: pr.draft || false
      });

      return this.mapPullRequest(response.data);
    } catch (error) {
      throw new Error(`Failed to create pull request: ${(error as Error).message}`);
    }
  }

  /**
   * Create a branch for implementing acceptance criteria
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param branchName - Name of the new branch
   * @param baseBranch - Base branch to create from (default: main)
   */
  async createBranch(owner: string, repo: string, branchName: string, baseBranch: string = 'main'): Promise<void> {
    try {
      // Get the SHA of the base branch
      const { data: baseRef } = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`
      });

      // Create the new branch
      await this.octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha
      });
    } catch (error) {
      throw new Error(`Failed to create branch ${branchName}: ${(error as Error).message}`);
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
  async createOrUpdateFile(
    owner: string, 
    repo: string, 
    path: string, 
    content: string, 
    message: string, 
    branch: string
  ): Promise<void> {
    try {
      // Check if file exists
      let sha: string | undefined;
      try {
        const { data: existingFile } = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref: branch
        });
        
        if ('sha' in existingFile) {
          sha = existingFile.sha;
        }
      } catch (error) {
        // File doesn't exist, which is fine for creation
      }

      // Create or update file
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString('base64'),
        branch,
        sha
      });
    } catch (error) {
      throw new Error(`Failed to create/update file ${path}: ${(error as Error).message}`);
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
      await this.octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: comment
      });
    } catch (error) {
      throw new Error(`Failed to add comment: ${(error as Error).message}`);
    }
  }

  /**
   * Request review from specific users
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @param reviewers - Array of GitHub usernames
   */
  async requestReview(owner: string, repo: string, prNumber: number, reviewers: string[]): Promise<void> {
    try {
      await this.octokit.rest.pulls.requestReviewers({
        owner,
        repo,
        pull_number: prNumber,
        reviewers
      });
    } catch (error) {
      throw new Error(`Failed to request review: ${(error as Error).message}`);
    }
  }

  /**
   * Assign users to an issue or PR
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue/PR number
   * @param assignees - Array of GitHub usernames
   */
  async assignUsers(owner: string, repo: string, issueNumber: number, assignees: string[]): Promise<void> {
    try {
      await this.octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: issueNumber,
        assignees
      });
    } catch (error) {
      throw new Error(`Failed to assign users: ${(error as Error).message}`);
    }
  }

  /**
   * Get repository information
   * @param owner - Repository owner
   * @param repo - Repository name
   */
  async getRepository(owner: string, repo: string): Promise<any> {
    try {
      const response = await this.octokit.rest.repos.get({
        owner,
        repo
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get repository info: ${(error as Error).message}`);
    }
  }

  private mapGitHubIssue(githubResponse: any): GitHubIssue {
    return {
      number: githubResponse.number,
      title: githubResponse.title,
      body: githubResponse.body,
      state: githubResponse.state,
      labels: githubResponse.labels.map((label: any) => label.name),
      assignees: githubResponse.assignees.map((assignee: any) => assignee.login)
    };
  }

  private mapPullRequest(githubResponse: any): PullRequest {
    return {
      number: githubResponse.number,
      title: githubResponse.title,
      body: githubResponse.body,
      head: githubResponse.head.ref,
      base: githubResponse.base.ref,
      state: githubResponse.state,
      draft: githubResponse.draft
    };
  }
}
