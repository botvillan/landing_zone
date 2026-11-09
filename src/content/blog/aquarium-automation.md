---
title: "Feedback Loop: my aquarium automation that learns, forecasts and tattles"
description: How I turned a NodeMCU, a laser distance sensor and a hobby servo into an aquarium feeder that knows how much food is left, predicts when it runs out, and notices when a feed jams.
date: 2026-11-09
tags: [Homelab, Automation, ESPHome, Home Assistant]
cover: "[[aquarium-automation-cover.jpg]]"
---

A shop-bought fish feeder is a timer with a drum on it. It turns when the clock says so, and it has no idea whether any food came out, how much is left, or whether the drum has been jammed since Tuesday. You find out when the fish start looking at you funny.

**Feedback Loop** is my answer to that: the automation on my aquarium, named for the feeding and for the control loop that learns from it. It's a small ESPHome controller on the tank that feeds with a servo, measures the food left in the hopper with a laser, learns how fast the food goes, and tells Home Assistant when it will run out or when a feed didn't drop anything. It also keeps an eye on the water temperature while it's there.

> **The short version**
>
> One NodeMCU, two sensors, one servo. It measures the food level to the percent, learns how much each feed uses and how often I feed, forecasts the days left, and flags a jam after three feeds that didn't drop food. Everything survives a power cut.

## The hardware

The whole thing is three parts hanging off a NodeMCU V2, the cheap ESP8266 board with Wi-Fi built in:

- **VL53L0X time-of-flight sensor.** A tiny laser rangefinder on I2C that looks down into the hopper and measures the distance to the top of the food.
- **DS18B20 probe.** A waterproof 1-Wire temperature sensor that sits in the tank.
- **A hobby servo.** It rocks the hopper back and forth to shake a portion of food out.

![How the feeder is wired](/images/blog/aquarium-automation/system.svg)

*Sensors in on the left, servo and Home Assistant on the right. All the logic lives on the board.*

| Device | Bus | Pin | Settings |
| --- | --- | --- | --- |
| VL53L0X distance sensor | I2C | D2 (SDA), D1 (SCL) | address 0x29, 100 kHz, read every 500 ms |
| DS18B20 water probe | 1-Wire | D5 | internal pull-up, read every 10 s |
| Servo (feeder) | PWM | D7 | 50 Hz, 0.5–2.5 ms pulse |

The firmware is ESPHome (the device is called `ultra-clear`, after the tank), talking to Home Assistant over its encrypted API and updated over the air. If the Wi-Fi ever disappears, it falls back to its own hotspot with a captive portal so I can still get in.

## Measuring food with a laser

This is the bit that changes everything. The sensor sits at the top of the hopper and measures how far away the food is. A full hopper reads **70 mm**, an empty one **115 mm**, and everything in between is a straight line:

```text
Tank Level % = (115 − distance) ÷ 45 × 100     (clamped to 0–100)
```

![Inside the hopper](/images/blog/aquarium-automation/hopper.svg)

*Live: the laser pings the pellets every 500 ms, the servo rocks out a portion, and the level and the reading drop with each feed. One feed is exaggerated here so you can see it.*

Pellets don't make a flat surface, and a laser bouncing off a pile of them is noisy. So the reading goes through a small pipeline before it's trusted: raw distance every 500 ms, invalid readings thrown away, a **median of 7** to kill spikes, then a **5-minute average**. Only that final value becomes Tank Level.

(A naming confession: the sensor called "Tank Level" in Home Assistant measures the *food hopper*, not the aquarium water. It made sense at the time.)

## What a feed actually does

Home Assistant decides *when* to feed. The board decides *how*, and it keeps score:

![One feed, step by step](/images/blog/aquarium-automation/feed-loop.svg)

*Each step lights up in turn, ending with the jam check 12 minutes later. It's armed before the servo moves, so a feed that drops nothing gets caught.*

1. **Triggered.** Home Assistant presses the *Servo Feed Loop* button.
2. **Arm the jam check.** The board notes the current level and how much this feed *should* use.
3. **Rock the hopper.** The servo swings between −100 and −60, 400 ms each way, for the set *Feed Loop Count* (1–20, default 3). More cycles, bigger portion.
4. **Detach the servo.** Cutting the signal stops the buzzing and keeps it cool while it rests.
5. **Log the feed.** Time and cycle count go into the history, which is saved to flash.
6. **Refresh the forecast.** Feeds left, days left and the next feed are recalculated.

There are also single moves (Feed, Reload, Centre) and a position slider for when I'm refilling or fiddling.

## The part that learns

Here's where it stops being a timer. After every refill, the board watches its own feeds and works out two numbers:

- **How much food one loop cycle uses.** Level used since the refill, divided by cycles run.
- **How many feeds a day I actually do.** From the first and last feed times in its history.

From those two it gets everything else:

```text
drop per feed = drop per cycle × Feed Loop Count
feeds left    = Tank Level ÷ drop per feed
days left     = feeds left ÷ feeds per day
```

Until it has enough data, it uses starting guesses taken from a real week of my tank: between 8 and 12 October, 21 feeds took the level from 74 mm to 111 mm, which works out to about **0.97 % per loop cycle** at **5 feeds a day**.

![Food level over five days](/images/blog/aquarium-automation/level-chart.svg)

*The staircase draws itself one feed at a time, then the forecast runs it down to Tank Empty.*

It switches to its own numbers once it can trust them: at least 12 cycles and 3 % of food used for the drop rate, and at least two feeds spanning a day for the feeding rate. A *Feed Forecast Source* sensor says which it's using: **Estimated**, **Partly learned** or **Learned**.

Refills are spotted automatically: a jump of 10 % or more resets the statistics and learning starts again. For small top-ups there's a *Reset Feed Stats* button.

## Guessing the next feed

Home Assistant runs the schedule, but the feeder works out what that schedule *is* from the feeds it sees, so it can show a *Next Feed* time without being told.

![Learning the feeding times](/images/blog/aquarium-automation/schedule.svg)

*Four days of feeds stack up, five slots emerge, the one-off feed at 12:40 fades out because it never repeats, and the next feed lights up.*

It keeps the last 30 feed times, lays the last four days on top of each other, and any feeds that land within 45 minutes of each other on two or more days become a **slot**. The next upcoming slot is the next feed. If there's no pattern yet, it falls back to the median gap between recent feeds.

## Catching a jam

A feeder that jams quietly is worse than no feeder, because you trust it. So 12 minutes after every feed, once the 5-minute average has settled, the board checks whether the level dropped by at least **40 % of what that feed should have used**. Three misses in a row raises **Feed Jam**.

Every 5 minutes it boils everything down to one status, in priority order:

![One status, checked every 5 minutes](/images/blog/aquarium-automation/status.svg)

*An empty hopper hides a jam, and a jam hides an anomaly, so I only ever see the most urgent problem.*

**Anomaly** is the quiet one: if the level hasn't dropped at all for 24 hours, either nothing is feeding or something is stuck in a way the jam check missed.

## What I see in Home Assistant

Everything shows up as ordinary entities, so it drops straight into a dashboard and into automations:

![The Home Assistant view](/images/blog/aquarium-automation/dashboard.svg)

*A mock-up of the dashboard, with numbers consistent with a learned forecast at loop count 3.*

The full set: raw and averaged distance, Tank Level, Water Temperature, drop per cycle and per feed, feeds per day, feeds left, days left, feeds since refill, Tank Level Status, Feed Forecast Source, Last Feed and Next Feed. Plus the buttons and the Feed Loop Count slider.

Statistics, feed history and the loop count are written to flash, at most once every 5 minutes to spare the flash memory. A power cut doesn't wipe what it has learned.

## Shop feeder vs Feedback Loop

![Shop-bought timer feeder vs Feedback Loop](/images/blog/aquarium-automation/compare.svg)

*Not a clean sweep: the shop feeder still wins when the Wi-Fi is down.*

The honest summary: a timer feeder **does one thing** and does it without Wi-Fi. Feedback Loop **knows things**: how much food is left, how much each feed uses, when it will run out, when a feed failed, and what the water temperature is. The price is soldering, YAML and an afternoon of calibration.

## So, is it AI?

Depends how strict you are. There's no neural network and no cloud model in here. But it does the things people usually mean when they say a gadget is "smart":

- **It learns from its own data.** The drop rate and feeding rate aren't programmed. They're measured from what actually happens in my tank, and re-learned after every refill.
- **It finds patterns nobody told it about.** The feeding schedule is discovered by grouping feed times across days, which is a tiny bit of clustering running on one of the cheapest Wi-Fi chips you can buy.
- **It predicts.** Feeds left, days left and the next feed are forecasts, and it says how confident it is (Estimated, Partly learned, Learned).
- **It spots anomalies.** A feed that didn't drop food, or a day with no drop at all, gets flagged on its own.

All of it runs on the board itself, in a few kilobytes of RAM, with no internet needed. I'd call that *edge intelligence* rather than AI. Where real AI fits next is in the upgrade list below: a camera that can confirm food actually hit the water, and Home Assistant's voice assistant answering "how many days of food are left?"

## What doesn't work yet

Being honest about the rough edges:

- **Feeding depends on Home Assistant.** The board has no schedule of its own, so if Home Assistant or the Wi-Fi is down, no feed runs.
- **No clock, no log.** If Home Assistant time hasn't synced yet, a feed still runs but is missing from the history.
- **Reboots reset the 24-hour anomaly timer and the jam counter.** They aren't saved to flash yet.
- **A planned fasting day raises Anomaly,** because the level doesn't drop for 24 hours.
- **An uneven pellet surface** still nudges the laser reading. Smoothing helps, but doesn't fix it.
- **The temperature probe uses only the weak internal pull-up,** so long cables can drop readings, and nothing alerts on temperature yet.
- **Some credentials live in the main YAML** instead of `secrets.yaml`.

## What's next

**Phase 1, firmware only.** A backup feeding schedule on the board itself, so the fish eat even when Home Assistant doesn't. A "fasting day" switch. Save the anomaly and jam state to flash. Move secrets out of the YAML. Phone alerts for Feed Jam, Tank Empty, fewer than 2 days left, and water temperature out of range.

**Phase 2, cheap hardware.** A proper 4.7 kΩ pull-up for the temperature probe. A relay for the heater, fan or lights. A water-level sensor for evaporation and a leak sensor under the tank.

**Phase 3, the fun stuff.** Move to an ESP32 for more pins and memory. pH and TDS sensors for water quality. A load cell under the hopper to weigh the food instead of measuring it. A camera to confirm every feed. And months of history in Grafana, so I can finally prove which fish is the greedy one.

If I have to do it twice, I automate it. Feeding fish five times a day definitely counts.
