// Central allowlisted URLs for CP Companion.
// Replace OWNER/REPO and sponsor handles before publishing.
export const PROJECT_LINKS = {
  githubRepo:     "https://github.com/priyanshu-18/cp-companion",
  githubSponsors: "https://github.com/priyanshu-18/cp-companion",
  kofi:           "https://ko-fi.com/impropriyanshu",
  reportBug:      "https://github.com/OWNER/REPO/issues/new",
  downloadLatest: "https://ko-fi.com/impropriyanshu",
} as const;

export type ProjectLinkKey = keyof typeof PROJECT_LINKS;
