# SystemPulse College Submission Checklist

Use this checklist before submitting the SystemPulse project. Keep the actual links and verification evidence together in the final submission.

## 1. GitHub repository

- [ ] Repository link: https://github.com/cshanmukha777/systempulse
- [ ] Confirm the repository opens for the instructor in a signed-out/private browser window (the repository is currently public).
- [ ] Confirm the default branch is `main`.
- [ ] Confirm the latest commit is the intended final submission commit; record its full SHA and commit URL.
- [ ] Open and review the project overview and setup instructions in [README.md](../README.md).
- [ ] Confirm the latest GitHub Actions run for the final commit is green: typecheck, lint, unit tests, renderer build, and any required packaging workflow.
- [ ] Confirm source, tests, workflow files, and documentation are committed; do not rely on uncommitted local files.

## 2. AI chat history link

- [ ] In ChatGPT, open this project conversation and use the Share control (usually in the chat header or the conversation menu).
- [ ] Review the sharing preview and create a shared link if your account/workspace allows it.
- [ ] Copy the generated URL into the submission form or below; do not guess or manually construct a conversation URL.

**Conversation share URL:** _Paste the generated link here:_

- [ ] Open the shared URL in a private/incognito window or a signed-out browser to verify that it opens without relying on your logged-in session.
- [ ] Confirm the shared conversation contains only material you are comfortable sharing. A shared link may expose the conversation to anyone who has the link; avoid including credentials, tokens, personal data, or unrelated private material.
- [ ] If the link is unavailable, blocked by workspace policy, or cannot be opened by the instructor, ask the instructor which alternative evidence is accepted. Do not submit a normal private chat URL as though it were a verified share link.

## 3. macOS application (.dmg)

- [ ] Download the tested artifact from the successful **SystemPulse macOS package** GitHub Actions run or the versioned GitHub release, if published.
- [ ] Expected artifact name: `SystemPulse-1.0.0-universal.dmg`.
- [ ] Confirm the download completed and the file is nonempty.
- [ ] On macOS, verify the disk image with `hdiutil verify SystemPulse-1.0.0-universal.dmg`.
- [ ] Open the DMG, copy `SystemPulse.app` into `/Applications`, and launch it without running the development server.
- [ ] Check CPU, memory, and disk metrics; process listing and filtering; preference persistence; About panel; CPU-threshold notification behavior; and JSON export.
- [ ] Keep a screenshot or short evidence note for the instructor if requested.
- [ ] Note: the unsigned, non-notarized build may trigger a macOS security warning. Do not bypass security policy on a managed device; follow your institution's approved process.

**DMG download URL:** _Paste the verified release-asset or workflow-artifact link here:_

## 4. Final hand-in review

- [ ] Repository URL and final commit SHA recorded.
- [ ] README reviewed.
- [ ] AI conversation share link tested in a signed-out/private browser.
- [ ] DMG downloaded and tested on macOS; exact artifact link recorded.
- [ ] Any checks that could not be performed are clearly marked as unverified rather than reported as passed.
