"use strict";

const fs = require("fs");

const USERNAME = "Godse-07";
const TOKEN = process.env.GH_TOKEN;

if (!TOKEN) {
  throw new Error("GH_TOKEN is missing");
}


const TIME_SLOTS = {
  morning: { label: "🌞 Morning", count: 0 },
  daytime: { label: "🌆 Daytime", count: 0 },
  evening: { label: "🌃 Evening", count: 0 },
  night:   { label: "🌙 Night", count: 0 }
};

function getSlot(hour) {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "daytime";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function bar(percent) {
  const SIZE = 25;
  const filled = Math.round((percent / 100) * SIZE);
  return "█".repeat(filled) + "░".repeat(SIZE - filled);
}

async function fetchAll(url) {
  let page = 1;
  let results = [];

  while (true) {
    const res = await fetch(`${url}&per_page=100&page=${page}`, {
      headers: {
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github+json"
      }
    });

    if (!res.ok) break;

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    results.push(...data);
    page++;
  }

  return results;
}

async function fetchAllCommits() {
  const repos = await fetchAll(
    `https://api.github.com/users/${USERNAME}/repos?`
  );

  for (const repo of repos) {
    // skip forks to avoid noise
    if (repo.fork) continue;

    const commits = await fetchAll(
      `https://api.github.com/repos/${USERNAME}/${repo.name}/commits?author=${USERNAME}&`
    );

    commits.forEach(commit => {
      if (!commit.commit?.author?.date) return;

      const hour = new Date(commit.commit.author.date).getHours();
      const slot = getSlot(hour);

      TIME_SLOTS[slot].count++;
    });
  }
}

async function run() {
  console.log("Fetching lifetime commits...");
  await fetchAllCommits();

  const total = Object.values(TIME_SLOTS)
    .reduce((sum, s) => sum + s.count, 0);

  let output = `## ⏰ Coding Rhythm

I'm an early 🐤

\`\`\`text
`;

  for (const key of Object.keys(TIME_SLOTS)) {
    const { label, count } = TIME_SLOTS[key];
    const percent = total ? (count / total) * 100 : 0;

    output += `${label.padEnd(10)} ${String(count).padStart(4)} commits  `;
    output += `${bar(percent)}  ${percent.toFixed(2)}%\n`;
  }

  output += `\`\`\`\n`;

  const readme = fs.readFileSync("README.md", "utf8");

  const updated = readme.replace(
    /<!--START_SECTION:commit_activity-->[\s\S]*?<!--END_SECTION:commit_activity-->/,
    `<!--START_SECTION:commit_activity-->\n${output}\n<!--END_SECTION:commit_activity-->`
  );

  fs.writeFileSync("README.md", updated);
  console.log("README updated successfully");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
