import { watch as watch_fs } from "node:fs";
import {
  mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile,
} from "node:fs/promises";
import { dirname as path_dirname, join } from "node:path";
const args = Bun.argv.slice(2);
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}
import * as djot from "./djot.ts";
import * as blogroll from "./blogroll.ts";
import {
  BlogRoll,
  feed_xml,
  html_ugly,
  HtmlString,
  Page,
  Post,
  PostList,
  Redirect,
} from "./templates.tsx";
import { spell } from "./spell.ts";

async function main() {
  const params = {
    blogroll: false,
    update: false,
    spell: false,
    profile: false,
    filter: "",
  };

  const subcommand = args[0];
  if (subcommand === "touch") {
    const slug = args[1];
    const date = new Date().toISOString().split("T")[0];
    const path = `./content/posts/${date}-${slug}.dj`;
    console.log(`touching ${path}`);
    await writeFile(path, "#\n");
    return;
  }

  if (subcommand === "spell") {
    spell(args.at(1));
    return;
  }

  let i = 1;
  for (; i < args.length; i++) {
    switch (args[i]) {
      case "--update": {
        params.update = true;
        break;
      }
      case "--spell": {
        params.spell = true;
        break;
      }
      case "--profile": {
        params.profile = true;
        break;
      }
      case "--filter": {
        params.filter = args[i + 1] ?? "";
        i++;
        break;
      }
      case "--blogroll": {
        params.blogroll = true;
        break;
      }
      default:
        fatal(`unexpected argument: ${args[i]}`);
    }
  }

  if (subcommand === "build") {
    await build(params);
  } else if (subcommand === "watch") {
    await watch(params);
  } else {
    fatal("subcommand required");
  }
}

function fatal(message: string) {
  console.error(message);
  process.exit(1);
}

async function watch(params: { filter: string; profile: boolean }) {
  let signal = Promise.withResolvers();
  (async () => {
    let build_id = 0;
    while (await signal.promise) {
      signal = Promise.withResolvers();
      console.log(`rebuild #${build_id}`);
      build_id += 1;
      await build({
        blogroll: false,
        update: true,
        spell: false,
        profile: params.profile || false,
        filter: params.filter,
      });
    }
  })();

  signal.resolve(true);

  const rebuild_debounced = debounce(
    () => signal.resolve(true),
    16,
  );

  await new Promise<void>((resolve) => {
    const watcher = watch_fs("./content", { recursive: true }, () => rebuild_debounced());
    process.once("SIGINT", () => { watcher.close(); resolve(); });
  });
  signal.resolve(false);
}

class Ctx {
  constructor(
    public read_ms: number = 0,
    public parse_ms: number = 0,
    public render_ms: number = 0,
    public collect_ms: number = 0,
    public total_ms: number = 0,
  ) {}
}

async function build(params: {
  blogroll: boolean;
  update: boolean;
  spell: boolean;
  profile: boolean;
  filter: string;
}) {
  const t = performance.now();

  const ctx = new Ctx();

  if (!params.update) {
    try {
      await rm("./out/www", { recursive: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }
  await mkdir("./out/www", { recursive: true });

  const posts = await collect_posts(ctx, params.filter);
  await update_file(
    "out/www/index.html",
    html_ugly(PostList({ posts })),
  );
  await update_file("out/www/feed.xml", feed_xml(posts));
  for (const post of posts) {
    await update_file(
      `out/www${post.path}`,
      html_ugly(Post({ post })),
    );
  }

  if (params.blogroll) {
    const blogroll_posts = await blogroll.blogroll();
    await update_file(
      "out/www/blogroll.html",
      html_ugly(BlogRoll({ posts: blogroll_posts })),
    );
  }

  const pages = ["about", "resume", "links", "style"];
  for (const page of pages) {
    const text = await readFile(`content/${page}.dj`, "utf8");
    const ast = await djot.parse(text);
    const html = djot.render(ast, {
      date: page == "resume" ? new Date("May 21, 2024") : undefined,
    });
    await update_file(
      `out/www/${page}.html`,
      html_ugly(Page(page, html)),
    );
  }

  const redirects = [
    ["/2024/09/32/-what-is-io-uring.html", "/2024/09/23/what-is-io-uring.html"],
  ];

  for (const [from, to] of redirects) {
    await update_file(
      `out/www/${from}`,
      html_ugly(Redirect({ path: to })),
    );
  }

  const paths = [
    "favicon.svg",
    "css/*",
    "assets/icons.svg",
    "assets/about.jpeg",
  ];
  for (const path of paths) {
    await update_path(path);
  }


  ctx.total_ms = performance.now() - t;
  console.log(`${ctx.total_ms}ms`);
  if (params.profile) {
    let profile = "";
    let key: keyof Ctx;
    for (key in ctx) {
      if (profile) profile += " ";
      profile += `${key.slice(0, key.length - 3)}=${ctx[key].toFixed(2)}ms`;
    }
    console.log(profile);
  }
}

function dirname(path: string): string {
  return path.substring(0, path.lastIndexOf("/"));
}

async function update_file(path: string, content: Uint8Array | string) {
  if (!content) return;
  await mkdir(path_dirname(path), { recursive: true });
  await mkdir("./out/tmp", { recursive: true });
  const temp = await mkdtemp(join("./out/tmp", "write-"));
  const temp_file = join(temp, "content");
  if (content instanceof Uint8Array) {
    await writeFile(temp_file, content);
  } else {
    await writeFile(temp_file, content);
  }
  await rename(temp_file, path);
  await rm(temp, { recursive: true });
}

async function update_path(path: string) {
  if (path.endsWith("*")) {
    const dir = path.replace("*", "");
    const futs = [];
    for (const entry of await readdir(`content/${dir}`, { withFileTypes: true })) {
      if (entry.isFile()) {
        futs.push(update_path(`${dir}/${entry.name}`));
      }
    }
    await Promise.all(futs);
  } else {
    await update_file(
      `out/www/${path}`,
      await readFile(`content/${path}`),
    );
  }
}

export type Post = {
  year: number;
  month: number;
  day: number;
  slug: string;
  date: Date;
  title: string;
  path: string;
  src: string;
  content: HtmlString;
  summary: string;
};

async function collect_posts(ctx: Ctx, filter: string): Promise<Post[]> {
  const start = performance.now();
  const posts = [];
  for await (const file_path of walk("./content/posts/")) {
    if (!file_path.endsWith(".dj")) continue;
    if (filter !== "") {
      if (file_path.indexOf(filter) === -1) continue;
    }
    const [, y, m, d, slug] = file_path.match(
      /^.*(\d\d\d\d)-(\d\d)-(\d\d)-(.*)\.dj$/,
    )!;
    const [year, month, day] = [y, m, d].map((it) => parseInt(it, 10));
    const date = new Date(Date.UTC(year, month - 1, day));

    let t = performance.now();
    const text = await readFile(file_path, "utf8");
    ctx.read_ms += performance.now() - t;

    t = performance.now();
    const ast = djot.parse(text);
    ctx.parse_ms += performance.now() - t;

    t = performance.now();
    const render_ctx = { date, summary: undefined, title: undefined };
    const html = djot.render(ast, render_ctx);
    ctx.render_ms += performance.now() - t;

    posts.push({
      year,
      month,
      day,
      slug,
      date,
      title: render_ctx.title!,
      content: html,
      summary: render_ctx.summary!,
      path: `/${y}/${m}/${d}/${slug}.html`,
      src: `/content/posts/${y}-${m}-${d}-${slug}.dj`,
    });
  }
  posts.sort((l, r) => l.path < r.path ? 1 : -1);
  ctx.collect_ms = performance.now() - start;
  return posts;
}

async function* walk(root: string): AsyncIterableIterator<string> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

if (import.meta.main) await main();
