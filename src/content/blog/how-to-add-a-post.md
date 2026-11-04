---
title: How to add a post to this site
description: A sample post that shows the steps for publishing, and how code and headings look.
date: 2026-11-04
tags: [Sample, Guide]
---

This is a sample post. Delete it once you have written your first real one.

## Publish a post

1. Add a Markdown file to `src/content/blog`. Obsidian can edit this folder directly.
2. Fill in the title, description and date at the top of the file.
3. Commit and push to `main`. GitHub builds and publishes the site.

## Keep a post private while drafting

Add `draft: true` to the top of the file. Draft posts stay out of the built site, but the Markdown file is still visible in a public repository, so keep sensitive notes elsewhere.

## Code blocks

```yaml
services:
  whoami:
    image: traefik/whoami
    restart: unless-stopped
```

> Before publishing homelab notes, remove internal addresses, domains and tokens.
