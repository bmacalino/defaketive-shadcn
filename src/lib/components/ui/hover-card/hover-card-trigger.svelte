<script lang="ts">
	import { LinkPreview as HoverCardPrimitive } from "bits-ui";

	let {
		ref = $bindable(null),
		children,
		child: _child,
		...restProps
	}: HoverCardPrimitive.TriggerProps = $props();
</script>

<!--
	DeFaketive: bits-ui marks this link role="button" with a pop-up, so a screen reader would announce a plain
	link as a button. The preview is only an extra, so the link stays a link.
-->
<HoverCardPrimitive.Trigger bind:ref data-slot="hover-card-trigger" {...restProps}>
	{#snippet child({ props })}
		<a {...props} role={undefined} aria-haspopup={undefined} aria-expanded={undefined} aria-controls={undefined}>
			{@render children?.()}
		</a>
	{/snippet}
</HoverCardPrimitive.Trigger>
