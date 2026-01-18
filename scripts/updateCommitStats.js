"use strict";

const fs = require("fs");

const USERNAME = "Godse-07";
const TOKEN = process.env.GH_TOKEN;

const TIME_SLOTS = {
  morning: { label: "🌞 Morning", count: 0 },
  daytime: { label: "🌆 Daytime", count: 0 },
  evening: { label: "🌃 Evening", count: 0 },
  night: { label: "🌙 Night", count: 0 }
};

function getSlot(hour) {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "daytime";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function bar(percent) {
  const size = 25;
  const filled = Math.round((percent / 100) * size);
  return "█".repeat(filled) + "░".repeat(size - filled);
}

async function fetchCommits() {
  const res = await fetch(
    `https://api.github.com/users/${USERNAME}/events`,
    {
      headers: {
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return res.json();
}

async function run() {
  const events = await fetchCommits();

  events
    .filter(e => e.type === "PushEvent")
    .forEach(e => {
      const hour = new Date(e.created_at).getHours();
      TIME_SLOTS[getSlot(hour)].count++;
    });

  const total = Object.values(TIME_SLOTS)
    .reduce((sum, slot) => sum + slot.count, 0);

  let content = `I'm an early 🐤\n\n`;

  for (const key in TIME_SLOTS) {
    const { label, count } = TIME_SLOTS[key];
    const percent = total ? ((count / total) * 100).toFixed(2) : "0.00";

    content += `${label.padEnd(12)} ${String(count).padEnd(4)} commits   `;
    content += `${bar(percent)}   ${percent}%\n`;
  }

  const readme = fs.readFileSync("README.md", "utf8");

  const updated = readme.replace(
    /<!--START_SECTION:commit_activity-->[\s\S]*?<!--END_SECTION:commit_activity-->/,
    `<!--START_SECTION:commit_activity-->\n${content}\n<!--END_SECTION:commit_activity-->`
  );

  fs.writeFileSync("README.md", updated);
}

run().catch(console.error);
