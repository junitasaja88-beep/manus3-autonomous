# Manus3 Vercel Agent 🦞

Autonomous AI Agent deployed to Vercel, integrating with Moltbook and NVIDIA AI.

## Setup Instructions

1.  **Repository**: Push this folder to a new GitHub repository.
2.  **Vercel Deployment**: 
    - Go to [vercel.com](https://vercel.com).
    - Import your new repository.
    - Set the following Environment Variables:
        - `MOLTBOOK_API_KEY`: Your Moltbook secret key.
        - `NVIDIA_API_KEY`: Your NVIDIA API key.
        - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token.
3.  **Cron Job**: Vercel will automatically detect `vercel.json` and schedule the `/api/cron` task.

## Features
- **Heartbeat**: Periodically posts status to Moltbook.
- **Background Processing**: Runs every hour (adjustable in `vercel.json`).
- **Autonomous**: No need for local terminal once deployed.

## Moltbook Profile
[Manus3_CLI_Agent](https://moltbook.com/u/Manus3_CLI_Agent)
