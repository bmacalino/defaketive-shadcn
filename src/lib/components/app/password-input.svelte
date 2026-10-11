<script lang="ts">
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '#lib/components/ui/input-group/index.js';

	let {
		value = $bindable(''),
		id,
		name,
		autocomplete,
		placeholder,
		invalid = false,
		minlength
	}: {
		value?: string;
		id: string;
		name: string;
		autocomplete: 'current-password' | 'new-password';
		placeholder?: string;
		invalid?: boolean;
		minlength?: number;
	} = $props();

	let shown = $state(false);
</script>

<InputGroup>
	<InputGroupInput
		{id}
		{name}
		{placeholder}
		{autocomplete}
		{minlength}
		type={shown ? 'text' : 'password'}
		bind:value
		aria-invalid={invalid}
	/>
	<InputGroupAddon align="inline-end">
		<InputGroupButton
			size="icon-xs"
			aria-label={shown ? 'Hide password' : 'Show password'}
			aria-pressed={shown}
			onclick={() => (shown = !shown)}
		>
			{#if shown}<EyeOffIcon />{:else}<EyeIcon />{/if}
		</InputGroupButton>
	</InputGroupAddon>
</InputGroup>
