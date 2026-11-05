---
title: "Sample: automating the boring stuff"
description: A placeholder post about turning a repetitive chore into a script that runs while you sleep.
date: 2026-11-01
tags: [Automation, Sample]
---

This sample post uses the automation theme for its generated thumbnail.

## The chore

What did you keep doing by hand, and how often?

## The automation

The script, the schedule and the trigger. A code block helps:

```python
import schedule, time

schedule.every().day.at("02:00").do(lambda: print("backups done"))
while True:
    schedule.run_pending()
    time.sleep(60)
```

## Was it worth it?

Time spent automating against time saved. Be honest.
