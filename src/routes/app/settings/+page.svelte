<script lang="ts">
	import { page } from '$app/state';
	import CompassIcon from '@lucide/svelte/icons/compass';
	import { mode, setMode } from 'mode-watcher';
	import AccountDialogs from '#lib/components/app/account-dialogs.svelte';
	import { Avatar, AvatarFallback } from '#lib/components/ui/avatar/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { initials } from '#lib/product.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { prefs } from '#lib/stores/prefs.svelte.js';
	import { ui } from '#lib/stores/ui.svelte.js';

	// ?edit=1 opens the Edit account pop-up straight away (a link that says "change your password" can point here).
	let dialog = $state<'' | 'edit' | 'clear' | 'delete'>(page.url.searchParams.get('edit') === '1' ? 'edit' : '');
</script>

<svelte:head><title>Settings · DeFaketive</title></svelte:head>

<header class="space-y-1">
	<h1 class="text-3xl font-semibold tracking-tight">Settings</h1>
	<p class="text-muted-foreground">Manage your account and preferences.</p>
</header>

<div class="grid max-w-3xl gap-6">
	<Card class="reveal" aria-labelledby="settings-account">
		<CardHeader><CardTitle id="settings-account">Account</CardTitle></CardHeader>
		<CardContent>
			{#if auth.user}
				<div class="flex items-center gap-4">
					<Avatar class="size-12"><AvatarFallback>{initials(auth.user.name)}</AvatarFallback></Avatar>
					<div class="min-w-0 flex-1">
						<p class="truncate font-medium">{auth.user.name}</p>
						<p class="text-muted-foreground truncate text-sm">{auth.user.email} · Free account</p>
					</div>
					<Button variant="outline" onclick={() => (dialog = 'edit')}>Edit</Button>
				</div>
			{:else}
				<div class="flex flex-wrap items-center gap-4">
					<div class="min-w-0 flex-1">
						<p class="font-medium">You're browsing as a guest</p>
						<p class="text-muted-foreground text-sm">
							{auth.left > 0 ? `${auth.left} free scan${auth.left === 1 ? '' : 's'} left today` : 'No free scans left today'}
						</p>
					</div>
					<div class="flex gap-2">
						<Button variant="outline" onclick={() => ui.openAuth('signin')}>Sign in</Button>
						<Button onclick={() => ui.openAuth('signup')}>Create account</Button>
					</div>
				</div>
			{/if}
		</CardContent>
	</Card>

	<Card class="reveal" style="--i:1" aria-labelledby="settings-prefs">
		<CardHeader>
			<CardTitle id="settings-prefs">Preferences</CardTitle>
			<CardDescription>These stay on this browser.</CardDescription>
		</CardHeader>
		<CardContent class="grid gap-5">
			<div class="flex items-center justify-between gap-4">
				<div class="space-y-0.5">
					<Label for="pref-alerts">Scan alerts</Label>
					<p id="pref-alerts-help" class="text-muted-foreground text-sm">Get a browser notice when your scan finishes</p>
				</div>
				<Switch id="pref-alerts" checked={prefs.alerts} onCheckedChange={() => prefs.toggleAlerts()} aria-describedby="pref-alerts-help" />
			</div>
			{#if prefs.alertsNote}<p class="text-muted-foreground bg-muted rounded-lg px-3 py-2 text-sm" role="status">{prefs.alertsNote}</p>{/if}
			<Separator />
			<div class="flex items-center justify-between gap-4">
				<div class="space-y-0.5">
					<Label for="pref-dark">Dark mode</Label>
					<p id="pref-dark-help" class="text-muted-foreground text-sm">Switch to the dark theme</p>
				</div>
				<Switch id="pref-dark" checked={mode.current === 'dark'} onCheckedChange={(on) => setMode(on ? 'dark' : 'light')} aria-describedby="pref-dark-help" />
			</div>
			<Separator />
			<div class="flex items-center justify-between gap-4">
				<div class="space-y-0.5">
					<Label for="pref-clipboard">Auto-fill from clipboard</Label>
					<p id="pref-clipboard-help" class="text-muted-foreground text-sm">Put a copied Lazada PH link in the link box</p>
				</div>
				<Switch id="pref-clipboard" checked={prefs.clipboard} onCheckedChange={() => prefs.toggleClipboard()} aria-describedby="pref-clipboard-help" />
			</div>
			{#if prefs.clipboardNote}<p class="text-muted-foreground bg-muted rounded-lg px-3 py-2 text-sm" role="status">{prefs.clipboardNote}</p>{/if}
		</CardContent>
	</Card>

	<Card class="reveal" style="--i:2" aria-labelledby="settings-help">
		<CardHeader>
			<CardTitle id="settings-help">Getting started</CardTitle>
			<CardDescription>
				The short guide shown when you created your account.
			</CardDescription>
		</CardHeader>
		<CardContent class="flex-row flex-wrap gap-2">
			<Button variant="outline" onclick={() => (ui.tourOpen = true)}><CompassIcon /> Show the welcome tour</Button>
		</CardContent>
	</Card>

	<Card class="reveal" style="--i:3" aria-labelledby="settings-danger">
		<CardHeader>
			<CardTitle id="settings-danger">Danger zone</CardTitle>
			<CardDescription>These can't be undone.</CardDescription>
		</CardHeader>
		<CardContent class="flex-row flex-wrap gap-2">
			<Button variant="outline" onclick={() => (dialog = 'clear')}>Clear scan history</Button>
			{#if auth.user}
				<Button variant="destructive" onclick={() => (dialog = 'delete')}>Delete account</Button>
			{/if}
		</CardContent>
	</Card>
</div>

<AccountDialogs bind:open={dialog} />
