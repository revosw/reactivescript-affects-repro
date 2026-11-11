import { createApp } from "@reactivescript/runtime";
import * as api from "./api.ts";
import main from "./App.rx";

declare const __FIXED__: boolean;

const variant = document.getElementById("variant")!;
const prod = import.meta.env.PROD ? ", production build" : ", dev build";
variant.innerHTML = __FIXED__
	? `<span class="variant fixed">@reactivescript/runtime 0.1.0 + the fix from #50${prod}</span>`
	: `<span class="variant bug">@reactivescript/runtime 0.1.0 as published${prod}</span>`;

const app = createApp({ root: document.getElementById("app")!, api });
app.mount(main(app));
