// GitHub Pages supplies the public URL and base path during deployment.
export const site_name = "dhruvicious-blogs";
export const site_author = "Dhruv Khatri";
export const site_url = (Bun.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
export const site_base_path = (Bun.env.SITE_BASE_PATH ?? new URL(site_url).pathname)
  .replace(/\/+$/, "");
export const site_github = "https://github.com/dhruvicious";
export const site_repo = "";
export const site_email = "dhruvkhatri1234@icloud.com";
