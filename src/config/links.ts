// Central allowlisted URLs for CP Companion.
export const PROJECT_LINKS = {
  githubRepo:     "https://github.com/priyanshu-18/cp-companion",
  githubSponsors: "https://github.com/sponsors/priyanshu-18",
  kofi:           "https://ko-fi.com/impropriyanshu",
  reportBug:      "https://github.com/priyanshu-18/cp-companion/issues/new",
  downloadLatest: "https://github.com/priyanshu-18/cp-companion/releases/latest",
} as const;

export type ProjectLinkKey = keyof typeof PROJECT_LINKS;
