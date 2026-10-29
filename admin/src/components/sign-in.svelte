<script lang="ts">
	import { ApiError } from '#lib/api.js';
	import PasswordInput from '#lib/components/app/password-input.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#lib/components/ui/card/index.js';
	import { Field, FieldError, FieldGroup, FieldLabel } from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { session } from '../session.svelte.js';

	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!email.trim() || !password) {
			error = 'Enter your email and password.';
			return;
		}
		busy = true;
		error = '';
		try {
			await session.signIn(email.trim(), password);
		} catch (problem) {
			error = problem instanceof ApiError ? problem.message : 'The server could not be reached. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<div class="grid flex-1 place-items-center py-8">
	<Card class="w-full max-w-sm">
		<CardHeader>
			<CardTitle class="text-xl"><h1>Admin sign-in</h1></CardTitle>
			<CardDescription>For the DTI staff who run DeFaketive. Shopper accounts can't sign in here.</CardDescription>
		</CardHeader>
		<CardContent>
			{#if session.notice}
				<p class="bg-muted mb-4 rounded-lg px-3 py-2 text-sm" role="status">{session.notice}</p>
			{/if}
			<form onsubmit={submit} novalidate class="grid gap-4">
				<FieldGroup>
					<Field data-invalid={error ? true : undefined}>
						<FieldLabel for="admin-email">Email</FieldLabel>
						<Input id="admin-email" name="email" type="email" autocomplete="username" bind:value={email} aria-invalid={error ? true : undefined} />
					</Field>
					<Field data-invalid={error ? true : undefined}>
						<FieldLabel for="admin-password">Password</FieldLabel>
						<PasswordInput id="admin-password" name="password" autocomplete="current-password" bind:value={password} invalid={!!error} />
						{#if error}<FieldError>{error}</FieldError>{/if}
					</Field>
				</FieldGroup>
				<Button type="submit" disabled={busy}>{#if busy}<Spinner />{/if} Sign in</Button>
			</form>
		</CardContent>
	</Card>
</div>
