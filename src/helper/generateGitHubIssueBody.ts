import { env } from 'process';
import { JiraIssue } from '../jira/jira-service';

export interface AcceptanceCriterion {
  id: string;
  criterion: string;
  status: string;
  testCases?: string[];
}

export const generateGitHubIssueBody=({title, ticket, acceptanceCriteria}: {title: string, ticket: JiraIssue, acceptanceCriteria: AcceptanceCriterion[]})=>{
  const description = ticket.description || 'No description provided';
  return `## User Story
${ticket.summary}

## 📝 Description
${description}

## Acceptance Criteria
${acceptanceCriteria.map(
    (ac, i) => `
### ${ac.id}: ${ac.criterion}
- [ ] Implementation completed
- [ ] Tests written and passing
- [ ] Code reviewed
${ac.testCases ? ac.testCases.map((test) => `- [ ] Test case: ${test}`).join('\n') : ''}
`,
  )
  .join('\n')}

## GitHub Copilot Instructions

**This issue is optimized for GitHub Copilot code generation. Follow these steps:**

\`\`\`
@workspace Implement the following user story with all acceptance criteria:

**User Story:** ${ticket.summary}

**Requirements:**
${acceptanceCriteria.map((ac) => `- ${ac.criterion}`).join('\n')}

**Technical Requirements:**
- Use TypeScript for type safety
- Include comprehensive error handling  
- Follow clean architecture principles
- Implement proper validation

Please generate:
1. Main implementation files
2. Type definitions/interfaces
3. Unit tests (if needed)
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
- **Jira Ticket:** [${ticket.key}](https://${env.JIRA_DOMAIN}/browse/${ticket.key})
- **Priority:** ${ticket.priority || 'Not set'}
- **Issue Type:** ${ticket.issueType || 'Unknown'}

## 📋 Definition of Done
- [ ] All acceptance criteria implemented
- [ ] Code reviewed and approved
- [ ] No breaking changes introduced

---
*This issue was automatically generated from Jira ticket ${ticket.key}*
*Use GitHub Copilot to implement the requirements above*`;
}
