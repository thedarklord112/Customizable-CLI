#!/usr/bin/env node
/**
 * mini-term: a tiny interactive CLI for automating tasks
 *
 * Commands:
 *  help                 Show help
 *  add <name> <command> Add a task (quotes recommended around command)
 *  run <name> [args...] Run a saved task (args appended)
 *  list                 List saved tasks and aliases
 *  remove <name>        Remove a saved task
 *  alias <name> <alias> Create an alias for a task
 *  unalias <alias>      Remove alias
 *  edit <name>          Edit a task's command (opens $EDITOR or falls back to prompt)
 *  save                 Force save tasks to disk
 *  load                 Reload tasks from disk
 *  exit                 Quit
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.mini-term');
const TASKS_FILE = path.join(CONFIG_DIR, 'tasks.json');

function ensureStorage() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, JSON.stringify({ tasks: {}, aliases: {} }, null, 2));
}

function loadStore() {
  ensureStorage();
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to load tasks file, creating a fresh one:', e.message);
    const empty = { tasks: {}, aliases: {} };
    fs.writeFileSync(TASKS_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
}

function saveStore(store) {
  ensureStorage();
  fs.writeFileSync(TASKS_FILE, JSON.stringify(store, null, 2));
}

let store = loadStore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'mini> ',
  historySize: 200,
});

function showHelp() {
  console.log(`
mini-term commands:
  help                      Show this text
  add <name> <command>      Add a task (wrap command in quotes)
  run <name> [args...]      Run a saved task (any [args] appended)
  list                      List saved tasks and aliases
  remove <name>             Remove a saved task
  alias <name> <alias>      Create alias <alias> for task <name>
  unalias <alias>           Remove alias
  edit <name>               Edit a task's command ($EDITOR or inline)
  save                      Save tasks to disk
  load                      Reload tasks from disk
  exit                      Quit
Examples:
  add build "npm run build"
  run build
  alias build b
  run b -- --minify
`);
}

function resolveName(nameOrAlias) {
  if (store.tasks[nameOrAlias]) return nameOrAlias;
  if (store.aliases[nameOrAlias]) return store.aliases[nameOrAlias];
  return null;
}

function listTasks() {
  console.log('Tasks:');
  const names = Object.keys(store.tasks).sort();
  if (names.length === 0) console.log('  (no tasks)');
  names.forEach(n => {
    console.log(`  ${n} => ${store.tasks[n]}`);
  });
  const aliasNames = Object.keys(store.aliases);
  if (aliasNames.length > 0) {
    console.log('\nAliases:');
    aliasNames.forEach(a => {
      console.log(`  ${a} => ${store.aliases[a]}`);
    });
  }
}

function addTask(name, commandParts) {
  if (!name || commandParts.length === 0) {
    console.log('Usage: add <name> <command>');
    return;
  }
  const cmd = commandParts.join(' ');
  store.tasks[name] = cmd;
  saveStore(store);
  console.log(`Added task ${name}: ${cmd}`);
}

function removeTask(name) {
  if (!store.tasks[name]) {
    console.log(`No task named '${name}'`);
    return;
  }
  delete store.tasks[name];
  // remove aliases pointing to it
  for (const a of Object.keys(store.aliases)) {
    if (store.aliases[a] === name) delete store.aliases[a];
  }
  saveStore(store);
  console.log(`Removed task '${name}' and its aliases.`);
}

function addAlias(taskName, alias) {
  if (!store.tasks[taskName]) {
    console.log(`No task named '${taskName}'.`);
    return;
  }
  store.aliases[alias] = taskName;
  saveStore(store);
  console.log(`Alias '${alias}' → '${taskName}'`);
}

function removeAlias(alias) {
  if (!store.aliases[alias]) {
    console.log(`No alias named '${alias}'`);
    return;
  }
  delete store.aliases[alias];
  saveStore(store);
  console.log(`Removed alias '${alias}'`);
}

function editTask(name) {
  if (!store.tasks[name]) {
    console.log(`No task named '${name}'`);
    return;
  }
  const editor = process.env.EDITOR;
  if (editor) {
    // edit a temp file then load
    const tmp = path.join(CONFIG_DIR, `.edit-${name}.txt`);
    fs.writeFileSync(tmp, store.tasks[name] + os.EOL);
    const child = spawn(editor, [tmp], { stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) {
        const content = fs.readFileSync(tmp, 'utf8').trim();
        store.tasks[name] = content;
        saveStore(store);
        console.log(`Task '${name}' updated.`);
        fs.unlinkSync(tmp);
        rl.prompt();
      } else {
        console.log('Editor exited with code', code);
        rl.prompt();
      }
    });
  } else {
    // fallback: inline edit
    rl.question(`New command for ${name} (current: ${store.tasks[name]}): `, (answer) => {
      if (answer.trim().length > 0) {
        store.tasks[name] = answer.trim();
        saveStore(store);
        console.log(`Task '${name}' updated.`);
      } else {
        console.log('No change.');
      }
      rl.prompt();
    });
  }
}

function runTask(nameOrAlias, args) {
  const name = resolveName(nameOrAlias);
  if (!name) {
    console.log(`No task or alias named '${nameOrAlias}'`);
    return;
  }
  const cmd = store.tasks[name];
  if (!cmd || cmd.trim() === '') {
    console.log(`Task '${name}' has no command.`);
    return;
  }
  // build final command string
  const finalCmd = cmd + (args && args.length ? ' ' + args.join(' ') : '');
  console.log(`Running [${name}]: ${finalCmd}`);
  // Use shell to allow pipes, quotes, etc.
  const child = spawn(finalCmd, { stdio: 'inherit', shell: true, env: process.env });
  child.on('exit', (code, signal) => {
    if (signal) console.log(`Task ${name} terminated by signal ${signal}`);
    else console.log(`Task ${name} exited with code ${code}`);
    rl.prompt();
  });
}

rl.on('line', (line) => {
  const raw = line.trim();
  if (!raw) { rl.prompt(); return; }
  const parts = parseArgs(raw);
  const cmd = parts[0];
  const rest = parts.slice(1);
  switch (cmd) {
    case 'help':
      showHelp();
      break;
    case 'add':
      addTask(rest[0], rest.slice(1));
      break;
    case 'list':
      listTasks();
      break;
    case 'remove':
      removeTask(rest[0]);
      break;
    case 'alias':
      addAlias(rest[0], rest[1]);
      break;
    case 'unalias':
      removeAlias(rest[0]);
      break;
    case 'edit':
      editTask(rest[0]);
      // editTask will re-prompt after editor closes
      return;
    case 'run':
      if (!rest[0]) {
        console.log('Usage: run <name> [args...]');
      } else {
        runTask(rest[0], rest.slice(1));
        // runTask re-prompts after command finishes
        return;
      }
      break;
    case 'save':
      saveStore(store);
      console.log('Saved.');
      break;
    case 'load':
      store = loadStore();
      console.log('Reloaded from disk.');
      break;
    case 'exit':
    case 'quit':
      rl.close();
      return;
    default:
      console.log(`Unknown command: ${cmd}. Type 'help' for commands.`);
  }
  rl.prompt();
});

rl.on('close', () => {
  console.log('Bye — mini-term exiting.');
  process.exit(0);
});

function parseArgs(input) {
  // simple shell-like parsing that respects double/single quotes
  const res = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (cur.length) { res.push(cur); cur = ''; }
      continue;
    }
    cur += ch;
  }
  if (cur.length) res.push(cur);
  return res;
}

// start
console.log('mini-term — a tiny customizable CLI (type "help")');
rl.prompt();
