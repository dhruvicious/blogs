# dhruvicious-blogs

A custom static blog generator and site, built with Bun and TypeScript. It includes a small JSX-like rendering system in `src/tsx.ts`, Djot content rendering, syntax highlighting, Atom feed generation, and a static file build.

## Run locally

```console
$ SITE_URL=http://localhost:8000 bun run build
$ python3 -m http.server 8000 --directory out/www
```

Open <http://localhost:8000>. The feed is available at `/feed.xml`; clicking Subscribe copies its URL.

## Publish with GitHub Pages

In the repository, open **Settings → Pages** and select **GitHub Actions** as the publishing source. Push to `main`; the workflow builds and deploys the site. You can also start a deployment from the **Actions** tab with **Run workflow**.

The workflow gets the Pages URL and base path from GitHub. Set `blogs.bedhruvicious.co.in` as the custom domain in **Settings → Pages** and add a DNS `CNAME` record for host `blogs` pointing to `dhruvicious.github.io`. Once GitHub verifies the DNS record, the site and Atom feed will use `https://blogs.bedhruvicious.co.in/` and `https://blogs.bedhruvicious.co.in/feed.xml`.

Write posts as `.dj` files in `content/posts/`. Update the starter pages in `content/` and site identity settings in `src/site.ts`.
