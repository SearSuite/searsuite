const userAgent = process.env.npm_config_user_agent ?? '';

if (!userAgent.startsWith('pnpm/')) {
  console.error('This repository uses pnpm. Run pnpm install instead of npm install.');
  process.exitCode = 1;
}
