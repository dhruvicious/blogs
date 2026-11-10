import { readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

export async function spell(path: string | undefined) {
  const post_path = path ?? await latest_post();

  const content_original = await readFile(post_path, "utf8");

  const { content_corrected, suggestions } = await spell_check_with_llm(
    content_original,
  );

  await writeFile(post_path, content_corrected);

  if (suggestions.length > 0) {
    console.log("\nSuggestions:");
    suggestions.forEach((suggestion) => console.log(`  • ${suggestion}`));
  }
}

async function spell_check_with_llm(
  content: string,
): Promise<{ content_corrected: string; suggestions: string[] }> {
  const prompt =
    `You are a professional editor. Please identify typos and grammatical errors in the following blog post.

IMPORTANT RULES:
1. Find only typos and grammatical errors
2. Do NOT suggest style changes or voice modifications
3. Do NOT suggest adding or removing content
4. For each error found, provide the exact text to replace and what to replace it with

Please respond in this exact format:
REPLACEMENTS_START
replace "incorrect text 1" with "correct text 1"
replace "incorrect text 2" with "correct text 2"
REPLACEMENTS_END

SUGGESTIONS_START
- [optional style/clarity suggestion 1]
- [optional style/clarity suggestion 2]
- [optional style/clarity suggestion 3]
SUGGESTIONS_END

Here is the blog post to check:

${content}`;

  const child = spawn("llm", ["-m", "claude-sonnet-4.6"], { stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(prompt);
  const stdout_chunks: Buffer[] = [];
  const stderr_chunks: Buffer[] = [];
  child.stdout.on("data", (chunk) => stdout_chunks.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr_chunks.push(Buffer.from(chunk)));
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve(status ?? 1));
  });
  const stdout = Buffer.concat(stdout_chunks).toString();
  const stderr = Buffer.concat(stderr_chunks).toString();
  if (code !== 0) throw new Error(`LLM command failed: ${stderr}`);
  const output = stdout;

  // Parse the structured response
  const replacements_match = output.match(
    /REPLACEMENTS_START\n([\s\S]*?)\nREPLACEMENTS_END/,
  );
  const suggestions_match = output.match(
    /SUGGESTIONS_START\n([\s\S]*?)\nSUGGESTIONS_END/,
  );

  let content_corrected = content;

  if (replacements_match) {
    const replacement_lines = replacements_match[1].split("\n").filter((line) =>
      line.trim().length > 0
    );

    for (const line of replacement_lines) {
      // Parse: replace "old text" with "new text"
      const match = line.match(/replace\s+"([^"]+)"\s+with\s+"([^"]*)"/);
      if (match) {
        const [, old_text, new_text] = match;
        if (old_text != new_text) {
          if (content_corrected.includes(old_text)) {
            content_corrected = content_corrected.replace(old_text, new_text);
            console.log(`ok:  "${old_text}" → "${new_text}"`);
          } else {
            console.warn(`ERR: "${old_text}" → "${new_text}"`);
          }
        }
      }
    }
  }

  const suggestions = suggestions_match
    ? suggestions_match[1].split("\n").filter((line) =>
      line.trim().startsWith("-")
    ).map((line) => line.trim().substring(1).trim())
    : [];

  return { content_corrected, suggestions };
}

async function latest_post(): Promise<string> {
  const posts_dir = "content/posts";
  const entries = [];

  for (const entry of await readdir(posts_dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".dj")) {
      const match = entry.name.match(/^(\d{4}-\d{2}-\d{2})-/);
      if (match) {
        entries.push({
          name: entry.name,
          date: new Date(match[1]),
          path: `${posts_dir}/${entry.name}`,
        });
      }
    }
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (entries.length === 0) {
    throw new Error("No dated articles found in content/posts");
  }

  return entries[0].path;
}
