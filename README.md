# Mindustry Tracker

Track Mindustry

Very easy

Very simple

Lots of stats

Not crazy overbuilt, but performant
Currently, at 3rd June 2026, in around a year the program has gathered 4.5GB of data (45M server_stats, 1.4M server_maps, 20M server_motd) with TimescaleDB columnar compression including 571 Mindustry servers picked up

Try it out?
Live has accurate data, at least as accurate as I know it:
[https://tracker.gergo.top](https://tracker.gergo.top)

Staging has near latest changes but that potentially means inaccurate data, unlikely but possible:
[https://staging-tracker.gergo.top](https://staging-tracker.gergo.top)

Update #1: As of 30th June 2026, there is 50.335M rows of server_stats, with maps and server name + descriptions being deduplicated via registry + history architecture. This means 20k map and gamemode parinigs, and 78K unique parings of name and description.

Update #2: as of 25th of August there are now 61M server_stats tracking 680 servers (193 active)
All with 5 minute granularity since over a year. This is uneccesary, but uses around 1GB of storage due to delta-delta compression, performance is kept via aggregate views and caching.

# Development
```sh
bun install      # once, from the repo root (single shared node_modules)
bun run dev      # backend on :3000 + Vite on :4000 - open http://localhost:3000
bun run build    # production frontend build into frontend/dist, served by the backend
bun run start    # run the backend against that build
```

# AI Disclaimer
AI Has been used during development. Mostly during design phases and especially to optimize, but also to accelerate development. I am always in control, and review + test every line of code.

`backend` is mostly by me, with the help of AI
`frontend` was created mostly by AI, but I have since majorly refactored it to suit my style

I've used Claude Opus 5 + Sonnet 4.6/5 for development, and recently Claude Code Cloud to complete actions I had planned while I was living life

If you don't like the AI since it makes you cry or whatever you don't need to touch it okay ?
