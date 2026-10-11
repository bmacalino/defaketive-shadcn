<script lang="ts">
	import { page } from '$app/state';
	import ReportView from '#lib/components/report/report-view.svelte';
</script>

<ReportView link={page.url.searchParams.get('link') ?? ''} guest />
