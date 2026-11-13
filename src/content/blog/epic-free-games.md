---
title: "Never miss a free Epic game: a 150-line notifier on my own hardware"
description: A standard-library Python script that checks the Epic Games Store every evening, looks up a rating, and pushes new free games to my phone through ntfy, scheduled by Node-RED and running on my Debian box. Inspired by sh13y's epic-free-games-notifier.
date: 2026-11-13
tags: [Homelab, Automation, Python, Node-RED, ntfy]
cover: "[[epic-free-games-cover.jpg]]"
---

Epic gives away a game or two every week, and I keep finding out on Friday, after it's gone. Opening the store every day to check is exactly the kind of chore I refuse to do twice.

So now my phone tells me. Every evening at 6, a small script checks the store, and if there's something new and free, I get a notification with the cover art, the original price, a rating and the date it stops being free. The first one landed today: **Knightica**, normally $14.99.

> **The short version**
>
> One Python file using only the standard library. It reads Epic's public promotions feed, keeps games that cost $0 right now, looks up a Metacritic score through Steam's public search, and posts to my self-hosted ntfy. A tiny JSON file remembers what it has already sent. Node-RED runs it at 18:00 every day over SSH on my Debian box.

## Credit where it's due

The idea comes from **[sh13y/epic-free-games-notifier](https://github.com/sh13y/epic-free-games-notifier)**: a Python script that fetches the Epic Games Store's free games and emails them to you, scheduled daily with GitHub Actions, with a notification history so you don't get the same game twice. It's a lovely, simple project, and if you want email and zero hardware, use it.

I wanted two things it wasn't built for: push notifications on my phone instead of email, and running at home next to the rest of my automations instead of on GitHub's runners. So I wrote my own take on the same idea, keeping its best habit of remembering what it has already sent.

## How a run works

![Every day at 18:00](/images/blog/epic-free-games/pipeline.svg?v=1)

*Node-RED fires the schedule, builds the command and runs it on pluto over SSH. The script asks Epic, then Steam, then sends to ntfy, which lands on my phone.*

### 1. Ask Epic what's free

Epic's store has a public feed of current promotions. No login, no API key:

```python
EPIC_URL = ("https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions"
            f"?locale=en-US&country={COUNTRY}&allowCountries={COUNTRY}")
```

It returns everything with a promotion attached: discounts, upcoming freebies, and the current free games all mixed together. A game counts as free **right now** only if both are true:

- its current price is exactly 0, and
- it has an *active* promotional offer at 0% of the price (Epic's way of saying 100% off).

Anything titled "Mystery Game" is skipped too. Epic uses those as placeholders before a reveal, and a notification saying "Mystery Game is free" helps nobody.

![What one run decides](/images/blog/epic-free-games/decisions.svg?v=1)

*Thirteen items came back on the first run. Twelve were skipped, one was new, and the next day that same game stays quiet.*

### 2. Find out if it's any good

Free isn't always worth the disk space, so the notification includes a score. Steam's public store search returns a Metacritic score when one exists, again with no key:

```python
items = get_json(f"https://store.steampowered.com/api/storesearch/?term={q}&cc=US&l=en")["items"]
```

The script prefers an exact title match and falls back to the first result. If there's no score, it says "Not rated" rather than guessing.

### 3. Push it to my phone

[ntfy](https://ntfy.sh) is a dead-simple push service that I self-host. One HTTP POST with a JSON body and the notification is on my phone, with a picture:

```python
body = {
    "topic": NTFY_TOPIC,
    "title": f"Free on Epic: {game['title']}",
    "message": f"Original price: {game['price']}\nRating: {game['rating']}\nFree until: {game['ends']}",
    "click": game["url"],          # tap to open the store page
    "tags": ["video_game"],
    "attach": game["image"],       # the wide cover art
}
```

The server and topic come from an `NTFY_URL` environment variable, for example `https://ntfy.example.com/your-topic`.

### 4. Don't say it twice

Without memory, a daily check would announce the same game every evening for a week. So the script keeps `sent_games.json` next to itself: the ids of games it has already announced. After each run it saves only the ids of games that are **still free**, so the file never grows beyond a handful of entries, and a game that comes back free months later gets announced again.

If a notification fails to send, that game isn't marked as sent, so tomorrow's run tries again.

## The Node-RED side

The script is the easy half. The schedule lives in Node-RED, next to everything else in my house, and I built the tab by asking Claude through the [Node-RED MCP server](/blog/nodered-mcp/) I'd set up earlier the same day.

![The Node-RED tab](/images/blog/epic-free-games/flow.svg?v=1)

*Three ways to start it, one command, one SSH node. The results go to the debug sidebar and to flow context.*

- **Daily 6:00 PM** is a cron-plus node with the time zone set explicitly, so it fires at 18:00 my time whatever the server thinks.
- **Run now** and **Dry run** are inject buttons. A dry run sets `DRY_RUN=1`, which prints what it *would* send and doesn't touch the state file. That's how I tested it without spamming my phone.
- **build command** turns any of those into `cd ~/py_scripts && python3 epic_free_games.py`.
- **deborah ssh** runs it on pluto, my Debian box, using the same SSH connection my other script flows use.
- **record last run** keeps the last 50 runs (time, trigger, exit code, output) in flow context, and turns the node status green or red.

The one gotcha: this SSH node returns the **command you sent** in `msg.payload`, and the script's actual output in `msg.session.stdout`, `msg.session.stderr` and `msg.session.code`. My first version logged `msg.payload` and proudly recorded a perfect copy of the command, every time. Reading the node's short source fixed that in a minute.

## Testing it

The first dry run failed in a useful way: `can't open file ... epic_free_games.py`. The script was in my git repo but not yet on pluto. One `git pull` later, the second dry run came back with exit code 0:

```text
=== run start ===
already notified: 0 game(s)
Epic returned 13 promo items
  skip: Alien: Isolation
  ...
  FREE: Knightica (was $14.99, ends Thu 19 Nov 2026, 16:00 UTC)
1 free now, 1 new
```

Then a real run, and my phone buzzed.

## sh13y's version vs mine

| | sh13y/epic-free-games-notifier | My version |
| --- | --- | --- |
| Delivery | Email over SMTP | ntfy push, with cover image and a tap-to-open link |
| Runs on | GitHub Actions, daily | My Debian box, triggered by Node-RED at 18:00 |
| Dependencies | `requirements.txt` | Python standard library only |
| Repeats | Notification history in a JSON file | Same idea: `sent_games.json`, trimmed to games still free |
| Extras | Simple, no hardware needed | Metacritic score, dry-run mode, run history in Node-RED |

Both are tiny. Pick the one that matches where your notifications already live.

## What doesn't work yet

- **US store by default.** The country is a setting (`COUNTRY`), but prices and dates are only tested against the US feed.
- **The rating match is naive.** A game with a common name can pick up the wrong Steam result.
- **No alert when it fails.** A red status in Node-RED is easy to miss. It should send a notification when the script itself breaks.
- **No filter for add-ons.** If Epic gives away DLC, it would be announced like a game.

## What's next

A Friday reminder for games I haven't claimed yet, a fallback for when Epic changes its feed (it will), and maybe the same treatment for other stores' giveaways.

If I have to check a store twice, I automate it.

*The idea and the original script: [sh13y/epic-free-games-notifier](https://github.com/sh13y/epic-free-games-notifier), licensed WTFPL. Thank you!*
