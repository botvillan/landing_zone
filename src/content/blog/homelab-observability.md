---
title: "Seeing my own network: pfSense logs, flows and DNS in Loki and Grafana"
description: How I turned pfSense syslog, SNMP, NetFlow and DNS query logs into one Grafana dashboard with attack detection, live speed, a device inventory, bandwidth per app, and push alerts to my phone, after a detour through Graylog that my server couldn't afford.
date: 2026-11-14
tags: [Homelab, Networking, pfSense, Grafana, Loki, Observability, Claude Code]
cover: "[[homelab-observability-cover.jpg]]"
---

My home network is a pfSense box, a handful of VLANs, and more IoT devices than I'd like to admit. Plugs, cameras, TVs, speakers, a console, and a few things I honestly couldn't name from their MAC address. pfSense blocks and passes thousands of packets an hour, and until this week I had no idea what any of them were.

I wanted three things: the firewall's logs somewhere I could search them, an alert when something looks like an attack, and a straight answer to *"who on this network is using what?"*

> **The short version**
>
> pfSense sends syslog, NetFlow and DNS query logs to Grafana Alloy, which parses and enriches them into Loki. SNMP counters and the ARP table go to Prometheus. One Grafana dashboard shows attacks, live speed, every device on the LAN, bandwidth per host and per app, and a world map. Alert rules push to my phone through a self-hosted ntfy. All of it runs in Docker on one small Debian server, and I built it in one long session with Claude Code.

## The Graylog detour

The obvious answer for "central syslog" is Graylog, so that's what I wrote first: a tidy Compose stack with Graylog, its search backend and MongoDB, resource limits and all. It got reviewed and merged.

It was never deployed. Before starting it, I checked how much memory the server actually had free, and the answer was **under 2 GiB, no swap, and memory over-committed to more than twice its size**. My monitoring had been showing much healthier numbers, because its service checks were stale until I rediscovered them. Graylog wants 5-6 GiB to be comfortable. Starting it would have invited the kernel's OOM killer to pick something to shoot, and the candidates were my git server and my monitoring.

The server already ran Loki, Alloy and Grafana for other logs. So instead of a new stack, I extended the one I had. Lesson learned: **check the live numbers before you size anything**, and don't trust a dashboard that hasn't been asked a fresh question in a while.

## How it's wired

![Data flowing from pfSense through Alloy and goflow2 into Loki and Prometheus, then Grafana and my phone](/images/blog/homelab-observability/architecture.svg?v=1)

*Four kinds of data leave pfSense. Logs land in Loki, numbers land in Prometheus, and Grafana reads both and pushes alerts to my phone.*

- **Firewall and system logs.** pfSense sends RFC 5424 syslog to Alloy on port 1514/udp. Alloy parses the `filterlog` CSV into action, interface, protocol, ports and rule, and ships it to Loki with 30 days of retention.
- **Speed and devices.** Alloy's built-in SNMP exporter polls pfSense's interface counters (for live upload and download) and its ARP table (for a device inventory) and writes them to Prometheus.
- **Who talks to whom.** The softflowd package on pfSense exports NetFlow to goflow2, which prints each flow as JSON. Alloy reads that, adds country, ASN and an app label, and stores it in Loki.
- **What gets looked up.** DNS query logs come from AdGuard (which serves the IoT VLAN) and from pfSense's own Unbound resolver (everything else). They tell me which device uses which app, even when the bytes are hard to attribute.
- **Names.** A tiny Python exporter turns MAC addresses into friendly names from a text file, falling back to reverse DNS, so tables say "TV" instead of a hex string.
- **Alerts.** Grafana alert rules evaluate every minute and post to ntfy, which pushes to the app on my phone.

## Enriching a flow

A NetFlow record is just addresses, ports and a byte count. That's useless on a dashboard until something turns it into words.

![A flow record gaining country, ASN, app and host labels one step at a time](/images/blog/homelab-observability/netflow-enrichment.svg?v=1)

*Each lookup adds one label. By the end, Grafana can sum bytes by app, by host or by country.*

The GeoIP and ASN lookups use the free DB-IP Lite databases, which need no account. The app label comes from the remote network's ASN, so Google's network becomes "YouTube / Google", Netflix's becomes "Netflix", and so on, plus a couple of well-known ports for BitTorrent. No packet inspection, just lookups.

## What the dashboard does

### Attack detection

![Security row: three grey status tiles, one red firing tile, a blocked-connections chart with red alert markers, and an alert list](/images/blog/homelab-observability/dash-security.svg?v=1)

*An illustration, with made-up numbers. Tiles stay grey until something's wrong. Red markers on the chart show when an alert started.*

Four rules watch the firewall log:

- **Outside hits on WAN.** Anything reaching pfSense's WAN from the internet. My ISP's router sits in front, so this should be zero, and the rule ignores the router's own noise.
- **Port scans.** One source hitting many different ports in five minutes.
- **Admin login brute force.** Failed logins to the pfSense web UI or SSH, from `php-fpm` and `sshguard` logs.
- **Block floods.** The block rate jumping far above its normal level.

Each one pushes to my phone and drops a marker on the dashboard, so I can see exactly when it started.

![Detection, then a LogQL rule crossing its threshold, then pending and firing, then a push notification](/images/blog/homelab-observability/alert-flow.svg?v=1)

*From a log line to my pocket. The rule has to stay above its threshold for two minutes before it fires, which kills most of the false alarms.*

The port-scan rule, roughly, is a LogQL query that counts distinct destination ports per source:

```text
count by (src) (
  count by (src, dport) (count_over_time({job="pfsense", action="block"} [5m]))
) > 25
```

### Live speed and devices

![Internet speed row: download, upload and devices-online tiles with sparklines, and a 24-hour throughput chart](/images/blog/homelab-observability/dash-speed.svg?v=1)

*Illustration. Download is always blue and upload always orange, on every panel.*

SNMP interface counters give a live upload and download speed. The ARP table gives a list of every device pfSense has seen recently, a count of how many are online, and a **new-device alert** when a MAC address appears that wasn't there half an hour ago. The first time it fired it was a guest's phone. The second time it was a smart plug I'd forgotten I bought.

### Who uses what

![A ranked bar chart of apps by bandwidth next to a device-by-app heat grid](/images/blog/homelab-observability/dash-apps-grid.svg?v=1)

*Illustration. The grid answers "which device uses which app" at a glance. One hue, darker means more.*

This is the part I actually wanted. Bandwidth per host, bandwidth per app, and a grid of devices against apps. The TV streaming, the console downloading a 70 GB update, the camera quietly uploading all day: it's all just there now.

### A world map

![A dot-grid world map with bubbles sized by traffic per country](/images/blog/homelab-observability/dash-worldmap.svg?v=1)

*Illustration. Bubbles are sized by bytes per remote country, from NetFlow plus the DB-IP city database.*

Mostly it shows that the internet lives in a few data centres in the US and Europe. It's still the panel visitors look at first.

## Things that bit me

Every one of these cost me at least half an hour.

- **Double-counted VLAN traffic.** I first ran softflowd on the LAN interface *and* each VLAN sub-interface. Every VLAN flow was then counted twice, once tagged and once untagged. Capturing on the parent interface alone fixed it.
- **Extracted fields don't cross Alloy components.** A field I extracted in one `loki.process` block simply wasn't there in the next one. The fix was to pass data on in the log line itself: the DNS pipelines hand over `client domain qtype`, and a shared classifier re-parses it.
- **Grafana 13 changed the template-variable format.** Loki variable queries need a new JSON form. The old string form silently returns nothing, and then "All" matches nothing, and every panel goes blank with no error.
- **Loki's series limit.** A *Top domains* panel that grouped by domain hit `max_query_series`. Raising it to 3000 was fine for a home network.
- **Tracker versus rule number.** pfSense's `filterlog` line has both a rule *number* and a *tracker ID*. The number changes when you reorder rules. The tracker doesn't, so that's the one the dashboard uses.
- **Prometheus runs as `nobody`.** A secrets file mounted into the container must be owned by UID 65534, or Prometheus can't read it and the scrape just fails.

## Designing the dashboard

The first version had the right data and was still hard to read, because every panel was a line chart with a rainbow of series. Nothing stood out, so nothing got noticed.

![Before: six identical rainbow line charts. After: grey status tiles with one red alarm, ranked bars, a one-hue heat grid and a stacked area chart](/images/blog/homelab-observability/before-after-viz.svg?v=1)

*Same data, different jobs. The redesign picks each chart's shape from the question it answers.*

So I picked the form from the job each panel does:

- **Status tiles** stay neutral grey with a small sparkline. Only alarm tiles get colour, and only when something's wrong: amber, then red.
- **Ranked horizontal bars** for part-to-whole questions, like "which app used the most".
- **Heat grids** in one hue for device × app. Darker is more. No rainbow scales.
- **Stacked areas** for composition over time, like traffic per interface.
- **Fixed colours per entity.** Download is always blue, upload always orange, and each interface and app keeps its colour on every panel.

The dashboard is generated by a Python script rather than edited by hand in Grafana, so every one of these rules lives in code and survives the next change.

## Honest limits

- **Netflix and YouTube often show as "Other".** My ISP hosts caches for both inside its own network, so the ASN says "my ISP", not "Netflix". The DNS panels still show *which* devices use them, just not how many bytes. Fixing it properly needs DNS answer matching or deep packet inspection, and I decided it isn't worth it yet.
- **Rule numbers, not names.** The busiest-rules table shows pfSense tracker IDs, because that's all the log line carries.
- **Phone notifications are LAN-only.** ntfy runs on plain HTTP inside my network, so alerts only reach me at home or over my VPN.

## What's next

1. **Firewall rule names** in tables and alerts, by mapping tracker IDs to rule descriptions through the pfSense API.
2. **ntfy over HTTPS** behind my reverse proxy, with proper auth, so alerts reach me on mobile data.
3. **UniFi integration.** My access points and switches know things pfSense never will: device names and vendors, which AP and switch port a device is on, Wi-Fi signal quality, LAN-to-LAN traffic. Pulling that in with UnPoller should fill most of the "what *is* this device?" gaps and make new-device alerts actually useful.

For the first time, I can open one page and see what my network is doing. It mostly turns out to be the TV.
