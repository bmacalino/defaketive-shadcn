<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { api, ApiError, json } from '#lib/api.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogHeader,
		DialogTitle
	} from '#lib/components/ui/dialog/index.js';
	import {
		AlertDialog,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle
	} from '#lib/components/ui/alert-dialog/index.js';
	import { Field, FieldError, FieldGroup, FieldLabel } from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { forgetAccount } from '#lib/session.js';
	import { auth } from '#lib/stores/auth.svelte.js';
	import { library } from '#lib/stores/library.svelte.js';
	import { ui } from '#lib/stores/ui.svelte.js';
	import type { Me } from '#lib/types.js';
	import PasswordInput from './password-input.svelte';

	// The three pop-ups on the Settings page. `open` says which one is showing.
	let { open = $bindable<'' | 'edit' | 'clear' | 'delete'>('') }: { open?: '' | 'edit' | 'clear' | 'delete' } = $props();

	let fullName = $state('');
	let email = $state('');
	let newPassword = $state('');
	let currentPassword = $state('');
	let busy = $state(false);
	let errors = $state<Record<string, string>>({});
	let formError = $state('');

	// Fill the edit form with the current details each time it opens.
	$effect(() => {
		if (open === 'edit') {
			fullName = auth.user?.name ?? '';
			email = auth.user?.email ?? '';
		}
		if (open) {
			newPassword = currentPassword = '';
			errors = {};
			formError = '';
		}
	});

	async function send(action: () => Promise<void>) {
		errors = {};
		formError = '';
		busy = true;
		try {
			await action();
		} catch (error) {
			const failure = error as ApiError;
			const fields = (failure.body?.fields ?? {}) as Record<string, string>;
			if (Object.keys(fields).length) errors = fields;
			else formError = failure.message;
		} finally {
			busy = false;
		}
	}

	function save(event: SubmitEvent) {
		event.preventDefault();
		return send(async () => {
			const body: Record<string, string> = { full_name: fullName, email, current_password: currentPassword };
			if (newPassword) body.new_password = newPassword;
			auth.apply(await api<Me>('/api/auth/account', json('PATCH', body)));
			open = '';
			toast('Your account was updated.');
		});
	}

	function remove(event: SubmitEvent) {
		event.preventDefault();
		return send(async () => {
			// Leaving on purpose: the app must not ask this person to sign back in on the way out.
			ui.leaving = true;
			try {
				auth.apply(await api<Me>('/api/auth/account', json('DELETE', { current_password: currentPassword })));
				open = '';
				forgetAccount();
				toast('Your account was deleted.');
				await goto('/');
			} finally {
				ui.leaving = false;
			}
		});
	}

	async function clear() {
		const done = await library.clearHistory();
		if (done) open = '';
	}
</script>

<Dialog open={open === 'edit'} onOpenChange={(value) => !value && (open = '')}>
	<DialogContent class="max-h-[calc(100svh-2rem)] overflow-y-auto">
		<DialogHeader>
			<DialogTitle class="text-xl">Edit account</DialogTitle>
			<DialogDescription>Change your name, email or password.</DialogDescription>
		</DialogHeader>
		<form onsubmit={save} class="grid gap-4" novalidate>
			<FieldGroup class="gap-4">
				<Field data-invalid={!!errors.full_name}>
					<FieldLabel for="acc-name">Full name</FieldLabel>
					<Input id="acc-name" name="full_name" autocomplete="name" maxlength={100} bind:value={fullName} aria-invalid={!!errors.full_name} />
					{#if errors.full_name}<FieldError>{errors.full_name}</FieldError>{/if}
				</Field>
				<Field data-invalid={!!errors.email}>
					<FieldLabel for="acc-email">Email</FieldLabel>
					<Input id="acc-email" name="email" type="email" autocomplete="email" bind:value={email} aria-invalid={!!errors.email} />
					{#if errors.email}<FieldError>{errors.email}</FieldError>{/if}
				</Field>
				<Field data-invalid={!!errors.new_password}>
					<FieldLabel for="acc-new">New password (leave empty to keep yours)</FieldLabel>
					<PasswordInput id="acc-new" name="new_password" autocomplete="new-password" placeholder="At least 8 characters" minlength={8} bind:value={newPassword} invalid={!!errors.new_password} />
					{#if errors.new_password}<FieldError>{errors.new_password}</FieldError>{/if}
				</Field>
				<Field data-invalid={!!errors.current_password}>
					<FieldLabel for="acc-current">Current password</FieldLabel>
					<PasswordInput id="acc-current" name="current_password" autocomplete="current-password" placeholder="Needed to save your changes" bind:value={currentPassword} invalid={!!errors.current_password} />
					{#if errors.current_password}<FieldError>{errors.current_password}</FieldError>{/if}
				</Field>
			</FieldGroup>
			{#if formError}<p class="text-destructive text-sm" role="alert">{formError}</p>{/if}
			<Button type="submit" size="lg" disabled={busy}>
				{#if busy}<Spinner />{/if}{busy ? 'Saving…' : 'Save changes'}
			</Button>
		</form>
	</DialogContent>
</Dialog>

<AlertDialog open={open === 'clear'} onOpenChange={(value) => !value && (open = '')}>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Clear your scan history?</AlertDialogTitle>
			<AlertDialogDescription>
				This empties Scan History and your Home page. Products in your wishlist stay saved. This can't be undone.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel>Cancel</AlertDialogCancel>
			<Button variant="destructive" onclick={clear}>Clear history</Button>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>

<Dialog open={open === 'delete'} onOpenChange={(value) => !value && (open = '')}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle class="text-xl">Delete your account?</DialogTitle>
			<DialogDescription>
				Your account, scan history and wishlist will be removed for good. This can't be undone.
			</DialogDescription>
		</DialogHeader>
		<form onsubmit={remove} class="grid gap-4" novalidate>
			<Field data-invalid={!!errors.current_password}>
				<FieldLabel for="del-current">Current password</FieldLabel>
				<PasswordInput id="del-current" name="current_password" autocomplete="current-password" placeholder="Type your password to confirm" bind:value={currentPassword} invalid={!!errors.current_password} />
				{#if errors.current_password}<FieldError>{errors.current_password}</FieldError>{/if}
			</Field>
			{#if formError}<p class="text-destructive text-sm" role="alert">{formError}</p>{/if}
			<div class="flex justify-end gap-2">
				<Button type="button" variant="outline" onclick={() => (open = '')}>Cancel</Button>
				<Button type="submit" variant="destructive" disabled={busy}>
					{#if busy}<Spinner />{/if}{busy ? 'Deleting…' : 'Delete my account'}
				</Button>
			</div>
		</form>
	</DialogContent>
</Dialog>
