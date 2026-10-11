import { toast } from 'svelte-sonner';

// Preferences stay on this browser: a notice or a clipboard read is a permission
// the browser gives to one device, not to an account. Dark mode is handled by
// mode-watcher, the way shadcn-svelte does it.
const KEYS = { alerts: 'defaketive-scan-alerts', clipboard: 'defaketive-clipboard-fill' };

const canNotify = () => typeof Notification !== 'undefined';
const canReadClipboard = () =>
	typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText);

function stored(name: keyof typeof KEYS) {
	try {
		return localStorage.getItem(KEYS[name]) === 'on';
	} catch {
		return false;
	}
}
function store(name: keyof typeof KEYS, on: boolean) {
	try {
		localStorage.setItem(KEYS[name], on ? 'on' : 'off');
	} catch {
		/* the setting lasts for this visit */
	}
}

class Prefs {
	alerts = $state(false);
	clipboard = $state(false);
	alertsNote = $state('');
	clipboardNote = $state('');

	start() {
		this.alerts = stored('alerts') && canNotify() && Notification.permission === 'granted';
		this.clipboard = stored('clipboard') && canReadClipboard();
	}

	async toggleAlerts() {
		if (this.alerts) {
			this.alerts = false;
			store('alerts', false);
			this.alertsNote = '';
			return;
		}
		if (!canNotify()) {
			this.alertsNote = "This browser can't show notices, so scan alerts stay off.";
			return;
		}
		let permission = Notification.permission;
		if (permission === 'default') {
			try {
				permission = await Notification.requestPermission();
			} catch {
				permission = 'denied';
			}
		}
		this.alerts = permission === 'granted';
		store('alerts', this.alerts);
		this.alertsNote = this.alerts
			? ''
			: "Scan alerts are off because your browser is blocking notices from this site. Allow notifications for this site in the browser's settings, then switch this on again.";
		if (this.alerts) toast('Scan alerts are on.');
	}

	async toggleClipboard() {
		if (this.clipboard) {
			this.clipboard = false;
			store('clipboard', false);
			this.clipboardNote = '';
			return;
		}
		if (!canReadClipboard()) {
			this.clipboardNote = "This browser doesn't let websites read what you copied, so this stays off.";
			return;
		}
		// Ask now, while the click is fresh, so the browser shows its permission question here.
		try {
			await navigator.clipboard.readText();
		} catch {
			this.clipboardNote =
				"This stays off because your browser didn't allow reading what you copied. Allow clipboard access for this site in the browser's settings, then switch it on again.";
			return;
		}
		this.clipboard = true;
		store('clipboard', true);
		this.clipboardNote = '';
		toast('On. A product link you copy will be waiting in the link box on Home.');
	}

	/** The browser notice for a scan that finished while you were doing something else. */
	notify(title: string, body: string) {
		if (!this.alerts) return;
		try {
			const notice = new Notification(title, { body, tag: 'defaketive-scan' });
			notice.onclick = () => {
				window.focus();
				notice.close();
			};
		} catch {
			/* Some phones only allow notices from an installed app. */
		}
	}
}

export const prefs = new Prefs();
