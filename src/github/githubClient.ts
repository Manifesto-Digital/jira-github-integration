import { Octokit } from "@octokit/rest";
import { graphql } from "@octokit/graphql";

export class GitHubClient {
  public rest: Octokit;
  public graphql: typeof graphql;

  constructor(token: string) {
    this.rest = new Octokit({ auth: token });
    this.graphql = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
  }
}
