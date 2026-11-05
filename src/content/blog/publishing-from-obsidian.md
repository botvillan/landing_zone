---
title: Publishing from Obsidian
description: How posts, images and thumbnails work on this site when everything is written in Obsidian.
date: 2026-11-05
tags: [Guide, Obsidian]
cover: "[[obsidian-workflow-cover.png]]"
---

Every post and project on this site is a Markdown note in an Obsidian folder that syncs to the repository. Push to `main` and GitHub rebuilds the site in about a minute.

## Write a post

1. Create a note in the `blog` folder (or `projects` for a project).
2. Add properties at the top: `title`, `description`, `date` and `tags`.
3. Drop images anywhere in the note. Obsidian's `![[image.png]]` embeds work as they are.

Anything you leave out gets a fallback: the file name becomes the title, the first lines become the description, and the file date becomes the post date.

## Images

Paste or drag an image into the note, and Obsidian saves it to your attachments folder. The site finds it wherever it is inside the synced folder and serves it resized and compressed.

![[sample-pipeline.png|A data pipeline sketch]]

*An image embedded with Obsidian's `![[ ]]` syntax.*

## Thumbnails

Set a `cover` property to choose the thumbnail:

```yaml
cover: "[[my-cover.png]]"
```

No cover? The first image in the note is used instead. No images at all? The site draws a thumbnail for you, themed by the tags: data, automation or homelab.

## Drafts

Add `draft: true` to keep a note off the site, or start its file name with `_`. The note is still in the repository, so keep secrets, internal addresses and tokens out of it.

> If I have to do it twice, I automate it. Publishing included.
