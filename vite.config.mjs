// `vite` serves @reactivescript/runtime 0.1.0 exactly as published (the bug).
// `vite --mode fixed` applies the one-line fix proposed in solidjs/reactivescript#50 to the same file.
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

// The published line (node_modules/@reactivescript/runtime/dist/web.js), and the fix: unwrap the store
// accessor before handing it to Solid's affects(), as `refresh` on the line above already does.
const BUG = "affects: (get) => affects(get),";
const FIX = "affects: (get) => affects(storeAccs.has(get) ? get() : get),";

function applyFix() {
	return {
		name: "reactivescript-affects-fix",
		enforce: "pre",
		transform(code, id) {
			if (!/[\/]@reactivescript[\/]runtime[\/]dist[\/]web\.js$/.test(id.split("?")[0])) return;
			if (!code.includes(BUG)) throw new Error(`fix not applied: "${BUG}" is not in ${id}`);
			return code.replace(BUG, FIX);
		},
	};
}

export default defineConfig(({ mode }) => ({
	define: { __FIXED__: JSON.stringify(mode === "fixed") },
	// Served from node_modules as is, not pre-bundled, so the transform above sees the runtime's own file.
	optimizeDeps: { exclude: ["@reactivescript/runtime"] },
	server: { port: mode === "fixed" ? 5174 : 5173, strictPort: true },
	preview: { port: mode === "fixed" ? 4174 : 4173, strictPort: true },
	plugins: [...(mode === "fixed" ? [applyFix()] : []), solid()],
}));
