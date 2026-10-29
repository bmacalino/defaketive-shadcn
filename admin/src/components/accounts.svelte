<script lang="ts">
	import SearchIcon from '@lucide/svelte/icons/search';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import ShieldOffIcon from '@lucide/svelte/icons/shield-off';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { json } from '#lib/api.js';
	import EmptyState from '#lib/components/app/empty-state.svelte';
	import {
		AlertDialog,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '#lib/components/ui/alert-dialog/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card } from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#lib/components/ui/table/index.js';
	import { adminApi } from '../session.svelte.js';
	import type { AdminAccount, AdminAccounts } from '../types.js';

	// Every account on the site, with what an admin may do to it (admin_api.py says what is refused, and why).
	let found = $state<AdminAccounts | null>(null);
	let failed = $state('');
	let query = $state('');
	let searched = $state('');
	let busy = $state(false);
	/** The account a pop-up asks about, and what it asks. */
	let asking = $state<{ account: AdminAccount; action: 'promote' | 'demote' | 'delete' } | null>(null);

	let requestId = 0;
	async function load(q = query.trim()) {
		const id = ++requestId;
		failed = '';
		try {
			const answer = await adminApi<AdminAccounts>(`/api/admin/accounts?q=${encodeURIComponent(q)}`);
			if (id !== requestId) return;
			found = answer;
			searched = q;
		} catch (error) {
			if (id === requestId) failed = (error as Error).message;
		}
	}
	load();

	// Search as the admin types, a moment after they stop.
	let timer: ReturnType<typeof setTimeout> | undefined;
	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(() => load(), 250);
	}

	const joined = (iso: string) =>
		iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

	const QUESTIONS = {
		promote: {
			title: (name: string) => `Make ${name} an admin?`,
			body: 'They will be able to sign in to this admin app: see every account, change roles, delete accounts and change the daily limits. Admin accounts are admin-only, so they will no longer be able to use the shopping app.',
			button: 'Make admin'
		},
		demote: {
			title: (name: string) => `Remove ${name}'s admin role?`,
			body: 'They keep their account, History and Wishlist and can use the shopping app again, but can no longer sign in here.',
			button: 'Remove admin'
		},
		delete: {
			title: (name: string) => `Delete ${name}'s account?`,
			body: 'This deletes the account with its History and Wishlist. It can\'t be undone. Saved reports stay, because they belong to everyone.',
			button: 'Delete account'
		}
	} as const;

	async function confirm() {
		if (!asking) return;
		const { account, action } = asking;
		busy = true;
		try {
			if (action === 'delete') {
				await adminApi(`/api/admin/accounts/${account.id}`, { method: 'DELETE' });
				toast.success(`${account.name}'s account was deleted.`);
			} else {
				await adminApi(`/api/admin/accounts/${account.id}/role`, json('PUT', { admin: action === 'promote' }));
				toast.success(action === 'promote' ? `${account.name} is now an admin.` : `${account.name} is now a shopper.`);
			}
			asking = null;
			await load(searched);
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			busy = false;
		}
	}
</script>

{#snippet role(account: AdminAccount)}
	{#if account.admin}<Badge><ShieldCheckIcon /> Admin</Badge>{:else}<Badge variant="outline">Shopper</Badge>{/if}
{/snippet}

{#snippet actions(account: AdminAccount)}
	{#if account.you}
		<span class="text-muted-foreground text-sm">This is you</span>
	{:else}
		<div class="flex flex-wrap items-center gap-2">
			{#if account.admin}
				<Button variant="outline" size="sm" onclick={() => (asking = { account, action: 'demote' })}><ShieldOffIcon /> Remove admin</Button>
			{:else}
				<Button variant="outline" size="sm" onclick={() => (asking = { account, action: 'promote' })}><ShieldCheckIcon /> Make admin</Button>
				<Button variant="ghost" size="sm" class="text-destructive hover:text-destructive" onclick={() => (asking = { account, action: 'delete' })} aria-label="Delete {account.name}'s account">
					<Trash2Icon /> Delete
				</Button>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div class="grid w-full gap-2 sm:max-w-sm">
			<Label for="admin-search">Search accounts</Label>
			<div class="relative">
				<SearchIcon class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
				<Input id="admin-search" type="search" class="pl-9" placeholder="Name or email" bind:value={query} oninput={onSearch} />
			</div>
		</div>
		{#if found}
			<p class="text-muted-foreground text-sm" aria-live="polite">
				{found.total} {found.total === 1 ? 'account' : 'accounts'} · {found.admins} {found.admins === 1 ? 'admin' : 'admins'}
				{#if searched}· {found.accounts.length} {found.accounts.length === 1 ? 'matches' : 'match'}{/if}
			</p>
		{/if}
	</div>

	{#if failed && !found}
		<EmptyState art="error" title="The accounts couldn't be loaded" description={failed}>
			{#snippet actions()}<Button onclick={() => load()}>Try again</Button>{/snippet}
		</EmptyState>
	{:else if !found}
		<div class="grid gap-2" role="status" aria-label="Loading accounts">
			{#each [0, 1, 2, 3] as row (row)}<Skeleton class="h-12 w-full" />{/each}
		</div>
	{:else if !found.accounts.length}
		<EmptyState art="search" title="No accounts match" description="Try part of a name or an email address.">
			{#snippet actions()}<Button variant="outline" onclick={() => ((query = ''), load(''))}>Clear the search</Button>{/snippet}
		</EmptyState>
	{:else}
		<!-- Wide screens: one table. Phones: a card per account. -->
		<Card class="hidden py-0 md:block">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead class="pl-4">Name</TableHead>
						<TableHead>Email</TableHead>
						<TableHead>Joined</TableHead>
						<TableHead class="text-right">History</TableHead>
						<TableHead class="text-right">Wishlist</TableHead>
						<TableHead class="text-right">Checks today</TableHead>
						<TableHead>Role</TableHead>
						<TableHead class="pr-4"><span class="sr-only">Actions</span></TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each found.accounts as account (account.id)}
						<TableRow data-account={account.email}>
							<TableCell class="max-w-48 truncate pl-4 font-medium" title={account.name}>{account.name}</TableCell>
							<TableCell class="text-muted-foreground max-w-64 truncate" title={account.email}>{account.email}</TableCell>
							<TableCell class="text-muted-foreground whitespace-nowrap">{joined(account.joined)}</TableCell>
							<TableCell class="text-right tabular-nums">{account.history}</TableCell>
							<TableCell class="text-right tabular-nums">{account.wishlist}</TableCell>
							<TableCell class="text-right tabular-nums">{account.checks_today}</TableCell>
							<TableCell>{@render role(account)}</TableCell>
							<TableCell class="pr-4">{@render actions(account)}</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</Card>

		<ul class="grid grid-cols-1 gap-3 md:hidden" aria-label="Accounts">
			{#each found.accounts as account (account.id)}
				<li class="min-w-0" data-account={account.email}>
					<Card class="gap-3 p-4">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<p class="truncate font-medium">{account.name}</p>
								<p class="text-muted-foreground truncate text-sm">{account.email}</p>
							</div>
							{@render role(account)}
						</div>
						<p class="text-muted-foreground text-sm">
							Joined {joined(account.joined)} · History {account.history} · Wishlist {account.wishlist} · {account.checks_today} today
						</p>
						{@render actions(account)}
					</Card>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<AlertDialog open={asking !== null} onOpenChange={(value) => !value && !busy && (asking = null)}>
	<AlertDialogContent>
		{#if asking}
			{@const question = QUESTIONS[asking.action]}
			<AlertDialogHeader>
				<AlertDialogTitle>{question.title(asking.account.name)}</AlertDialogTitle>
				<AlertDialogDescription>
					<span class="text-foreground font-medium">{asking.account.email}</span>. {question.body}
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
				<Button variant={asking.action === 'promote' ? 'default' : 'destructive'} disabled={busy} onclick={confirm}>
					{#if busy}<Spinner />{/if} {question.button}
				</Button>
			</AlertDialogFooter>
		{/if}
	</AlertDialogContent>
</AlertDialog>
