<script lang="ts">
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import { ModeWatcher } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import ThemeToggle from '#lib/components/app/theme-toggle.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Toaster } from '#lib/components/ui/sonner/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '#lib/components/ui/tabs/index.js';
	import Accounts from './components/accounts.svelte';
	import Limits from './components/limits.svelte';
	import Mark from './components/mark.svelte';
	import PasswordDialog from './components/password-dialog.svelte';
	import SignIn from './components/sign-in.svelte';
	import { session } from './session.svelte.js';

	session.load();

	// The open tab is in the address (?tab=limits), so a reload opens the same one.
	let tab = $state(new URL(location.href).searchParams.get('tab') === 'limits' ? 'limits' : 'accounts');
	$effect(() => {
		const url = new URL(location.href);
		if (tab === 'limits') url.searchParams.set('tab', 'limits');
		else url.searchParams.delete('tab');
		if (url.href !== location.href) history.replaceState(history.state, '', url);
	});

	// Another admin may have removed this account's role meanwhile: check again on a tab switch or a return.
	function recheck() {
		if (session.me) session.load();
	}

	let passwordOpen = $state(false);

	async function signOut() {
		try {
			await session.signOut();
			toast("You're signed out.");
		} catch (error) {
			toast.error((error as Error).message);
		}
	}
</script>

<svelte:window onfocus={recheck} />
<ModeWatcher />
<Toaster position="bottom-right" />

<div class="flex min-h-svh flex-col">
	<header class="bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
		<div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
			<Mark />
			<Badge variant="secondary">Admin</Badge>
			<div class="ml-auto flex items-center gap-1">
				{#if session.me}
					<span class="text-muted-foreground hidden max-w-56 truncate text-sm md:inline" title={session.me.email}>{session.me.name}</span>
					<Button variant="ghost" size="sm" onclick={() => (passwordOpen = true)}><KeyRoundIcon /> <span class="hidden sm:inline">Change password</span><span class="sr-only sm:hidden">Change password</span></Button>
					<Button variant="ghost" size="sm" onclick={signOut}><LogOutIcon /> <span class="hidden sm:inline">Sign out</span><span class="sr-only sm:hidden">Sign out</span></Button>
				{/if}
				<ThemeToggle />
			</div>
		</div>
	</header>

	<main class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
		{#if !session.ready}
			<div class="text-muted-foreground grid min-h-[50svh] place-items-center text-center" role="status">
				<span class="flex items-center gap-2 text-sm"><Spinner /> Opening the admin app…</span>
			</div>
		{:else if session.unreachable && !session.me}
			<EmptyState art="error" title="The server didn't answer" description="Check that DeFaketive's server is running, then try again.">
				{#snippet actions()}<Button onclick={() => session.load()}>Try again</Button>{/snippet}
			</EmptyState>
		{:else if !session.me}
			<SignIn />
		{:else}
			<header class="space-y-1">
				<h1 class="text-3xl font-semibold tracking-tight">Admin</h1>
				<p class="text-muted-foreground">Manage the accounts on DeFaketive and how many new checks can start each day.</p>
			</header>

			<Tabs bind:value={tab} onValueChange={recheck} class="gap-6">
				<TabsList>
					<TabsTrigger value="accounts">Accounts</TabsTrigger>
					<TabsTrigger value="limits">Daily limits</TabsTrigger>
				</TabsList>
				<TabsContent value="accounts"><Accounts /></TabsContent>
				<TabsContent value="limits"><Limits /></TabsContent>
			</Tabs>
		{/if}
	</main>
</div>

<PasswordDialog bind:open={passwordOpen} />
