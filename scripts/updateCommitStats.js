"use strict";

const fs = require("fs");

async function getRandomAnswer() {
  const res = await fetch(
    "https://api.stackexchange.com/2.3/answers?order=desc&sort=votes&site=stackoverflow&filter=withbody&pagesize=50"
  );

  const data = await res.json();

  const answers = data.items;
  const random = answers[Math.floor(Math.random() * answers.length)];

  const answerText = random.body
    .replace(/<[^>]*>/g, "")
    .slice(0, 200);

  return {
    text: answerText,
    score: random.score,
  };
}

async function run() {
  const ans = await getRandomAnswer();

  const section = `
## 💡 Random StackOverflow Wisdom

"${ans.text}..."

👍 ${ans.score} upvotes
`;

  const readme = fs.readFileSync("README.md", "utf8");

  const updated = readme.replace(
    /<!--START_SECTION:stackoverflow-->[\s\S]*?<!--END_SECTION:stackoverflow-->/,
    `<!--START_SECTION:stackoverflow-->
${section}
<!--END_SECTION:stackoverflow-->`
  );

  fs.writeFileSync("README.md", updated);
}

run();
