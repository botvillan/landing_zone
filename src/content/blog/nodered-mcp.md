---
title: "Giving Claude the keys to Node-RED (with a spare set in git)"
description: How I connected Claude Code to the Node-RED add-on in Home Assistant through a 220-line MCP server, so it can read, change and test my flows, with a backup before every change and every flow in git.
date: 2026-11-13
tags: [Homelab, Automation, Node-RED, Home Assistant, Claude Code, MCP]
cover: "[[nodered-mcp-cover.jpg]]"
---

My Node-RED has been growing for years. It runs as an add-on inside Home Assistant and holds **89 tabs**, of which 13 are actually switched on. The other 76 are experiments, half-finished ideas, and at least three tabs called "Flow 1". It does a lot of quiet work in my house, and nobody, including me, could tell you exactly what's in there.

So I gave it to an AI. Carefully.

> **The short version**
>
> A single Python file, run by `uv`, speaks the Model Context Protocol on one side and the Node-RED Admin API on the other. Claude Code gets 15 tools to read, search, create, edit, disable, deploy and trigger flows. Every change writes a full backup first, and a separate exporter puts every flow into a private git repo, split per tab, so I can diff and roll back anything.

## Why not just click around?

Because the questions I actually have are like *"which flows still SSH into the old server?"* or *"what does Master Caution System actually do?"*. Answering those in the editor means opening tabs one by one, double-clicking nodes and reading function code in a tiny box. Answering them from the flow JSON is instant, if something can read 1,200 nodes without getting bored.

MCP (Model Context Protocol) is the standard way to give an AI agent tools. Write a small server that exposes some functions, register it, and the agent can call them, with my approval for each call. I built this one in a session with Claude Code, the same way I [built this site](/blog/how-this-site-was-built/).

## How it's wired

![How Claude reaches Node-RED](/images/blog/nodered-mcp/architecture.svg?v=1)

*A request travels from Claude, through the MCP server, past the add-on's login check, to the Node-RED Admin API. Every write also drops a full backup on the side.*

The one surprise was step 3. The Home Assistant Node-RED add-on puts nginx in front of port 1880, and that nginx checks **HTTP Basic auth against Home Assistant users**. A long-lived Home Assistant token doesn't work there, and neither does Node-RED's own token login. So the server logs in as a dedicated, local-only Home Assistant user, and the password lives in a git-ignored `.env` file next to the script:

```ini
NODERED_URL=http://<home-assistant-ip>:1880
NODERED_USER=nodered-mcp
NODERED_PASS=...
```

Nothing sensitive ever goes into the chat or into Claude's own config file.

## One file, no Node.js

My PC doesn't have Node.js, and I didn't want a project folder with a virtualenv to babysit. So the server is a single Python file with its dependencies declared inline, and `uv` installs them on first run:

```python
# /// script
# requires-python = ">=3.10"
# dependencies = ["mcp>=1.2,<2", "httpx>=0.27"]
# ///
```

Registering it with Claude Code is one command:

```bash
claude mcp add --scope user node-red -- uv run --quiet --script /path/to/nodered-mcp/server.py
```

That `<2` pin is there for a reason. The first run failed because version 2 of the MCP Python SDK renamed `FastMCP` to `MCPServer`. Pinning to v1 fixed it in one line.

## The toolbox

![The 15 tools, grouped](/images/blog/nodered-mcp/tools.svg?v=1)

*Review tools are read-only. Modify tools all write a backup first. Run has one tool, and it presses inject buttons.*

Each tool is a thin wrapper around one Admin API call. Two details matter:

- **Edits are per tab.** `update_flow` uses `PUT /flow/:id`, so only that one tab is redeployed and the other 88 keep running. Full deploys (`POST /flows`) exist, but only for changes that span tabs, like merging config nodes.
- **API v2 with revisions.** Full deploys send the current `rev`, so if I've changed something in the editor in the meantime, Node-RED refuses the deploy instead of quietly overwriting my work.

`search_nodes` turned out to be the most useful one. It does a text search across every property of every node, function code included, so *"which flows touch this entity?"* takes one call.

## A backup before every change

An agent that can delete flows needs an undo button. Before any write, the server pulls the full flow config and saves it as `backups/flows-<timestamp>-before-update.json`. `restore_backup` puts any of those back, and backs up the current state first, so even a restore can be undone.

To prove the writes worked without touching anything real, the first test was a throwaway tab: create it, read it back, rename it, press its inject button, delete it, and check the tab count was back to 89. That's now a `smoke_test.py --write` in the repo.

## Every flow in git

Backups are good, but a pile of JSON files doesn't tell you *what changed*. So I also wrote an exporter that splits the whole Node-RED config into a private git repo:

| File | What it's for |
| --- | --- |
| `flows.json` | The full config. This is what you restore from. |
| `flows/NN-<tab>.json` | One file per tab, so a diff shows exactly which tab moved |
| `functions/<tab>/<node>.js` | Every function node's code as a plain `.js` file, so I can read and search it |
| `config-nodes.json`, `installed-nodes.json` | Home Assistant servers, MQTT, the palette modules and their versions |
| `INVENTORY.md` | Every tab, on or off, with node counts |

Node-RED never returns credential fields through its API, so passwords stored the proper way are never exported. Anything typed into an ordinary field is a different story, so the exporter redacts known secrets, and I check the staged files for them before every commit.

![One change, safely](/images/blog/nodered-mcp/safe-change.svg?v=1)

*Snapshot, change one tab, export, review the diff, push. If something breaks, the restore is one tool call away.*

## What it found on day one

The first full read was humbling:

- **89 tabs, 13 enabled.** The rest are a museum of things I tried over the years.
- **9 separate Home Assistant server config nodes,** from years of importing other people's flows. They all point at the same Home Assistant.
- **Duplicate names everywhere:** two "Flow 1"s, two "Flow 2"s, and two "ntfy to MeTube" tabs, one on and one off.
- **206 function nodes,** now readable as plain files for the first time.

None of that is broken, exactly. But I couldn't have told you any of it before.

## What it's like to use

I don't call tools by name. I ask things like:

- *"Explain what Master Caution System does, node by node."*
- *"Which flows still run commands over SSH, and on which hosts?"*
- *"Create a flow that runs a Python script on my Debian box every day at 6 PM."* That one became [my Epic Games notifier](/blog/epic-free-games/).

Claude Code asks before each tool call. I've allowed the read-only tools to run without asking and kept every write on manual approval, which feels like the right amount of trust.

## What doesn't work yet

- **No reading debug output.** The Admin API can't see the debug sidebar, so to check a flow's result I have it write to flow context and read that back. It works, but it's a workaround.
- **Exports are manual.** I still run the exporter and commit by hand after a change. It should run on a schedule.
- **Plain HTTP on the LAN.** Fine at home. For remote use it goes over Tailscale, never an open port.
- **Context is in memory.** A Node-RED restart clears the run history the flows keep.

## What's next

Clean up the museum. Merge the nine Home Assistant config nodes into one, delete the empty tabs, and give the duplicates real names. Every step will be a reviewable commit, so for once tidying up won't be scary.

If I have to click through 89 tabs twice, I automate it.
