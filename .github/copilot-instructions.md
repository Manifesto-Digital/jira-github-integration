# Copilot Instructions for Jira-GitHub Integration

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Context
This is a Jira-GitHub integration project that synchronizes issues, pull requests, and automation between Atlassian Jira and GitHub.

## Code Generation Guidelines

### When writing code based on Acceptance Criteria (AC):
1. Always read the AC from Jira tickets or comments first
2. Generate code that directly addresses each acceptance criterion
3. Include proper error handling and validation
4. Add comprehensive comments explaining how the code fulfills each AC point

### API Integration Patterns:
- Use the Jira REST API v3 for all Jira operations
- Use GitHub's REST API v4 or GraphQL API for GitHub operations
- Implement proper authentication using API tokens
- Handle rate limiting and retry logic
- Log all API interactions for debugging

### Project Structure:
- `/src` - Core services and utilities
- `/src/jira` - Jira API integration service
- `/src/github` - GitHub API integration service
- `/scripts` - Standalone scripts for manual workflow
- `/docs` - Project documentation

### Security Considerations:
- Never hardcode API tokens or credentials
- Use environment variables for all sensitive data
- Validate all webhook payloads
- Implement proper CORS and security headers

### Code Style:
- Use TypeScript for type safety
- Follow async/await patterns
- Implement proper error boundaries
- Use descriptive variable and function names
- Add JSDoc comments for public APIs
