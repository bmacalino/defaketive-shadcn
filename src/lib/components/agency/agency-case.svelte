<script lang="ts">
	import NotebookPenIcon from '@lucide/svelte/icons/notebook-pen';
	import { toast } from 'svelte-sonner';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '#lib/components/ui/dialog/index.js';
	import * as Select from '#lib/components/ui/select/index.js';
	import { Spinner } from '#lib/components/ui/spinner/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { MAX_NOTE, saveCase, STATUSES, statusLabel } from '#lib/agency.js';
	import type { AgencyCase, AgencyStatus } from '#lib/types.js';

	// Where one listing stands for this agency account, and its private note. Kept by the server per account
	// (agency_api.save_case); nobody else sees it, and it never prints.
	let {
		link,
		name,
		value: given = null,
		id,
		onsaved,
		showNote = true
	}: {
		link: string;
		name: string;
		value?: AgencyCase | null;
		id: string;
		/** After a save, so the page can keep its list (and its status filter) up to date. */
		onsaved?: (value: AgencyCase | null) => void;
		/** Show the note's text under the controls. The watch list shows it itself, below its row of buttons. */
		showNote?: boolean;
	} = $props();

	let value = $state<AgencyCase | null>(null);
	$effect.pre(() => {
		value = given;
	});
	let open = $state(false);
	let draft = $state('');
	let busy = $state(false);

	async function save(status: AgencyStatus, note: string) {
		busy = true;
		try {
			value = await saveCase(link, status, note);
			onsaved?.(value);
			return true;
		} catch (error) {
			toast.error((error as Error).message);
			return false;
		} finally {
			busy = false;
		}
	}

	// The menu cannot hold an empty value (it reads as "nothing chosen"), so "No status" is "none" in the menu only.
	const NONE = 'none';
	async function choose(picked: string) {
		const status = (picked === NONE ? '' : picked) as AgencyStatus;
		if (status === (value?.status ?? '')) return;
		if (await save(status, value?.note ?? '')) toast(`Status: ${statusLabel(status)}.`);
	}

	function edit() {
		draft = value?.note ?? '';
		open = true;
	}

	async function keep(event: SubmitEvent) {
		event.preventDefault();
		if (await save(value?.status ?? '', draft)) {
			open = false;
			toast(draft.trim() ? 'Note saved.' : 'Note removed.');
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2" data-print="hide">
	<Select.Root type="single" value={value?.status || NONE} onValueChange={choose}>
		<Select.Trigger id="{id}-status" size="sm" class="w-40" disabled={busy}>
			<span class="sr-only">Case status for {name}: </span>{statusLabel(value?.status)}
		</Select.Trigger>
		<Select.Content>
			{#each STATUSES as status (status.value)}<Select.Item value={status.value || NONE} label={status.label}>{status.label}</Select.Item>{/each}
		</Select.Content>
	</Select.Root>
	<Button variant="ghost" size="sm" onclick={edit}>
		<NotebookPenIcon /> {value?.note ? 'Edit note' : 'Add note'}<span class="sr-only"> for {name}</span>
	</Button>
</div>
{#if showNote && value?.note}
	<p class="text-muted-foreground line-clamp-2 text-sm whitespace-pre-line" data-print="hide">
		<span class="text-foreground font-medium">Your note:</span> {value.note}
	</p>
{/if}

<Dialog bind:open>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Your note</DialogTitle>
			<DialogDescription>Only this account sees it. It is not printed and not shared.</DialogDescription>
		</DialogHeader>
		<form class="grid gap-3" onsubmit={keep}>
			<label class="sr-only" for="{id}-note">Note for {name}</label>
			<Textarea id="{id}-note" rows={6} maxlength={MAX_NOTE} bind:value={draft} placeholder="What you checked, who you asked, what happens next" />
			<p class="text-muted-foreground text-xs" aria-live="polite">{draft.length.toLocaleString()} of {MAX_NOTE.toLocaleString()} characters</p>
			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit" disabled={busy}>{#if busy}<Spinner />{/if}Save note</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
