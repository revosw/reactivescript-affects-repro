// Records the repro in Chrome: the published runtime and the fixed one, as a dev server and as a
// production build. For each it saves a video (media/<name>.webm, and .mp4/.gif when ffmpeg is on the
// PATH), three screenshots, and what the page showed at each moment (media/results.json).
//
//   pnpm record                  (uses the installed Google Chrome; CHROME_CHANNEL=chromium for Playwright's)
import { execFileSync, execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { createServer, preview } from "vite";

const root = import.meta.dirname;
const media = path.join(root, "media");
const tmp = path.join(media, ".tmp");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// The production bundles are built first, each in its own process: a dev server started in this process
// sets NODE_ENV=development, and a build after it would then bundle Solid's dev build. Checked below.
for (const [script, outDir] of [["build", "dist"], ["build:fixed", "dist-fixed"]]) {
	execSync(`pnpm -s ${script}`, { cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
	const bundle = readdirSync(path.join(root, outDir, "assets")).filter((f) => f.endsWith(".js"));
	for (const f of bundle)
		if (readFileSync(path.join(root, outDir, "assets", f), "utf8").includes("INVALID_AFFECTS_TARGET"))
			throw new Error(`${outDir}/assets/${f} contains Solid's dev build: not a production bundle`);
}

const variants = [
	{ name: "dev-bug", mode: "development", kind: "dev", port: 5173 },
	{ name: "dev-fixed", mode: "fixed", kind: "dev", port: 5174 },
	{ name: "prod-bug", mode: "production", kind: "prod", port: 4173, outDir: "dist" },
	{ name: "prod-fixed", mode: "fixed", kind: "prod", port: 4174, outDir: "dist-fixed" },
];

async function start(v) {
	if (v.kind === "dev") {
		const server = await createServer({ root, mode: v.mode, server: { port: v.port, strictPort: true } });
		await server.listen();
		return { url: `http://localhost:${v.port}/`, close: () => server.close() };
	}
	const server = await preview({ root, mode: v.mode, build: { outDir: v.outDir }, preview: { port: v.port, strictPort: true } });
	return { url: `http://localhost:${v.port}/`, close: () => new Promise((r) => server.httpServer.close(r)) };
}

const read = (page) =>
	page.evaluate(() => ({
		at: document.getElementById("at")?.textContent ?? "",
		pending: document.getElementById("pending")?.textContent ?? "",
		error: document.getElementById("err")?.textContent ?? "",
		saveCalled: document.getElementById("log")?.textContent.includes("save(") ?? false,
	}));

// A visible click marker, so the video shows when and where the click happened.
async function clickWithMarker(page, selector) {
	const box = await page.locator(selector).boundingBox();
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.evaluate(
		([x, y]) => {
			const dot = document.createElement("div");
			dot.style.cssText = `position:fixed;left:${x - 14}px;top:${y - 14}px;width:28px;height:28px;border-radius:50%;background:rgba(220,40,40,.35);border:2px solid #c22;pointer-events:none;z-index:9`;
			document.body.appendChild(dot);
			setTimeout(() => dot.remove(), 700);
		},
		[x, y],
	);
	await page.mouse.click(x, y);
}

const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL ?? "chrome", headless: true });
const results = { browser: `${browser.browserType().name()} ${browser.version()}`, variants: {} };

for (const v of variants) {
	const server = await start(v);
	const context = await browser.newContext({
		viewport: { width: 800, height: 620 },
		recordVideo: { dir: tmp, size: { width: 800, height: 620 } },
	});
	const page = await context.newPage();
	await page.goto(server.url);
	await page.waitForSelector("#move");
	await page.waitForTimeout(1200);
	const before = await read(page);
	await page.screenshot({ path: path.join(media, `${v.name}-1-before.png`) });
	await clickWithMarker(page, "#move");
	await page.waitForTimeout(300);
	const during = await read(page);
	await page.screenshot({ path: path.join(media, `${v.name}-2-300ms-after-click.png`) });
	await page.waitForTimeout(2700);
	const after = await read(page);
	await page.screenshot({ path: path.join(media, `${v.name}-3-settled.png`) });
	await page.waitForTimeout(800);
	const log = await page.evaluate(() => document.getElementById("log")?.textContent ?? "");
	const video = page.video();
	await context.close();
	renameSync(await video.path(), path.join(media, `${v.name}.webm`));
	await server.close();
	results.variants[v.name] = { before, during, after, log: log.trim().split("\n") };
	console.log(`${v.name}: 300 ms after click ${JSON.stringify(during)}; settled ${JSON.stringify(after)}`);
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
writeFileSync(path.join(media, "results.json"), `${JSON.stringify(results, null, "\t")}\n`);

// MP4 (plays in most viewers) and GIF (plays inline in a GitHub README), if ffmpeg is available.
for (const v of variants) {
	const src = path.join(media, `${v.name}.webm`);
	try {
		execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(media, `${v.name}.mp4`)]);
		execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", "fps=12,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse", path.join(media, `${v.name}.gif`)]);
	} catch (error) {
		console.warn(`ffmpeg: skipped ${v.name} (${error.message.split("\n")[0]})`);
	}
}
console.log(`done: ${results.browser}`);
