// Central allowlisted URLs for CP Companion.
// Replace OWNER/REPO and sponsor handles before publishing.
export const PROJECT_LINKS = {
  githubRepo:     "https://github.com/OWNER/REPO",
  githubSponsors: "https://github.com/sponsors/OWNER",
  kofi:           "https://ko-fi.com/OWNER",
  reportBug:      "https://github.com/OWNER/REPO/issues/new",
  downloadLatest: "https://github.com/OWNER/REPO/releases/latest",
} as const;

export type ProjectLinkKey = keyof typeof PROJECT_LINKS;
