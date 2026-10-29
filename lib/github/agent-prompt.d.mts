export function buildGithubAgentInstructions(
  repos: Array<{ full_name: string; default_branch: string }>,
  options: { maxSteps: number }
): string
