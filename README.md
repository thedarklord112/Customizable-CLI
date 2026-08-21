mini-term
=========
A tiny interactive CLI to define and run tasks (name → shell command). Persisted to ~/.mini-term/tasks.json.

Install & run
-------------
1. Save files (index.js, package.json).
2. Make index.js executable: chmod +x index.js
3. Run with: ./index.js
   Or install locally: npm link
   Then run: mini-term

Commands
--------
- help: show help
- add <name> <command>: add a task
- run <name> [args...]: run a task
- list: show tasks
- remove <name>: delete a task
- alias <name> <alias>: create alias
- unalias <alias>: delete alias
- edit <name>: edit via $EDITOR or inline
- save/load: persist/reload tasks
- exit: quit

Extending ideas
---------------
- Add scheduling (cron integration)
- Add parallel task pipelines
- Add templating (variables)
- Add remote execution (SSH)
- Add plugin architecture (load JS files with task definitions)
- Replace the readline loop with prompt_toolkit/ink/ink-blessed for richer UI

Configuration
-------------
Tasks are stored in ~/.mini-term/tasks.json as:
{
  "tasks": { "build": "npm run build" },
  "aliases": { "b": "build" }
}
