import axios, { AxiosInstance } from 'axios';

export interface JiraConfig {
  domain: string;
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  key: string;
  id: string;
  summary: string;
  description?: string;
  status: string;
  issueType: string;
  acceptanceCriteria?: string[];
  assignee?: string;
  reporter?: string;
  priority: string;
  labels: string[];
  attachments?: JiraAttachment[];
  customFields?: Record<string, any>;
}

export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  content: string; // URL to download attachment
  isDesign: boolean; // Whether this is a design file
}

export interface AcceptanceCriteria {
  id: string;
  criterion: string;
  status: 'pending' | 'in-progress' | 'completed';
  testCases?: string[];
}

/**
 * Service for interacting with Jira API
 * Handles issue retrieval, AC parsing, and status updates
 */
export class JiraService {
  private client: AxiosInstance;
  private jiraConfig: JiraConfig;

  constructor(config: JiraConfig) {
    this.jiraConfig = config;
    // Making a reusable Axios "client" with this settings
    this.client = axios.create({
      baseURL: `https://${this.jiraConfig.domain}/rest/api/3`,
      auth: {
        username: this.jiraConfig.email,
        password: this.jiraConfig.apiToken
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Retrieve a Jira issue by key with all relevant information
   * AC: GitHub should read description, acceptance criteria, and might have an attached design
   * @param issueKey - The Jira issue key (e.g., "PROJ-123")
   * @returns Promise<JiraIssue>
   */
  async getIssue(issueKey: string): Promise<JiraIssue> {
    try {
      const response = await this.client.get(`/issue/${issueKey}`);

      const issue = response.data;
      const mappedIssue = this.mapJiraIssue(issue);
      
      // Get attachments (especially design files)
      mappedIssue.attachments = await this.getIssueAttachments(issueKey);
      
      console.log(`Retrieved Jira issue ${issueKey}:`);
      console.log(`- Description: ${mappedIssue.description ? 'Present' : 'Missing'}`);
      console.log(`- Attachments: ${mappedIssue.attachments.length} files`);
      console.log(`- Design files: ${mappedIssue.attachments.filter(a => a.isDesign).length}`);

      return mappedIssue;
    } catch (error) {
      throw new Error(`Failed to fetch Jira issue ${issueKey}: ${(error as Error).message}`);
    }
  }

  /**
   * Get attachments for a Jira issue, identifying design files
   * @param issueKey - The Jira issue key
   * @returns Promise<JiraAttachment[]>
   */
  async getIssueAttachments(issueKey: string): Promise<JiraAttachment[]> {
    try {
      const response = await this.client.get(`/issue/${issueKey}`, {
        params: {
          fields: 'attachment'
        }
      });

      const attachments = response.data.fields.attachment || [];
      const designExtensions = ['.fig', '.sketch', '.psd', '.ai', '.xd', '.png', '.jpg', '.jpeg', '.svg'];
      
      return attachments.map((att: any) => ({
        id: att.id,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        content: att.content,
        isDesign: designExtensions.some(ext => 
          att.filename.toLowerCase().endsWith(ext)
        ) || att.mimeType.startsWith('image/')
      }));
    } catch (error) {
      console.error(`Failed to get attachments for ${issueKey}:`, error);
      return [];
    }
  }

  /**
   * Extract acceptance criteria from issue description or custom fields
   * @param JiraIssue - The Jira issue
   * @returns Promise<AcceptanceCriteria[]>
   */
  async getAcceptanceCriteria(issue: JiraIssue, issueKey: string): Promise<AcceptanceCriteria[]> {
    const criteria: AcceptanceCriteria[] = [];

    // Parse AC from description, each User Story should start in a new paragraph
    if (issue.description) {
      const acMatches = issue.description.match(/(?:AC|Acceptance Criteria?|Given.*When.*Then)/gi);
      if (acMatches) {
        // Extract structured AC from description
        criteria.push(...this.parseAcceptanceCriteria(issue.description));
      }
    }

    // Check custom AC field if it exists
    if (issue.acceptanceCriteria) {
      criteria.push(...issue.acceptanceCriteria.map((ac, index) => ({
        id: `${issueKey}-AC-${index + 1}`,
        criterion: ac,
        status: 'pending' as const
      })));
    }

    return criteria;
  }

  /**
   * Parse acceptance criteria from text using common patterns
   * @param text - The text to parse
   * @returns AcceptanceCriteria[]
   */
  private parseAcceptanceCriteria(text: string): AcceptanceCriteria[] {
    const criteria: AcceptanceCriteria[] = [];
    let index = 1;

    // First, try to find GIVEN...WHEN...THEN patterns
    // Split text into paragraphs and look for complete GWT blocks
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    
    for (const paragraph of paragraphs) {
      // Look for GIVEN at the start of a paragraph (case insensitive)
      if (/^\s*GIVEN/i.test(paragraph)) {
        // Try to extract a complete GWT from this paragraph
        const gwtMatch = paragraph.match(/GIVEN\s+(.+?)\s+WHEN\s+(.+?)\s+THEN\s+(.+?)(?:\s*$|\n)/gi);
        
        if (gwtMatch) {
          criteria.push({
            id: `AC-${index}`,
            criterion: `GIVEN ${gwtMatch[1].trim()}\nWHEN ${gwtMatch[2].trim()}\nTHEN ${gwtMatch[3].trim()}`,
            status: 'pending',
            testCases: [
              `Test: ${gwtMatch[2].trim()}`,
              `Expected: ${gwtMatch[3].trim()}`
            ]
          });
          index++;
        } else {
          // If not a complete GWT, treat as a single criterion
          criteria.push({
            id: `AC-${index}`,
            criterion: paragraph.trim(),
            status: 'pending'
          });
          index++;
        }
      }
    }

    // If no GIVEN patterns found, look for other AC patterns
    if (criteria.length === 0) {
      // Pattern for bullet points or numbered lists that look like AC
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Match lines that start with bullets, numbers, or contain AC keywords
        const isAC = /^(?:\d+\.|\*|-)\s*(.+)/.test(trimmedLine) ||
                    /(?:should|must|will|shall|can|able to)/i.test(trimmedLine);
                    
        if (isAC && trimmedLine.length > 10) { // Avoid very short lines
          const content = trimmedLine.replace(/^(?:\d+\.|\*|-)\s*/, '').trim();
          criteria.push({
            id: `AC-${index}`,
            criterion: content,
            status: 'pending'
          });
          index++;
        }
      }
    }

    return criteria;
  }

  /**
   * Update issue status or add comments
   * @param issueKey - The Jira issue key
   * @param update - The update to apply
   */
  async updateIssue(issueKey: string, update: {
    status?: string;
    comment?: string;
    customFields?: Record<string, any>;
  }): Promise<void> {
    try {
      if (update.status) {
        // Transition issue to new status
        await this.transitionIssue(issueKey, update.status);
      }

      if (update.comment) {
        await this.addComment(issueKey, update.comment);
      }

      if (update.customFields) {
        await this.client.put(`/issue/${issueKey}`, {
          fields: update.customFields
        });
      }
    } catch (error) {
      throw new Error(`Failed to update Jira issue ${issueKey}: ${(error as Error).message}`);
    }
  }

  private async transitionIssue(issueKey: string, status: string): Promise<void> {
    // Get available transitions
    const transitionsResponse = await this.client.get(`/issue/${issueKey}/transitions`);
    const transition = transitionsResponse.data.transitions.find((t: any) => 
      t.to.name.toLowerCase() === status.toLowerCase()
    );

    if (transition) {
      await this.client.post(`/issue/${issueKey}/transitions`, {
        transition: { id: transition.id }
      });
    }
  }

  private async addComment(issueKey: string, comment: string): Promise<void> {
    await this.client.post(`/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: comment
              }
            ]
          }
        ]
      }
    });
  }

  private mapJiraIssue(jiraResponse: any): JiraIssue {
    const fields = jiraResponse.fields;
    return {
      key: jiraResponse.key,
      id: jiraResponse.id,
      summary: fields.summary,
      description: this.extractTextFromADF(fields.description),
      status: fields.status.name,
      issueType: fields.issuetype.name,
      assignee: fields.assignee?.displayName,
      reporter: fields.reporter?.displayName,
      priority: fields.priority?.name || 'Medium',
      labels: fields.labels || [],
      attachments: [], // Will be populated by getIssue method
      customFields: fields
    };
  }

  /**
   * Extract plain text from Atlassian Document Format (ADF)
   * @param adfContent - The ADF content object
   * @returns Plain text string
   */
  private extractTextFromADF(adfContent: any): string {
    if (!adfContent || !adfContent.content) {
      return '';
    }

    let text = '';
    
    const extractFromContent = (content: any[]): string => {
      let result = '';
      
      for (const item of content) {
        if (item.type === 'text') {
          result += item.text;
        } else if (item.type === 'paragraph') {
          if (item.content) {
            result += extractFromContent(item.content) + '\n\n'; // Double line break for paragraphs
          }
        } else if (item.type === 'bulletList' || item.type === 'orderedList') {
          if (item.content) {
            for (const listItem of item.content) {
              if (listItem.type === 'listItem' && listItem.content) {
                result += '- ' + extractFromContent(listItem.content) + '\n';
              }
            }
            result += '\n'; // Extra line break after lists
          }
        } else if (item.type === 'codeBlock') {
          if (item.content) {
            result += '```\n' + extractFromContent(item.content) + '\n```\n\n';
          }
        } else if (item.type === 'heading') {
          if (item.content) {
            const level = item.attrs?.level || 1;
            result += '#'.repeat(level) + ' ' + extractFromContent(item.content) + '\n\n';
          }
        } else if (item.content) {
          // For other types with nested content, recursively extract
          result += extractFromContent(item.content);
        }
      }
      
      return result;
    };

    text = extractFromContent(adfContent.content);
    return text.trim();
  }
}
