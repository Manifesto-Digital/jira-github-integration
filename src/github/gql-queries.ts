export const getCopilotAgentIdQuery = (owner: string, repo: string) => `
  query {
  repository(owner: "${owner}", name: "${repo}") {
    suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 100) {
      nodes {
        login
        __typename
        ... on Bot {
          id
        }
      }
    }
  }
}
`;

export const getIssueIdQuery = (owner: string, repo: string, issueNumber: number) => `
  query {
  repository(owner: "${owner}", name: "${repo}") {
    issue(number: ${issueNumber}) { id }
  }
}
`;

export const assignCopilotAgentToIssueQuery = ({issueId, assigneeIds }: {
  issueId: string,
  assigneeIds: string[],
}) => `
  mutation {
  replaceActorsForAssignable(input: { assignableId: "${issueId}", actorIds: ${JSON.stringify(assigneeIds)} }) {
    assignable {
      ... on Issue {
        id
        title
        assignees(first: 10) {
          nodes {
            login
          }
        }
      }
    }
  }
}
`;
