#!/usr/bin/env node

/**
 * find-my-family / wheres-my-family!!
 * CI/CD Pipeline Build Monitor
 * Real-time, beautiful terminal monitoring of active GitHub Actions workflows.
 */

const { execSync } = require('child_process');

// ANSI escape codes for stunning console presentation
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m'
  },
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m'
  }
};

// Animation frames for the active spinner
const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

// Parse command line arguments
const args = process.argv.slice(2);
const watchMode = args.includes('--watch') || args.includes('-w');
const onceMode = args.includes('--once') || args.includes('-o') || !process.stdout.isTTY;
const pollIntervalMs = 5000;

// Execution Guardrail Helper for 30s Timeout compatibility
function runCommand(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch (error) {
    return null;
  }
}

function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  
  if (diffMin < 1) return `${diffSec}s ago`;
  return `${diffMin}m ago`;
}

function getDuration(startedAt, completedAt) {
  const start = new Date(startedAt);
  const end = completedAt && completedAt !== '0001-01-01T00:00:00Z' ? new Date(completedAt) : new Date();
  const diffMs = end - start;
  const diffSec = Math.floor(diffMs / 1000);
  
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function fetchActiveRuns() {
  const query = 'gh run list --limit 10 --json databaseId,workflowName,status,conclusion,createdAt,headBranch,headSha,event';
  const output = runCommand(query);
  if (!output) {
    throw new Error('Failed to fetch runs. Ensure gh CLI is authenticated and installed.');
  }
  
  try {
    return JSON.parse(output);
  } catch (e) {
    throw new Error('Failed to parse GitHub Actions run list: ' + e.message);
  }
}

function fetchRunJobs(runId) {
  const query = `gh run view ${runId} --json jobs`;
  const output = runCommand(query);
  if (!output) return null;
  
  try {
    return JSON.parse(output).jobs;
  } catch (e) {
    return null;
  }
}

function renderDashboard() {
  try {
    const allRuns = fetchActiveRuns();
    if (!allRuns || allRuns.length === 0) {
      console.log(`${colors.fg.yellow}No recent GitHub Actions workflow runs found.${colors.reset}`);
      return;
    }

    // Filter to latest runs - prioritize in_progress or queued, or simply list the top 2
    let targets = allRuns.filter(r => r.status === 'in_progress' || r.status === 'queued');
    if (targets.length === 0) {
      // No active runs, look at the most recent compiled ones
      targets = allRuns.slice(0, 2);
    }

    // Clear terminal screen if we are watching and on TTY
    if (watchMode && process.stdout.isTTY) {
      process.stdout.write('\x1Bc');
    }

    const currentSpinner = spinners[spinnerIndex];
    spinnerIndex = (spinnerIndex + 1) % spinners.length;

    console.log(`${colors.bright}${colors.fg.cyan}======================================================================${colors.reset}`);
    console.log(`🌐  ${colors.bright}${colors.fg.brightCyan}WHERE'S MY FAMILY!! — REAL-TIME PIPELINE MONITOR${colors.reset}  🌐`);
    console.log(`${colors.bright}${colors.fg.cyan}======================================================================${colors.reset}`);
    console.log(`${colors.fg.white}Current System Time: ${colors.reset}${new Date().toLocaleTimeString()}  |  ${colors.fg.white}Mode:${colors.reset} ${watchMode ? 'Live Watch' : 'Single Print'}`);
    console.log(`${colors.bright}${colors.fg.cyan}----------------------------------------------------------------------${colors.reset}`);

    if (targets.length === 0) {
      console.log(`\n  ${colors.fg.yellow}No active or recent runs discovered in the queue.${colors.reset}\n`);
      return;
    }

    targets.forEach((run, idx) => {
      const jobs = fetchRunJobs(run.databaseId);
      
      let statusColor = colors.fg.gray;
      let statusIcon = '○';
      
      if (run.status === 'in_progress') {
        statusColor = colors.fg.brightBlue;
        statusIcon = currentSpinner;
      } else if (run.status === 'completed') {
        if (run.conclusion === 'success') {
          statusColor = colors.fg.brightGreen;
          statusIcon = '✓';
        } else {
          statusColor = colors.fg.red;
          statusIcon = '✗';
        }
      } else if (run.status === 'queued') {
        statusColor = colors.fg.yellow;
        statusIcon = '⏳';
      }

      console.log(`\n${colors.bright}${statusColor}${statusIcon} Run #${run.databaseId} — ${run.workflowName}${colors.reset}`);
      console.log(`  ${colors.fg.white}Workflow:${colors.reset} ${run.workflowName}  |  ${colors.fg.white}Branch:${colors.reset} ${colors.fg.brightMagenta}${run.headBranch}${colors.reset}  |  ${colors.fg.white}Event:${colors.reset} ${run.event}`);
      console.log(`  ${colors.fg.white}Triggered:${colors.reset} ${getRelativeTime(run.createdAt)} (${new Date(run.createdAt).toLocaleTimeString()})`);
      console.log(`  ${colors.fg.white}Pipeline Status:${colors.reset} ${statusColor}${run.status.toUpperCase()}${run.conclusion ? ' (' + run.conclusion.toUpperCase() + ')' : ''}${colors.reset}`);

      if (jobs && jobs.length > 0) {
        jobs.forEach(job => {
          const elapsed = getDuration(job.startedAt, job.completedAt);
          console.log(`  ${colors.fg.brightCyan}Job: ${job.name} (Elapsed: ${elapsed})${colors.reset}`);
          
          if (job.steps && job.steps.length > 0) {
            job.steps.forEach(step => {
              let stepIcon = ' ';
              let stepColor = colors.fg.gray;
              let extraText = '';

              if (step.status === 'completed') {
                if (step.conclusion === 'success') {
                  stepIcon = '✓';
                  stepColor = colors.fg.green;
                } else {
                  stepIcon = '✗';
                  stepColor = colors.fg.red;
                  extraText = ` [FAILED]`;
                }
              } else if (step.status === 'in_progress') {
                stepIcon = currentSpinner;
                stepColor = colors.fg.brightYellow;
                extraText = ` [IN PROGRESS]`;
              } else {
                stepIcon = '○';
                stepColor = colors.fg.gray;
              }

              console.log(`    ${stepColor}${stepIcon} ${step.name}${extraText}${colors.reset}`);
            });
          } else {
            console.log(`    ${colors.fg.gray}No step data returned yet...${colors.reset}`);
          }
        });
      } else {
        console.log(`  ${colors.fg.gray}Loading job and step specifics from GitHub...${colors.reset}`);
      }
      
      if (idx < targets.length - 1) {
        console.log(`  ${colors.fg.gray}------------------------------------------------------------------${colors.reset}`);
      }
    });

    console.log(`\n${colors.bright}${colors.fg.cyan}======================================================================${colors.reset}`);
    if (watchMode) {
      console.log(`${colors.dim}Polling every ${pollIntervalMs / 1000}s. Press Ctrl+C to gracefully terminate monitoring.${colors.reset}`);
    } else {
      console.log(`${colors.dim}To watch real-time status, append the --watch or -w flag to your command.${colors.reset}`);
    }

  } catch (error) {
    console.error(`\n${colors.fg.red}⚠️  Error during pipeline monitor rendering: ${error.message}${colors.reset}\n`);
  }
}

// Initial execution
renderDashboard();

// Setup polling loop if watchMode is selected and we aren't in onceMode
if (watchMode && !onceMode) {
  setInterval(renderDashboard, pollIntervalMs);
}
